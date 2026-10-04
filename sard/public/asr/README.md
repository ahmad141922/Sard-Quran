# `tokens.txt`

The symbol table of `zipformer_p-arabic-v3`, from
<https://huggingface.co/Quran-Lab/zipformer_p-arabic-v3>.

The decoder needs it to turn the model's output ids into sounds. It lives here,
not with the 69 MB weights, because it is 3 KB: Capacitor copies `public/` into
the Android bundle, so it is on the device from first launch and the weights
remain a download the reciter agrees to.

**Do not regenerate it from `phoneme_units.json`.** Those ids are offset by one
against the CTC output layer — blank is 250 here and 0 there — and decoding with
the wrong table produces plausible-looking rubbish rather than an error. The
model card says the same. `src/test/asr-phonemes.test.ts` pins the offset so a
future edit that reintroduces it fails loudly.

## Licence

`tokens.txt`, the model weights and `../quran-phonemes.json` are Quran-Lab's,
under the Quran-Lab No-Profit License 1.2 — [`LICENSE`](LICENSE) here, kept
beside them as the licence requires wherever they are distributed (this
repository, the app bundle, and the `asr/` folder of the R2 bucket that serves
the weights). In short: free, never charged for, never behind a paywall or
ads, derivatives under the same licence. See also `THIRD-PARTY.md`.
