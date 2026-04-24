# Log-Polar Vision Adapter — Project Plan

**Status:** Draft v0.6 · Architect: Claude Opus · Editor: Nemotron-3-Super-120B-A12B (MLX, MXFP4) via LM Studio · Tool: aider (architect mode)

*v0.2 changes: patch-based tokenization promoted from open question to the resolved v1 design; token-count gates restated in patches; discrete scale-invariance made explicit.*

*v0.3 changes: corrected scale-shift scheme — alternating 21/22-cell shifts (average 21.5 = one spiral revolution) replace the earlier 30-cell claim, which had an unaccounted 142° rotation. Patch decomposition generalized to **either** 5 × (6×5) or 6 × (5×5).*

*v0.4 changes: patches constructed in spiral order (foveal → peripheral, row-major fill within each patch). Encoder options in §3 re-sorted: 1D conv or MLP are the natural fit for spiral-ordered patches; 2D conv is demoted to conditional (only useful with snake-order fill).*

*v0.5 changes: simplified to 1D patches (1×25 or 1×30). Rationale: (1) the LLM doesn't care about the encoder's internal structure — the patch encoder is ~4 orders of magnitude cheaper than one LLM forward pass, so 2D-vs-1D has zero impact on training or inference speed; (2) in 1D, **both** kinds of local correlation — angular adjacency (consecutive cells, 1 apart) and radial adjacency (same angle, one revolution apart, ~21 cells apart) — are simple 1D distances that a wide-receptive-field encoder sees naturally. A 2D row-major reshape actively hides the radial correlation at an awkward diagonal offset. 2D encoders demoted from first-class to optional-M1.4-experiment status.*

*v0.6 changes: §8 adapter paths updated from flat `src/{adapter,training,data,eval}/` to nested `src/lpx_adapter/{adapter,training,data,eval}/` to match the M1.2 scaffolding. Rationale recorded in `DESIGN.md` §5: nested src-layout is installable via `pip install -e .`, avoids `PYTHONPATH` hacks that plagued `lpximage`, and prevents collision between flat top-level names (`training`, `data`) and common pip-installable packages.*

---

## 1. Goal

Build a vision adapter that lets a large language model (LLM) consume log-polar visual input, using the existing LPXImage / LPXVision tokenization as the front-end rather than a conventional ViT. The deliverable is a trained adapter plus the training and evaluation code needed to reproduce it. The target LLM is **Nemotron-3-Super-120B-A12B**, with **Qwen3.5-122B** as a secondary target to verify the adapter isn't locked to one family.

**Non-goals for v1:**

- Replacing the LPXVision tokenizer itself. The retinaCell encoding (24-bit packed, 8 identifier components) is treated as a fixed, hand-designed tokenizer for this project.
- Building a new multi-modal chat system. The adapter must land in an existing inference harness (Transformers for Qwen, MLX for Nemotron); no custom serving stack.
- Real-time saccade control. The existing repo has saccade machinery; v1 adapter consumes one or a small number of fixations per image.

## 2. Substrate (what already exists)

From this repository, after reading `LogPolarImages.md`, `README.md`, and `LPXVISION_INTEGRATION.md`:

