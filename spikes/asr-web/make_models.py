"""Two stand-in models for the web spike, because the real one cannot be
fetched from this environment.

1. ``fake-zipformer2-ctc.onnx`` - the *interface* of a streaming Zipformer2
   CTC export: the same metadata keys sherpa-onnx reads, the same state
   tensors in the same order and shapes, int64 ``processed_lens``, and a
   ``log_probs`` output over the 251 symbols of ``tokens.txt``. The arithmetic
   is meaningless, but every state feeds the output through its own weights,
   so a port that drops, reorders or fails to thread a state produces
   different symbols from sherpa-onnx. That is what ``compare.mjs`` checks.

2. ``proxy-65m-int8.onnx`` - no interface, only *weight*: ~65M int8
   parameters in a MatMul stack, the size class of the real 69 MB file, for a
   rough cost per second of audio in the browser. It is a proxy, not a
   benchmark of the real model.

Run: python3 make_models.py [outdir]
"""

import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "models")
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)

VOCAB = 251  # tokens.txt: 250 symbols + <blank> at id 250
BLANK = 250
FEAT = 80
T = 45
CHUNK = 32

ENC_DIMS = [32, 48]
LAYERS = [1, 2]
Q_HEAD = [8, 8]
V_HEAD = [4, 4]
HEADS = [2, 2]
KERNELS = [15, 7]
LEFT = [16, 8]


def const(name, arr):
    return numpy_helper.from_array(np.asarray(arr), name)


