"""Reference fbank features from kaldi-native-fbank, configured as
sherpa-onnx's FeatureExtractor configures it (features.h defaults).

  python3 fbank_ref.py recording.wav out.f32

Writes num_frames x 80 float32, fed in 100 ms pieces with input_finished,
as the plugin feeds the recogniser. `fbank-check.mjs` compares the port to it.
"""
import sys
import wave

import kaldi_native_fbank as knf
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
with wave.open(src) as w:
    assert w.getframerate() == 16000 and w.getsampwidth() == 2 and w.getnchannels() == 1
    pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
samples = (pcm.astype(np.float32) / 32768.0)

opts = knf.FbankOptions()
opts.frame_opts.dither = 0
opts.frame_opts.snip_edges = False
opts.frame_opts.samp_freq = 16000
opts.frame_opts.frame_shift_ms = 10
opts.frame_opts.frame_length_ms = 25
opts.frame_opts.remove_dc_offset = True
opts.frame_opts.preemph_coeff = 0.97
opts.frame_opts.window_type = "povey"
opts.mel_opts.num_bins = 80
opts.mel_opts.low_freq = 20
opts.mel_opts.high_freq = -400

fb = knf.OnlineFbank(opts)
for i in range(0, len(samples), 1600):
    fb.accept_waveform(16000, samples[i:i + 1600].tolist())
fb.input_finished()
feats = np.stack([fb.get_frame(i) for i in range(fb.num_frames_ready)]).astype(np.float32)
feats.tofile(dst)
print(f"{feats.shape[0]} frames")