- **LPXImage**: C++ library with Python bindings (`lpximage`, pybind11) that converts standard images into a 1D array of hexagonal log-polar cells along a log-spiral. Scale invariance is free (offset the array). Canonical spiral period is 21.5 cells/revolution; a canonical "view" is **151 retinaCells** covering ~7 revolutions.
- **LPXVision** (C++): per-cell retinaCell pipeline that produces a 24-bit packed identifier per cell with 8 × 3-bit components — `mwh` (luminance), `hue`, and six x/y/z-direction gradients (three luminance, three hue). **Known issue: pybind11 exposure is broken.** The class compiles and links but `'LPXVision' in dir(lpximage)` returns False. Fixing this is a Gate 0 prerequisite.
- **Signatures** (conceptual, described in LogPolarImages.md): SSPP-selected subsets of a view's retinaCells that discard noise. Effectively a learned attention mask — may or may not be used by v1 of the adapter.
- **Patch decomposition** (structural observation): a view of 150 cells tiles cleanly into either **5 patches of 30 cells** or **6 patches of 25 cells**, each patch a contiguous 1D arc of the spiral. Either turns a view into a small token sequence for the LLM — 5 or 6 tokens, vs. 151 flat cells or 576 ViT patches. v1 will bake both off in M1.4. **Patches are constructed in spiral order**: patch 0 contains cells 0–29 (or 0–24), patch 1 the next 30 (or 25), and so on outward from the fovea. Patches are treated as 1D sequences (1×25 or 1×30), not 2D grids, because (a) 2D vs. 1D has zero impact on LLM speed — the patch encoder is negligible compared to one LLM forward pass — and (b) in 1D, both angular adjacency (consecutive cells) and radial adjacency (cells ~21 apart = same angle, one revolution apart) appear as simple 1D distances that a wide-receptive-field encoder can see. A 2D reshape hides the radial correlation at an awkward diagonal offset. This is the native tokenization unit for the adapter (see §3).
- **Scale shift scheme (rotation-controlled):** because the spiral has a fractional period of 21.5 cells/revolution, shifts along the spiral mix scale with rotation unless the shift is a multiple of 21.5 cells. The canonical scheme is **alternating 21- and 22-cell shifts**: each pair of shifts sums to 43 cells = exactly 2 revolutions = pure-scale with zero accumulated rotation. Individual shifts carry a residual rotation of **±8.37°**, which is within normal data-augmentation noise and well below the 142° rotation that uniform 30-cell shifts would have induced. Patch boundaries and scale shifts are therefore **independent concepts**: the 5×(6×5) or 6×(5×5) patching is the LLM tokenization, while 21/22 alternating shifts are the scale-probe mechanism used during training and at inference for scale-invariant matching.
- **Scan tables, sample imagery, streaming server, saccade diagnostics**: useful for data generation but not part of the adapter itself.

**What is NOT in the repo:** any PyTorch model, training loop, dataset loader, evaluation harness, or integration with a base LLM. The adapter is greenfield.

## 3. Open Design Decisions

Things the architect must decide explicitly and record in `DESIGN.md` before heavy training starts. Listed as decisions, not answers.