def build_fake():
    inits, nodes = [], []
    inputs = [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, T, FEAT])]
    outputs = [helper.make_tensor_value_info("log_probs", TensorProto.FLOAT, [1, CHUNK // 4, VOCAB])]

    # Shapes exactly as sherpa-onnx's InitStates builds them.
    states = []
    for i, n in enumerate(LAYERS):
        key_dim = Q_HEAD[i] * HEADS[i]
        val_dim = V_HEAD[i] * HEADS[i]
        nonlin = 3 * ENC_DIMS[i] // 4
        for _ in range(n):
            k = len(states) // 6
            states += [
                (f"cached_key_{k}", [LEFT[i], 1, key_dim]),
                (f"cached_nonlin_attn_{k}", [1, 1, LEFT[i], nonlin]),
                (f"cached_val1_{k}", [LEFT[i], 1, val_dim]),
                (f"cached_val2_{k}", [LEFT[i], 1, val_dim]),
                (f"cached_conv1_{k}", [1, ENC_DIMS[i], KERNELS[i] // 2]),
                (f"cached_conv2_{k}", [1, ENC_DIMS[i], KERNELS[i] // 2]),
            ]
    states.append(("embed_states", [1, 128, 3, 19]))

    # Encoder stand-in: the first CHUNK frames, pooled by 4, projected.
    inits += [
        const("starts", np.array([0], np.int64)),
        const("ends", np.array([CHUNK], np.int64)),
        const("axes1", np.array([1], np.int64)),
        const("pool_shape", np.array([1, CHUNK // 4, 4, FEAT], np.int64)),
        const("W", (rng.standard_normal((FEAT, VOCAB)) * 0.25).astype(np.float32)),
    ]
    bias = np.zeros(VOCAB, np.float32)
    bias[BLANK] = 2.0  # blank-heavy, like a real CTC head
    inits.append(const("b", bias))
    nodes += [
        helper.make_node("Slice", ["x", "starts", "ends", "axes1"], ["xs"]),
        helper.make_node("Reshape", ["xs", "pool_shape"], ["xr"]),
        helper.make_node("ReduceMean", ["xr"], ["xp"], axes=[2], keepdims=0),
        helper.make_node("MatMul", ["xp", "W"], ["xw"]),
        helper.make_node("Add", ["xw", "b"], ["logit0"]),
        helper.make_node("ReduceMean", ["x"], ["xmean"], keepdims=0),
    ]

    acc = "logit0"
    for idx, (name, shape) in enumerate(states):
        inputs.append(helper.make_tensor_value_info(name, TensorProto.FLOAT, shape))
        outputs.append(helper.make_tensor_value_info("new_" + name, TensorProto.FLOAT, shape))
        # Each state pulls the logits along its own direction...
        inits.append(const(f"u{idx}", (rng.standard_normal(VOCAB) * 0.8).astype(np.float32)))
        nodes += [
            helper.make_node("ReduceMean", [name], [f"s{idx}"], keepdims=0),
            helper.make_node("Mul", [f"s{idx}", f"u{idx}"], [f"d{idx}"]),
            helper.make_node("Add", [acc, f"d{idx}"], [f"acc{idx}"]),
        ]
        acc = f"acc{idx}"
        # ...and evolves by its own rule, so any two swapped states diverge.
        inits += [
            const(f"decay{idx}", np.float32(0.5 + 0.02 * idx)),
            const(f"gain{idx}", np.float32(0.1 * (idx + 1))),
        ]
        nodes += [
            helper.make_node("Mul", [name, f"decay{idx}"], [f"m{idx}"]),
            helper.make_node("Mul", ["xmean", f"gain{idx}"], [f"g{idx}"]),
            helper.make_node("Add", [f"m{idx}", f"g{idx}"], ["new_" + name]),
        ]

    # processed_lens: int64 [1], advanced by the chunk shift, and felt in the output.
    inputs.append(helper.make_tensor_value_info("processed_lens", TensorProto.INT64, [1]))
    outputs.append(helper.make_tensor_value_info("new_processed_lens", TensorProto.INT64, [1]))
    inits += [
        const("shift", np.array([CHUNK], np.int64)),
        const("lens_scale", np.float32(0.003)),
        const("u_lens", (rng.standard_normal(VOCAB)).astype(np.float32)),
    ]
    nodes += [
        helper.make_node("Add", ["processed_lens", "shift"], ["new_processed_lens"]),
        helper.make_node("Cast", ["processed_lens"], ["lens_f"], to=TensorProto.FLOAT),
        helper.make_node("Mul", ["lens_f", "lens_scale"], ["lens_s"]),
        helper.make_node("Mul", ["lens_s", "u_lens"], ["lens_d"]),
        helper.make_node("Add", [acc, "lens_d"], ["logits"]),
        helper.make_node("LogSoftmax", ["logits"], ["log_probs"], axis=-1),
    ]

    graph = helper.make_graph(nodes, "fake_zipformer2_ctc", inputs, outputs, inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    meta = {
        "model_type": "zipformer2",
        "encoder_dims": ",".join(map(str, ENC_DIMS)),
        "query_head_dims": ",".join(map(str, Q_HEAD)),
        "value_head_dims": ",".join(map(str, V_HEAD)),
        "num_heads": ",".join(map(str, HEADS)),
        "num_encoder_layers": ",".join(map(str, LAYERS)),
        "cnn_module_kernels": ",".join(map(str, KERNELS)),
        "left_context_len": ",".join(map(str, LEFT)),
        "T": str(T),
        "decode_chunk_len": str(CHUNK),
    }
    helper.set_model_props(model, meta)
    onnx.checker.check_model(model)
    onnx.save(model, OUT / "fake-zipformer2-ctc.onnx")


def build_proxy():
    """~65M params, MatMul stack, then dynamic int8 quantisation."""
    from onnxruntime.quantization import QuantType, quantize_dynamic

    H, N = 2048, 15
    inits, nodes = [], []
    prev = "x"
    for i in range(N):
        inits.append(const(f"W{i}", (rng.standard_normal((H, H)) * (1 / np.sqrt(H))).astype(np.float32)))
        nodes += [
            helper.make_node("MatMul", [prev, f"W{i}"], [f"h{i}"]),
            helper.make_node("Relu", [f"h{i}"], [f"r{i}"]),
        ]
        prev = f"r{i}"
    nodes.append(helper.make_node("Identity", [prev], ["y"]))
    graph = helper.make_graph(
        nodes, "proxy",
        [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, "frames", H])],
        [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, "frames", H])],
        inits,
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    fp32 = OUT / "proxy-fp32.onnx"
    onnx.save(model, fp32)
    quantize_dynamic(str(fp32), str(OUT / "proxy-65m-int8.onnx"), weight_type=QuantType.QInt8)
    fp32.unlink()


build_fake()
build_proxy()
for f in sorted(OUT.iterdir()):
    print(f"{f.name}: {f.stat().st_size / 1e6:.1f} MB")
