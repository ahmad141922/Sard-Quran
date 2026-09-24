package com.tajweedoo.sard.asr

/**
 * The recogniser, on the device.
 *
 * Everything above this file is pure TypeScript tested against hand-written
 * examples. This is the part that cannot be: a microphone, a 24 MB library and
 * a 69 MB model. It is kept as small as it can be for that reason — it
 * captures audio, feeds it to sherpa-onnx, and hands back one row per sound.
 * It makes no judgement about any of them.
 *
 * ## Two things it must get exactly right
 *
 * **The probability.** `align.ts` refuses to blame a reciter for anything the
 * model was unsure of, and that refusal is only as good as this number. The
 * decoder reports natural-log probabilities; they are exponentiated here, once,
 * so exactly one side of the bridge owns the conversion. The TypeScript side
 * range-checks what arrives and drops the recording if it is not 0..1.
 *
 * **The audio stays here.** Nothing is written to disk and nothing is
 * uploaded. Samples go from the microphone into the recogniser and are dropped;
 * what crosses back into the WebView is a list of symbols. That is the promise
 * the whole feature was built under.
 */

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineZipformer2CtcModelConfig
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.exp
import kotlin.math.min

@CapacitorPlugin(
    name = "SardAsr",
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = SardAsrPlugin.MIC),
    ],
)
class SardAsrPlugin : Plugin() {

    companion object {
        const val MIC = "microphone"

        private const val SAMPLE_RATE = 16000
        private const val MODEL_NAME = "zipformer_p_arabic_v3.int8.onnx"
        private const val TOKENS_NAME = "tokens.txt"

        /**
         * Where `tokens.txt` sits in the bundled web assets.
         *
         * Capacitor copies `sard/public/` to `public/`, so the table ships with
         * the app and only the weights are ever fetched. Decoding with the
         * wrong table produces plausible rubbish rather than an error, which is
         * exactly why it is not regenerated anywhere.
         */
        private const val TOKENS_ASSET = "public/asr/tokens.txt"

        /**
         * How much recitation is kept for playback: twenty minutes.
         *
         * 16 kHz of 16-bit mono is 32 KB a second, so this is about 38 MB —
         * large, but a fraction of what a WebView already holds, and it buys
         * the one thing the reciter actually asked for. A longer sitting than
         * this keeps its candidates and loses only the playback button.
         */
        private const val MAX_CLIP_SAMPLES = SAMPLE_RATE * 60 * 20

        /** Whether the library loaded at all. A shell may be built without it. */
        private val libraryPresent: Boolean = try {
            System.loadLibrary("sherpa-onnx-jni")
            true
        } catch (_: Throwable) {
            false
        }
    }

    private var recognizer: OnlineRecognizer? = null
    private var stream: OnlineStream? = null
    private var record: AudioRecord? = null
    private var worker: Thread? = null
    private val listening = AtomicBoolean(false)
    private var startedAtMs = 0L

    /**
     * Everything that touches the model runs here, never on the main thread.
     *
     * Building the recogniser reads 69 MB of weights and takes seconds; on the
     * main thread Android calls that a hang and kills the app after five. It
     * did, on the first run of this plugin — an ANR inside `newFromFile`. The
     * WebView already draws «preparing» while this works, so there is nothing
     * to be gained by blocking anyway.
     */
    private val work: ExecutorService = Executors.newSingleThreadExecutor()

    /**
     * Guards the recogniser's stream.
     *
     * A lock of its own rather than the plugin instance: `this` is a Capacitor
     * `Plugin`, and a monitor anything else can also take is a deadlock waiting
     * for a reason.
     */
    private val lock = Any()

    /**
     * The recitation itself, kept only while the reciter is answering.
     *
     * The machine cannot say which *word* went wrong — the index numbers sounds
     * by phonetic group, and «هدى من ربهم» is one group. What it can say, to
     * the millisecond, is *when*. So the reciter is offered their own voice at
     * that moment, which answers the question better than any highlight would.
     *
     * In memory, and only in memory: never a file, never a byte off the device.
     * Dropped the moment the review is closed. Capped, because a long review is
     * 32 KB a second and an out-of-memory kill mid-majlis is unforgivable —
     * past the cap the playback button simply is not offered.
     */
    private var clip: ShortArray? = null
    private var clipLength = 0
    private var player: AudioTrack? = null

