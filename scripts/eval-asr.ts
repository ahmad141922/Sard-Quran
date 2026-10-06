/**
 * Measures the recitation checker on recordings whose mistakes are known.
 *
 *   npm run eval:asr -- --dir <recordings> --labels <labels.csv> --model <model.onnx> [--out <dir>] [--fresh]
 *
 * Every recording goes through exactly what the browser runs — the same
 * feature extraction, the same model, the same streaming decode in 100 ms
 * pieces with the same tail padding, the same alignment — and is scored by
 * `src/lib/asr/evaluate.ts` against its row in the label file
 * (`docs/competition/test-set-template.csv`).
 *
 * Two things come out:
 *
 * 1. **The app as it ships** — what a reciter would have seen, recording by
 *    recording, and the totals: mistakes caught, where, and false alarms.
 * 2. **The calibration grid** — the same recordings under other settings of
 *    the two knobs (the model's confidence, and the shortest divergence
 *    shown), so a change to either is chosen from measurements.
 *
 * Audio: 16 kHz mono 16-bit WAV is read directly; anything else (a phone's
 * .m4a, .mp3, .ogg) goes through `ffmpeg`, from PATH or $FFMPEG.
 *
 * What the model heard is kept in <out>/heard/, so the grid can be rerun
 * without decoding again; --fresh ignores it.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import * as ort from 'onnxruntime-web';

import { MIN_RUN_UNRATED, reached, type HeardPhoneme } from '@/lib/asr/align';
import {
  candidatesFor, evalAnchor, parseLabel, score, summarise, type Label, type Scored, type Settings, type Summary,
} from '@/lib/asr/evaluate';
import { phonemesFromFile } from '@/lib/asr/phonemes';
import { trimToVerse } from '@/lib/asr/use-asr';
import { basmalaBefore } from '@/lib/asr/review';
import { sourceOfCandidate } from '@/lib/asr/source';
import { Recognizer, SAMPLE_RATE, type OrtLike } from '@/lib/asr/web/recognizer';

const TAIL_PADDING_SECONDS = 0.8; // as in src/lib/asr/web-engine.ts

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const dir = arg('dir');
const labelsPath = arg('labels');
const modelPath = arg('model');
if (!dir || !labelsPath || !modelPath) {
  console.error('usage: npm run eval:asr -- --dir <recordings> --labels <labels.csv> --model <model.onnx> [--out <dir>] [--fresh]');
  process.exit(2);
}
const out = resolve(arg('out') ?? join(dir, 'eval'));
const fresh = process.argv.includes('--fresh');
mkdirSync(join(out, 'heard'), { recursive: true });

// --- audio -------------------------------------------------------------------

function readWav16k(buf: Buffer): Float32Array | null {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== SAMPLE_RATE || fmt.bits !== 16) return null;
      const n = Math.floor(Math.min(size, buf.length - body) / 2);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(body + 2 * i) / 32768;
      return x;
    }
    pos = body + size + (size & 1);
  }
  return null;
}

function decode(path: string): Float32Array {
  const direct = readWav16k(readFileSync(path));
  if (direct) return direct;
  const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', path, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0) {
    throw new Error(`${basename(path)}: not 16 kHz mono WAV, and ffmpeg could not convert it (${r.error?.message ?? r.stderr.toString().trim()})`);
  }
  const pcm = r.stdout;
  const x = new Float32Array(pcm.length / 2);
  for (let i = 0; i < x.length; i++) x[i] = pcm.readInt16LE(2 * i) / 32768;
  return x;
}

// --- recognition, as the browser does it -----------------------------------------

interface Heard { phonemes: HeardPhoneme[]; audioMs: number; inferenceMs: number }

async function hear(recognizer: Recognizer, samples: Float32Array): Promise<Heard> {
  const s = recognizer.createStream();
  const piece = SAMPLE_RATE / 10;
  for (let i = 0; i < samples.length; i += piece) {
    s.acceptWaveform(samples.subarray(i, i + piece));
    await s.decodeAvailable();
  }
  s.inputFinished();
  await s.decodeAvailable();
  return {
    phonemes: s.result().map(h => ({ symbol: h.symbol, confidence: h.prob, atMs: h.atMs })),
    audioMs: (samples.length / SAMPLE_RATE) * 1000,
    inferenceMs: s.inferenceMs,
  };
}

// --- main ------------------------------------------------------------------------

const labels: Label[] = readFileSync(labelsPath, 'utf8').split(/\r?\n/).map(parseLabel).filter((l): l is Label => l !== null);
if (!labels.length) throw new Error(`${labelsPath}: no recordings listed`);

const phonemes = phonemesFromFile(JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8')));
let recognizer: Recognizer | null = null;

const heardBy = new Map<string, Heard>();
for (const l of labels) {
  const cache = join(out, 'heard', `${l.file}.json`);
  if (!fresh && existsSync(cache)) {
    heardBy.set(l.file, JSON.parse(readFileSync(cache, 'utf8')));
    continue;
  }
  recognizer ??= await Recognizer.create(
    ort as unknown as OrtLike, new Uint8Array(readFileSync(modelPath)),
    readFileSync('sard/public/asr/tokens.txt', 'utf8'), { tailPaddingSeconds: TAIL_PADDING_SECONDS },
  );
  const h = await hear(recognizer, decode(join(dir, l.file)));
  writeFileSync(cache, JSON.stringify(h));
  heardBy.set(l.file, h);
  console.error(`heard ${l.file}: ${h.phonemes.length} sounds in ${(h.audioMs / 1000).toFixed(1)} s (×${(h.inferenceMs / h.audioMs).toFixed(2)} real time)`);
}

/*
 * The passage as the app settles it on «stop»: the labelled verses, held
 * against what was heard to see how far the reciter got (`reached`), then
 * trimmed to that verse (`trimToVerse`). Without the trim, a reciter who
 * stopped early would be scored on omissions they never made.
 */
