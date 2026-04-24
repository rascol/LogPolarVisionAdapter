# DESIGN.md — Log-Polar Vision Adapter

> **This document answers *why*, not *how*.** Architectural rationale only.
> Code-level rules live in `CONVENTIONS.md`. Phase/milestone/gate structure
> lives in `PLAN.md`. Experiment-specific numbers live under `experiments/`.

**Status:** Draft v0.1 (scaffolding). Fills out through M1.4 (design bake-off).

---

## 1. Why log-polar tokenization

Conventional ViTs tile an image into uniform square patches and feed a flat
grid to the LLM. That representation is scale-variant (an object at 2× size
yields a different token sequence), wastes tokens on peripheral detail, and
has no privileged center. LPXImage/LPXVision instead emits a 1D spiral of
log-polar cells: foveal cells are small and dense, peripheral cells are
large and sparse, and a scale change maps to a shift along the spiral —
scale invariance is free modulo the known rotation coupling (§2).

The hypothesis this project tests is that an LLM can absorb this alien
token distribution via a small learned connector, and that the result is
competitive with a ViT-based adapter on tasks where scale invariance and
center-biased attention matter (fine-grained center objects, multi-scale
probes).

The retinaCell representation itself — 24-bit packed with 8 × 3-bit
components (`mwh`, `hue`, six gradients) — is treated as a fixed,
hand-designed tokenizer. Replacing it is explicitly out of scope for v1.

## 2. Why these LLMs

- **Primary: Nemotron-3-Super-120B-A12B.** MoE, MLX-compatible at MXFP4,
  runnable locally for inference; verifies the adapter works at large scale.
- **Secondary: Qwen3.5-122B.** A second family ensures the adapter's design
  isn't overfit to one embedding geometry. If the connector must be
  retrained from scratch across families, that's a finding to document, not
  a failure (PLAN.md M2.4).
- **Phase 1 proxy: Qwen3-4B or Nemotron-Nano.** Small enough to iterate on
  design choices overnight. Choice between the two is deferred to M1.2
  (MLX port cleanliness + tokenizer ergonomics decides it).

A LLaVA-family baseline is retained only as a benchmark comparator, not a
substrate.

## 3. The adapter's job

Map a view's retinaCells into the target LLM's input-embedding space as a
short patch-token sequence (5 or 6 tokens per view, TBD M1.4). Nothing
more:

- No image understanding beyond what falls out of training the connector.
- No inference-time saccade control (the substrate has saccade machinery;
  v1 consumes 1 – N fixations emitted by an external process).
- No modifications to the retinaCell tokenizer itself.

Module boundaries follow this job:

| Module                    | Responsibility                                                    |
|---------------------------|-------------------------------------------------------------------|
| `lpx_adapter.adapter`     | Retinal-cell → LLM token-embedding projection (the connector).    |
| `lpx_adapter.training`    | Training loops, losses, schedulers, checkpointing.                |
| `lpx_adapter.data`        | (image, caption) → (retinaCells, text) datasets and augmentation. |
| `lpx_adapter.eval`        | Caption perplexity, patch-count sweeps, scale-invariance probes.  |

## 4. Non-goals

- Replacing LPXVision. Retinacell encoding is fixed.
- Custom multimodal chat UI. Targets an existing inference harness
  (Transformers for Qwen, MLX for Nemotron).
- Real-time saccade control.
- Multi-node training. A single cloud node (4×H100 or 8×A100) is the
  Phase-2 target.

## 5. Deviations from PLAN.md

PLAN.md §8 lists flat `src/{adapter,training,data,eval}/` directories.
Scaffolding uses **nested `src/lpx_adapter/{adapter,training,data,eval}/`**
instead. Rationale:

- Installable as a single package via `pip install -e .`, so training
  scripts, eval harnesses, and checkpoints import `from lpx_adapter.X`
  rather than relying on `PYTHONPATH` hacks (same footgun `CLAUDE.md`
  flags for `lpximage`).
- Flat top-level names (`training`, `data`) collide with common pip
  packages and would force a rename once imports proliferate.

PLAN.md §8 should be updated in its next revision to reflect the nested
layout; this DESIGN.md entry records the override in the meantime.

## 6. Decisions to record here (post-M1.4)

Deliberately empty until each is resolved by experiment:

- Token representation: 5 × 30-cell patches vs. 6 × 25-cell patches.
- Patch encoder: mini-transformer vs. wide 1D conv vs. MLP.
- Positional encoding scheme.
- Scale invariance: augmentation-time vs. inference-time.
- Fixations per image: single vs. multi-saccade.
- Adapter topology: MLP connector vs. cross-attention vs. prefix tokens.
- LLM freezing policy: frozen vs. LoRA-attention vs. LoRA-everywhere.
- Signatures in the training loop or not.

When each is resolved, record **what was tried, what was picked, and why
the alternatives were rejected.** The rejection notes are the load-bearing
part.