    /** Where the weights live once they are on the device. */
    private fun modelFile(): File = File(File(context.filesDir, "asr"), MODEL_NAME)

    /**
     * The symbol table, on the filesystem.
     *
     * sherpa-onnx reads either every path from assets or every path from the
     * filesystem, never a mix — and the weights are a download, so the table is
     * copied out beside them.
     */
    private fun tokensFile(): File {
        val dest = File(File(context.filesDir, "asr"), TOKENS_NAME)
        if (dest.exists() && dest.length() > 0) return dest
        dest.parentFile?.mkdirs()
        context.assets.open(TOKENS_ASSET).use { input ->
            dest.outputStream().use { output -> input.copyTo(output) }
        }
        return dest
    }

    private fun hasMicPermission(): Boolean =
        getPermissionState(MIC) == com.getcapacitor.PermissionState.GRANTED ||
            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    @PluginMethod
    fun available(call: PluginCall) {
        val result = JSObject()
        // Reported as one boolean on purpose. The screen does not explain why
        // it cannot run — it is simply not drawn.
        result.put("available", libraryPresent && modelFile().exists())
        call.resolve(result)
    }

    /**
     * Makes sure the model is on the device and the recogniser is built.
     *
     * The weights are **not** fetched here yet: they are 69 MB and the screen
     * that says so before it starts does not exist. Until it does, `prepare`
     * succeeds only when the file is already present, and the feature reports
     * itself unavailable otherwise. A silent 69 MB download because somebody
     * opened a page is exactly what must not happen.
     */
    @PluginMethod
    fun prepare(call: PluginCall) {
        val result = JSObject()
        if (!libraryPresent || !modelFile().exists()) {
            result.put("ready", false)
            call.resolve(result)
            return
        }
        if (!hasMicPermission()) {
            requestPermissionForAlias(MIC, call, "afterMicPermission")
            return
        }
        work.execute {
            val ready = build()
            call.resolve(JSObject().apply { put("ready", ready) })
        }
    }

    @PermissionCallback
    private fun afterMicPermission(call: PluginCall) {
        work.execute {
            val ready = hasMicPermission() && build()
            call.resolve(JSObject().apply { put("ready", ready) })
        }
    }