const expectedBy = new Map(labels.map(l => {
  const range = Array.from({ length: l.toAyah - l.fromAyah + 1 }, (_, i) => {
    const ayah = l.fromAyah + i;
    return { surah: l.surah, ayah, anchorId: evalAnchor(l.surah, ayah) };
  });
  const got = reached(phonemes.expected(range), heardBy.get(l.file)!.phonemes);
  const recited = trimToVerse(range, phonemes, got);
  return [l.file, { expected: phonemes.expected(recited), opening: basmalaBefore(phonemes, recited[0]) }];
}));
const expectedFor = (l: Label) => expectedBy.get(l.file)!.expected;
const openingFor = (l: Label) => expectedBy.get(l.file)!.opening;

function run(settings: Settings): { scored: Scored[]; summary: Summary } {
  const scored = labels.map(l => score(l, candidatesFor(expectedFor(l), heardBy.get(l.file)!.phonemes, settings, openingFor(l))));
  return { scored, summary: summarise(scored) };
}

const SHIPPING: Settings = { confidence: false, minConfidence: 0, minRun: MIN_RUN_UNRATED };
const shipping = run(SHIPPING);

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const describe = (s: Settings) => (s.confidence ? `ثقة ≥ ${s.minConfidence} · طول ≥ ${s.minRun}` : `بلا ثقة · طول ≥ ${s.minRun}`);
const where = (anchor: number, word: number | null) => `${Math.floor(anchor / 1000)}:${anchor % 1000}${word === null ? '' : ` ك${word + 1}`}`;

const lines: string[] = [];
const s = shipping.summary;
lines.push('# تقييم التعرّف على التلاوة', '');
lines.push(`${s.recordings} تسجيلًا: ${s.clean} سليمة، ${s.errors} فيها خطأ حفظ، ${s.outOfScope} خطأ مدّ/حركة (خارج ما تدّعيه الأداة).`, '');
lines.push('## الأداة كما تُنشر', '', `الإعداد: ${describe(SHIPPING)}`, '');
lines.push('| المقياس | النتيجة |', '|---|---|');
lines.push(`| أخطاء الحفظ المرصودة في آيتها | ${s.caught} من ${s.errors} (${pct(s.recall)}) |`);
lines.push(`| … وفي كلمتها (±1) | ${s.placed} من ${s.errors} |`);
lines.push(`| رُصد شيء في غير موضع الخطأ فقط | ${s.misplaced} |`);
lines.push(`| فاتت | ${s.missed} |`);
lines.push(`| تسجيلات سليمة بلا أيّ تنبيه | ${s.cleanSilent} من ${s.clean} |`);
lines.push(`| تنبيهات كاذبة (كلّ التسجيلات) | ${s.falseAlarms} |`);
lines.push(`| الدقّة: من كلّ ما عُرض، ما كان خطأً حقيقيًا | ${pct(s.precision)} |`);
lines.push(`| لم يتمكّن من متابعة التسجيل | ${s.notFollowed} |`, '');