- **Token representation. [Resolved v0.5 → 1D patch-based; count open.]** A view = contiguous 1D arcs of retinaCells in spiral order. Two candidate counts: **5 patches of 30 cells** (5 tokens/view) or **6 patches of 25 cells** (6 tokens/view); to be compared in M1.4. Each patch is a 1×25 or 1×30 sequence, not a reshaped 2D grid. Encoder options, in order of fit with the 1D spiral structure: (a) **mini-transformer** over 25/30 cell embeddings with learned intra-patch position embeddings — the most expressive option, captures both angular and radial correlations via attention; (b) **wide 1D conv** (kernel ≥22 = one revolution, stride 1, or stacked narrower convs dilated to cover the patch) — picks up both angular-adjacency and radial-adjacency in a single layer; (c) **MLP / bag-of-cells** over the unpacked components — simplest, loses locality but global by construction; (d) **2D conv with snake-order fill** — optional experimental comparison only. Within-cell encoding is factorized across the 8 3-bit identifier components (8 lookup tables of size 8, summed or concatenated), not a flat 24-bit index.
- **Positional encoding.** The 5 patches have a natural radial ordering (foveal → peripheral). Options: plain 1D patch index 0–4, learned patch embedding, or a 2D encoding derived from the (r, θ) range each patch covers. Intra-patch positions (the 6×5 within a patch) may not need explicit encoding if option (a) above is chosen.
- **Scale-invariance mechanics.** Scale shifts are decoupled from patch boundaries. The canonical shift sequence is **alternating +21 / +22 cells** (averaging 21.5 = one spiral revolution, with residual rotation bounded at ±8.37° per shift and zero accumulated rotation every two shifts). Open decision: should v1 train with scale shifts as a *data-augmentation* mechanism (architect emits shifts during training, adapter sees the same image at many scales) or as an *inference-time* mechanism (the adapter is scale-invariant by learning, and shifts are only used for downstream matching)? The former builds in robustness; the latter is simpler but relies on the LLM generalizing.
- **Number of views per image.** Single central fixation (5 tokens) vs. multiple saccaded fixations stitched into a longer sequence (N × 5 tokens). The patch representation makes multi-fixation cheap enough that N = 5–10 fixations is plausible, totaling only 25–50 tokens — still well below ViT budgets.
- **Adapter topology.** LLaVA-style MLP connector mapping adapter output directly into the LLM's input token embeddings, vs. a cross-attention block inserted into a frozen LLM, vs. prefix/suffix soft tokens.
- **Frozen vs. LoRA LLM.** Freeze entirely (pure connector, highest risk the LLM can't absorb the alien token distribution) vs. LoRA on attention layers (typical) vs. LoRA everywhere (most compute).
- **Signatures in the loop.** Train without signatures first (simpler), or use SSPP-selected subsets as a soft attention prior from day one.

## 4. Phase 1 — Local Development Loop (MacBook Pro, small proxy LLM)

**Purpose:** validate the code learns *anything*, settle the open design decisions against cheap experiments, and lock a design before cloud spend.

**Proxy LLM:** Qwen3-4B or Nemotron-Nano, whichever has the cleaner MLX port and HuggingFace presence. Small enough that a full training epoch on ~100K samples completes overnight on the MacBook.

**Milestones (each one is a git tag):**

- **M1.1 — Python access to retinaCells.** Fix the pybind11 issue flagged in `LPXVISION_INTEGRATION.md`. Deliverable: a Python function that takes a numpy image and returns a `(151,)` uint32 array of retinaCells for a canonical view, plus a `(151, 8)` unpacked uint8 tensor.
- **M1.2 — Dataset + dataloader.** Adapt a standard image–text dataset (COCO captions is a reasonable default) into (image, caption) → (retinaCells, text) pairs. Ship as a PyTorch `Dataset` with deterministic seeding and a tiny 1K-sample subset for overfitting tests.
- **M1.3 — Adapter v0: overfit 10 examples.** Implement the simplest plausible patch-based adapter (factorized 3-bit cell embeddings → MLP patch encoder over 1D patches → 5-or-6-token connector into the proxy LLM's embedding space), train with the proxy LLM frozen, overfit 10 image–caption pairs to near-zero loss. Commit to one patch count for M1.3 (arbitrary — M1.4 compares 5 vs. 6). This is a correctness gate, not a performance gate — it verifies the pipeline end-to-end before design alternatives are compared.
- **M1.4 — Design bake-off.** Run 4–6 short (≤2 hour each) training runs on a 10K subset, varying one design decision from §3 at a time. Compare on held-out caption perplexity and qualitative eye-test. Pick a winner and record rationale in `DESIGN.md`.
- **M1.5 — Patch-count calibration.** The single most important number for Phase 2 cost: how many **patch tokens** does the adapter need to emit before the proxy LLM can answer basic visual questions? Sweep {1, 3, 5, 10, 20} patches (0.2 view up to 4 views' worth) and plot quality vs. patch count. Values above 5 imply either multi-fixation or overlapping patchings — the sweep also tests whether that extra scale coverage is worth the token cost.
- **M1.6 — Full-scale local run.** One full training run of the chosen design on the proxy LLM with ~500K pairs. This is the dress rehearsal for Phase 2. Document wall-clock hours and memory.

**Exit criteria for Phase 1:** an adapter trained on a small proxy LLM that (a) produces coherent single-sentence captions on held-out COCO, (b) shows scale-invariance behavior (same object, different sizes → similar tokens), and (c) has a settled design recorded in `DESIGN.md` with explicit rejection notes for the alternatives. If we can't clear (a) on a proxy LLM, scaling up won't rescue it — halt and redesign.

## 5. Phase 2 — Cloud Scale-Up (target LLM)

**Purpose:** train the real adapter against Nemotron-3-Super-120B-A12B (primary) and Qwen3.5-122B (verification).

**Infrastructure.** Rented GPU node — 4×H100 or 8×A100, whichever is cheaper the week we're ready. Providers under consideration: Lambda, RunPod, Modal, Together. The training code must run on a single cloud node without cluster orchestration.

**Milestones:**

- **M2.1 — Port to target LLM.** Verify the Phase 1 adapter topology works at 120B scale, with the proxy-LLM connector swapped for the Nemotron embedding dimension. Smoke-test with 100 steps on the cloud node.
- **M2.2 — Stage 1 pretraining.** Frozen LLM, adapter only, ~1–2M image–text pairs. Budget estimate: **150–300 A100-hours** (honest uncertainty: could be 2× higher for log-polar tokens since the LLM has no prior for them). Deliverable: a checkpoint where the adapter's output distribution roughly matches LLM token statistics on held-out data.
- **M2.3 — Stage 2 fine-tuning.** LoRA on LLM attention (rank and scope TBD in Phase 1), instruction-tuning dataset (ShareGPT-4V, LLaVA-Instruct, or equivalent), ~300–700K samples. Budget estimate: **400–800 A100-hours**.
- **M2.4 — Cross-family validation.** Repeat M2.3 (not M2.2) against Qwen3.5-122B to confirm the adapter isn't overfit to Nemotron's embedding geometry. If the Qwen port requires retraining the connector from scratch, that's a finding to document, not a failure.
- **M2.5 — Benchmark and publish.** Run on MMMU, VQAv2, and at least one scale-invariance probe we design ourselves (same object at 4 distinct scales; measure caption consistency).

**Exit criteria for Phase 2:** a single checkpoint per base model that beats a reasonable baseline (e.g., LLaVA-1.5-7B retrained on the same instruction dataset) on at least one task where log-polar's inductive biases should help — scale-invariance probes and fine-grained center-of-image tasks are the obvious candidates.

## 6. Go / No-Go Gates

| Gate | Decision point | Criterion to proceed |
|---|---|---|
| **G0** | After M1.1 | Python can pull retinaCells for arbitrary images reliably; round-trip test passes |
| **G1** | After M1.3 | Adapter overfits 10 examples to near-zero loss within 500 steps |
| **G2** | After M1.4 | One design is clearly better than the alternatives; rationale documented |
| **G3** | After M1.5 | Patch count needed for coherent captions is ≤10 (≤2 views). If it takes 40+, log-polar's token-compactness advantage is gone; reconsider scope |
| **G4** | After M1.6 | Phase 1 run produces qualitatively reasonable captions; wall-clock is consistent with Phase 2 cost estimates after scaling |
| **G5** | After M2.2 | Stage 1 loss curves flatten at a plausible value; no pathological behaviors (mode collapse, repetition) |
| **G6** | After M2.3 | At least one benchmark result within striking distance of a comparable LLaVA baseline |

Any gate failure triggers a review in `DESIGN.md`: what changed, what we'd revise, whether to push forward or halt. No gate is "warn and continue by default" — a fail means a meeting (or a chat log, at least).

## 7. Risk Register

- **The LLM can't absorb the alien token distribution even with LoRA.** Mitigation: design bake-off in M1.4 includes "LoRA on all layers" as a fallback topology. If even that fails, the adapter may need to pre-translate retinaCells into a representation closer to ViT patches before embedding.
- **Data supply for scale-invariance training.** Standard captioning datasets don't systematically vary object scale. Mitigation: include a synthetic multi-scale augmentation stream (single image rendered at 4 scales, same caption) to explicitly train the scale-invariance property.
- **pybind11 rabbit hole.** The flagged Python-binding issue could be a day or a week. Mitigation: budget 3 days for M1.1; if not resolved, fall back to calling the C++ library via subprocess or ctypes and revisit.
- **Cloud cost overrun.** Phase 2 estimates have honest ±2× uncertainty. Mitigation: treat the first Stage-1 run as a calibration and revise the Stage-2 budget before kicking it off.
- **Nemotron MLX quantization artifacts.** MXFP4 on the editor side of aider means the worker model is making implementation decisions under 4-bit quantization, which may hurt code quality. Mitigation: architect (Opus) catches this at planning time; if worker output degrades, swap to a higher-precision local model for editing and keep Nemotron for inference benchmarking only.

## 8. What lives where

- **`PLAN.md`** (this file): phases, gates, risks. Stable. Edits require explicit rationale.
- **`DESIGN.md`** (to be created in M1.4): the chosen adapter topology, hyperparameters, and *why* — including what was tried and rejected. Living document.
- **`CONVENTIONS.md`** (to be created before first aider session): engineering rules — Python version, style, test contracts, git hygiene. Loaded by aider every architect turn.
- **`src/lpx_adapter/adapter/`**: model code.
- **`src/lpx_adapter/training/`**: loss, loop, schedulers.
- **`src/lpx_adapter/data/`**: dataloaders and augmentation.
- **`src/lpx_adapter/eval/`**: benchmarks and scale-invariance probes.
- **`pyproject.toml`**: nested src-layout installable via `pip install -e .`. The C++ `lpximage` extension is outside pip's scope; build it separately via `install_local.sh`.
- **`experiments/YYYY-MM-DD-<name>/`**: one directory per training run, with config, logs, and a short `result.md`.

## 9. Known unknowns flagged for the first architect session

- Choice of proxy LLM (Qwen3-4B vs. Nemotron-Nano) — decided by MLX compatibility and tokenizer ergonomics.
- Exact caption dataset for M1.2 — COCO is the default; we might prefer a denser-caption dataset if one is easy to stream.
- Which cloud provider for Phase 2 — defer until after M1.6 when we have real wall-clock data.
- Whether `lpx_saccade_wrapper.py` and friends in the repo root should be retained, moved to `legacy/`, or deleted. Recommend a tidy-up before the first aider run so the architect's view of the repo is clean.