    /** Builds the recogniser once and keeps it; it takes seconds to construct. */
    private fun build(): Boolean {
        recognizer?.let { return true }
        return try {
            recognizer = OnlineRecognizer(
                assetManager = null,
                config = OnlineRecognizerConfig(
                    featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
                    modelConfig = OnlineModelConfig(
                        zipformer2Ctc = OnlineZipformer2CtcModelConfig(
                            model = modelFile().absolutePath,
                        ),
                        tokens = tokensFile().absolutePath,
                        numThreads = 2,
                        provider = "cpu",
                    ),
                    decodingMethod = "greedy_search",
                    // A reciter pausing to think is not the end of anything.
                    // The passage ends when they press stop, and nowhere else.
                    enableEndpoint = false,
                ),
            )
            true
        } catch (_: Throwable) {
            recognizer = null
            false
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        work.execute { begin(call) }
    }

    private fun begin(call: PluginCall) {
        val result = JSObject()
        val engine = recognizer
        if (engine == null || !hasMicPermission() || listening.get()) {
            result.put("started", false)
            call.resolve(result)
            return
        }

        val minBuffer = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
        )
        if (minBuffer <= 0) {
            result.put("started", false)
            call.resolve(result)
            return
        }

        val mic = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                minBuffer * 4,
            )
        } catch (_: Throwable) {
            null
        }

        if (mic == null || mic.state != AudioRecord.STATE_INITIALIZED) {
            mic?.release()
            result.put("started", false)
            call.resolve(result)
            return
        }

        stream = engine.createStream()
        record = mic
        clip = ShortArray(SAMPLE_RATE * 60)   // grown as needed, up to the cap
        clipLength = 0
        listening.set(true)
        startedAtMs = System.currentTimeMillis()
        mic.startRecording()

        worker = Thread {
            val shorts = ShortArray(minBuffer / 2)
            val floats = FloatArray(shorts.size)
            while (listening.get()) {
                val read = mic.read(shorts, 0, shorts.size)
                // A negative read is an error or a stopped device: leave, rather
                // than spin on it until someone else notices.
                if (read < 0) break
                if (read == 0) continue
                keep(shorts, read)
                // 16-bit PCM to the -1..1 the feature extractor expects.
                for (i in 0 until read) floats[i] = shorts[i] / 32768.0f
                val current = stream ?: break
                synchronized(lock) {
                    current.acceptWaveform(floats.copyOf(read), SAMPLE_RATE)
                    while (engine.isReady(current)) engine.decode(current)
                }
            }
        }
        worker?.start()

        result.put("started", true)
        call.resolve(result)
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        // Off the main thread for the same reason `prepare` is: draining the
        // decoder at the end of a long recitation is not instant, and `halt`
        // waits on the capture thread before it can even start.
        work.execute { finish(call) }
    }

    private fun finish(call: PluginCall) {
        val engine = recognizer
        val current = stream
        val durationMs = if (startedAtMs == 0L) 0L else System.currentTimeMillis() - startedAtMs

        halt()

        if (engine == null || current == null) {
            call.resolve(JSObject().apply {
                put("phonemes", JSArray())
                put("durationMs", durationMs)
            })
            return
        }

        val heard = JSArray()
        try {
            synchronized(lock) {
                current.inputFinished()
                while (engine.isReady(current)) engine.decode(current)
                val result = engine.getResult(current)

                // One row per sound: what was heard, how sure, and when.
                // `timestamps` are seconds from the start of the recording.
                val count = min(result.tokens.size, result.timestamps.size)
                for (i in 0 until count) {
                    heard.put(JSObject().apply {
                        put("symbol", result.tokens[i])
                        // `null`, not a number, where the decoder rated nothing.
                        val p = probability(result.ysProbs, i)
                        if (p == null) put("confidence", JSONObject.NULL)
                        else put("confidence", p)
                        put("atMs", (result.timestamps[i] * 1000).toInt())
                    })
                }
            }
        } catch (_: Throwable) {
            // A decode that fell over yields nothing rather than a partial list
            // whose gaps would read as verses the reciter skipped.
            call.resolve(JSObject().apply {
                put("phonemes", JSArray())
                put("durationMs", durationMs)
            })
            release()
            return
        }

        release()
        call.resolve(JSObject().apply {
            put("phonemes", heard)
            put("durationMs", durationMs)
            // Whether the recitation was short enough to have been kept.
            put("canPlay", clip != null && clipLength > 0)
        })
    }

    /**
     * The decoder's number as a probability in 0..1, or **null** where it did
     * not give one.
     *
     * `ysProbs` are natural-log probabilities where they exist, so they are
     * exponentiated here — once, on this side of the bridge.
     *
     * For this model they do not exist. sherpa-onnx fills `ys_probs` on the
     * transducer path only; its CTC greedy decoder takes `max_element` over
     * each frame to find the most likely symbol and discards the value, so the
     * array arrives empty. Reporting 0 for that — which this did at first —
     * silently suppressed every candidate, since `MIN_CONFIDENCE` is 0.6. The
     * feature looked as though it were working and could say nothing.
     *
     * So the absence is reported as an absence. `align.ts` has a case for it.
     */
    private fun probability(probs: FloatArray, i: Int): Float? {
        if (i >= probs.size) return null
        val p = exp(probs[i].toDouble()).toFloat()
        if (p.isNaN() || p < 0f) return null
        return min(p, 1f)
    }

    /**
     * What has been heard **so far**, without ending the recitation.
     *
     * The recogniser is streaming, so its result is available at any moment;
     * reading it does not disturb the stream. This is what lets the marker
     * follow along — see `asr/follow.ts`.
     *
     * Returns nothing at all rather than an error where there is no recitation
     * in progress: the caller polls this on a timer, and a timer that has to
     * handle failures is a timer that will one day handle them badly.
     */
    @PluginMethod
    fun partial(call: PluginCall) {
        work.execute {
            val engine = recognizer
            val current = stream
            val heard = JSArray()
            if (engine != null && current != null && listening.get()) {
                try {
                    synchronized(lock) {
                        val result = engine.getResult(current)
                        val count = min(result.tokens.size, result.timestamps.size)
                        for (i in 0 until count) {
                            heard.put(JSObject().apply {
                                put("symbol", result.tokens[i])
                                val p = probability(result.ysProbs, i)
                                if (p == null) put("confidence", JSONObject.NULL)
                                else put("confidence", p)
                                put("atMs", (result.timestamps[i] * 1000).toInt())
                            })
                        }
                    }
                } catch (_: Throwable) {
                    // Nothing readable yet. The next poll will try again.
                }
            }
            call.resolve(JSObject().apply { put("phonemes", heard) })
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        halt()
        release()
        call.resolve()
    }

    /**
     * Adds one buffer to the kept recitation, growing it as it goes.
     *
     * Past the cap it stops keeping and drops what it has: half a recitation
     * would put the playback button on candidates it cannot actually play, and
     * a button that does nothing is worse than no button.
     */
    private fun keep(buffer: ShortArray, count: Int) {
        var held = clip ?: return
        if (clipLength + count > MAX_CLIP_SAMPLES) { clip = null; clipLength = 0; return }
        if (clipLength + count > held.size) {
            val grown = ShortArray(minOf(MAX_CLIP_SAMPLES, maxOf(held.size * 2, clipLength + count)))
            held.copyInto(grown, 0, 0, clipLength)
            held = grown
            clip = grown
        }
        buffer.copyInto(held, clipLength, 0, count)
        clipLength += count
    }

    /**
     * Plays the reciter's own voice from one moment, for a few seconds.
     *
     * Native rather than handing the bytes to the WebView: half a megabyte of
     * base64 across the bridge for something that is only ever played back
     * here, and the audio stays where it was promised to stay.
     */
    @PluginMethod
    fun play(call: PluginCall) {
        val atMs = call.getInt("atMs") ?: 0
        val forMs = call.getInt("forMs") ?: 4000
        work.execute {
            playFrom(atMs, forMs)
            call.resolve()
        }
    }

    private fun playFrom(atMs: Int, forMs: Int) {
        val held = clip ?: return
        stopPlayback()

        // A moment before, so the reciter hears the run-up rather than landing
        // mid-word: the divergence is easier to place with what preceded it.
        val from = ((atMs - 600).coerceAtLeast(0).toLong() * SAMPLE_RATE / 1000).toInt()
        if (from >= clipLength) return
        val count = minOf((forMs.toLong() * SAMPLE_RATE / 1000).toInt(), clipLength - from)
        if (count <= 0) return

        val track = try {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setBufferSizeInBytes(count * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()
        } catch (_: Throwable) {
            return
        }

        player = track
        try {
            track.write(held, from, count)
            track.play()
        } catch (_: Throwable) {
            stopPlayback()
        }
    }

    private fun stopPlayback() {
        player?.let {
            try {
                it.pause()
                it.flush()
            } catch (_: Throwable) {
                // Never started.
            }
            it.release()
        }
        player = null
    }

    /** Called when the review closes: the recitation is not kept beyond it. */
    @PluginMethod
    fun discard(call: PluginCall) {
        stopPlayback()
        clip = null
        clipLength = 0
        call.resolve()
    }

    /**
     * Stops the microphone and the thread feeding it in — **in this order**.
     *
     * The order is the whole of it, and getting it wrong hung the app: the
     * capture thread sits inside `AudioRecord.read`, which blocks until the
     * device hands over a buffer. Joining before the device is stopped waits on
     * a thread that is not coming back yet, and releasing the recorder while a
     * reader is still inside it frees the object out from under that reader.
     *
     * So: stop the device, which makes the pending `read` return at once; then
     * wait for the thread to actually leave; only then release.
     */
    private fun halt() {
        listening.set(false)

        val mic = record
        try {
            if (mic?.recordingState == AudioRecord.RECORDSTATE_RECORDING) mic.stop()
        } catch (_: Throwable) {
            // Already stopped, or never started.
        }

        // Generous, because a decode of the last chunk may be in flight. Bounded
        // all the same: a reciter must never be left on a screen that says it is
        // reading and never stops.
        worker?.join(5000)
        worker = null

        try {
            mic?.release()
        } catch (_: Throwable) {
            // Already gone.
        }
        record = null
    }

    private fun release() {
        stream?.release()
        stream = null
        startedAtMs = 0L
    }

    override fun handleOnDestroy() {
        halt()
        stopPlayback()
        clip = null
        clipLength = 0
        release()
        recognizer?.release()
        recognizer = null
        work.shutdownNow()
    }
}