lines.push('## تسجيلًا تسجيلًا', '', '| الملف | الوسم | ما عُرض | الحكم | التطابق |', '|---|---|---|---|---|');
const verdictAr: Record<string, string> = {
  clean: '✅ سليم بلا تنبيه', 'caught-placed': '✅ رُصد في موضعه', caught: '✅ رُصد في آيته', misplaced: '⚠️ في غير موضعه',
  missed: '❌ فات', 'false-alarm': '❌ تنبيه كاذب', 'not-followed': '— لم يُتابَع', 'out-of-scope': '◻️ خارج النطاق',
};
for (const r of shipping.scored) {
  const l = r.label;
  const tag = l.errorType === 'none' ? 'سليم' : `${l.errorType} ${l.surah}:${l.errorAyah}${l.errorWord ? ` ك${l.errorWord}` : ''}`;
  const recitedVerses = Array.from({ length: l.toAyah - l.fromAyah + 1 }, (_, i) => ({ surah: l.surah, ayah: l.fromAyah + i }));
  const shown = r.candidates.map(c => {
    const src = sourceOfCandidate(phonemes, c, heardBy.get(l.file)!.phonemes, recitedVerses);
    return `${c.kind} ${where(c.anchorId, c.word)}${src ? ` ← لفظ ${src.surah}:${src.ayah}` : ''}`;
  }).join('<br>') || '—';
  lines.push(`| ${l.file} | ${tag} | ${shown} | ${verdictAr[r.outcome]} | ${pct(r.agreement)} |`);
}

const timing = labels.map(l => heardBy.get(l.file)!);
const rtf = timing.reduce((a, h) => a + h.inferenceMs, 0) / timing.reduce((a, h) => a + h.audioMs, 0);
lines.push('', `زمن المعالجة: ×${rtf.toFixed(2)} من زمن التلاوة (أقلّ من 1 = أسرع من الوقت الحقيقي)، على جهاز التقييم.`, '');

const grid: Settings[] = [];
for (const minRun of [2, 3, 4, 5, 6, 8]) grid.push({ confidence: false, minConfidence: 0, minRun });
for (const minRun of [2, 3, 4, 5]) for (const minConfidence of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) grid.push({ confidence: true, minConfidence, minRun });
const rows = grid.map(g => ({ g, s: run(g).summary }));
lines.push('## شبكة المعايرة', '', 'مرتّبة: الأكثر رصدًا ثم الأقلّ تنبيهًا كاذبًا. على عيّنة صغيرة: دليلٌ لا حكم.', '');
lines.push('| الإعداد | رُصد | في كلمته | تنبيهات كاذبة | سليمة بلا تنبيه | الدقّة |', '|---|---|---|---|---|---|');
rows.sort((a, b) => b.s.caught - a.s.caught || a.s.falseAlarms - b.s.falseAlarms || b.s.placed - a.s.placed);
for (const { g, s: r } of rows) {
  const mark = g.confidence === SHIPPING.confidence && g.minRun === SHIPPING.minRun ? ' ← المنشور' : '';
  lines.push(`| ${describe(g)}${mark} | ${r.caught}/${r.errors} | ${r.placed} | ${r.falseAlarms} | ${r.cleanSilent}/${r.clean} | ${pct(r.precision)} |`);
}

const report = lines.join('\n') + '\n';
writeFileSync(join(out, 'report.md'), report);
writeFileSync(join(out, 'results.json'), JSON.stringify({ shipping: shipping.summary, perRecording: shipping.scored, grid: rows }, null, 2));
console.log(report);
console.error(`→ ${join(out, 'report.md')}`);
