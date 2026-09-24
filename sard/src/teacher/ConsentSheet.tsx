import React, { useState } from 'react';
import { X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import {
  giveConsent, loadConsent, needsAsking, revokeConsent, saveConsent, type Consent,
} from '@/lib/upload-consent';
import { teacherText } from './strings';

/**
 * The question itself: what may leave this device.
 *
 * `upload-consent.ts` holds the rule and `upload-gate.test.ts` proves nothing
 * gets past it. This is only the asking — but the asking is where the rule is
 * most easily undone, so three things are deliberate.
 *
 * **Both switches start off.** Not «off unless you have a reason», not
 * «sensible defaults»: a pre-ticked box is an answer somebody else gave. The
 * agree button is what turns anything on, and it turns on exactly what is on
 * screen at the moment it is pressed.
 *
 * **The recording is a second switch, and it cannot stand alone.** Agreeing
 * that a summary may be mirrored is not agreeing that a recording of one's own
 * voice may be, so it is a separate choice — and turning the first one off
 * takes the second with it, because a recording with no majlis attached is not
 * a thing anybody meant to send.
 *
 * **Refusing is recorded as an answer.** «No» and «not asked yet» look
 * identical to the gate and must not look identical here, or somebody who
 * declined would be asked again every time the app opened. Declining closes the
 * question; the switch below reopens it whenever they want.
 *
 * ## What withdrawal does and does not claim
 *
 * It stops the sending from that moment. It does not say the sent thing is
 * gone, because this screen cannot make that true — so it says plainly that
 * what went up still needs deleting, and who to ask. A toggle that implied
 * erasure would be the dishonest kind.
 */
export const ConsentSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Told whenever the answer changes, so a caller can react without re-reading. */
  onChange?: (consent: Consent) => void;
}> = ({ open, onClose, onChange }) => {
  const { lang, dir } = useI18n();
  const t = teacherText(lang);

  const [saved, setSaved] = useState<Consent>(loadConsent);
  // The switches, which start off however the stored answer reads: this is the
  // form, not the record.
  const [data, setData] = useState(false);
  const [audio, setAudio] = useState(false);
  const [owed, setOwed] = useState(false);

  if (!open) return null;

  const settle = (next: Consent) => {
    saveConsent(next);
    setSaved(next);
    onChange?.(next);
  };

  const accept = () => {
    settle(giveConsent({ data, audio }));
    setOwed(false);
    onClose();
  };

  const decline = () => {
    settle(giveConsent({ data: false, audio: false }));
    setOwed(false);
    onClose();
  };

  const withdraw = () => {
    const { consent, owed: what } = revokeConsent(saved);
    settle(consent);
    setOwed(what.data || what.audio);
    setData(false);
    setAudio(false);
  };

  const asking = needsAsking(saved) || saved.data === false;

  return (
    <div
      dir={dir}
      data-consent-sheet
      role="dialog"
      aria-modal="true"
      aria-label={t.consentTitle}
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-card p-4 text-foreground shadow-2xl sm:rounded-2xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-base font-extrabold">{t.consentTitle}</h2>
          <button
            type="button"
            data-consent-close
            onClick={onClose}
            aria-label={t.back}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t.consentBody}</p>

        {asking ? (
          <>
            <label className="mb-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                data-consent-data
                checked={data}
                onChange={e => {
                  setData(e.target.checked);
                  // A recording with nothing to attach it to is not a state
                  // this screen can put anybody in.
                  if (!e.target.checked) setAudio(false);
                }}
                className="mt-0.5"
              />
              <span className="font-bold">{t.consentData}</span>
            </label>

            <label className="mb-1 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                data-consent-audio
                checked={audio}
                disabled={!data}
                onChange={e => setAudio(e.target.checked)}
                className="mt-0.5"
              />
              <span className={data ? 'font-bold' : 'text-muted-foreground'}>
                {t.consentAudio}
              </span>
            </label>
            <p className="mb-4 text-[11px] text-muted-foreground">{t.consentAudioNote}</p>

            <div className="flex gap-2">
              <button
                type="button"
                data-consent-accept
                onClick={accept}
                disabled={!data}
                className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                {t.consentAccept}
              </button>
              <button
                type="button"
                data-consent-decline
                onClick={decline}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted-foreground"
              >
                {t.consentDecline}
              </button>
            </div>
          </>
        ) : (
          <>
            <p data-consent-state className="mb-3 text-xs font-bold">
              {saved.data ? t.consentOn : t.consentOff}
            </p>
            <button
              type="button"
              data-consent-revoke
              onClick={withdraw}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm font-bold text-muted-foreground"
            >
              {t.consentRevoke}
            </button>
          </>
        )}

        {owed && (
          <p data-consent-owed className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {t.consentOwed}
          </p>
        )}
      </div>
    </div>
  );
};

export default ConsentSheet;
