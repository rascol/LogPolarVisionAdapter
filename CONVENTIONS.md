# CONVENTIONS.md — how we write code here

> **This document answers *how we write code here*, not *why*.** Rationale
> for architectural choices lives in `DESIGN.md`. Phase/milestone structure
> lives in `PLAN.md`. If you find yourself writing "because..." here past
> a single clause, it belongs in `DESIGN.md`.

**Status:** Draft v0.1. Loaded at the start of every architect session.

---

## 1. Package layout

- **Src-layout, nested package.** Adapter code lives under
  `src/lpx_adapter/{adapter,training,data,eval}/`. All imports go through
  `lpx_adapter.*` — never `from adapter import …`.
- Install editable before working: `pip install -e .` (from repo root).
  Do not rely on `PYTHONPATH=src` as a substitute.
- **Do not** add adapter code at `src/adapter/` top level or elsewhere
  outside the `lpx_adapter` package.
- The C++ `lpximage` extension is a **separate** build managed by
  `install_local.sh` / CMake. Do not add its build to `pyproject.toml`.
  Adapter code that needs `lpximage` imports it as a normal third-party
  module after `install_local.sh` has populated the project root `.so`.

## 2. Python version and dependencies

- Target Python **≥3.11**. Use `from __future__ import annotations` only
  when deferred eval actually matters; otherwise plain annotations.
- Runtime dependencies go in `pyproject.toml` under `[project]
  dependencies`. Dev-only tools (pytest, ruff) go under
  `[project.optional-dependencies] dev`.
- Prefer conservative lower bounds (`>=X.Y`) over pins. Pin only when a
  known incompatibility requires it, and write a one-line comment saying
  which version breaks and how.

## 3. Configuration

- **pydantic-settings + YAML.** Every training/eval entry point takes a
  `pydantic_settings.BaseSettings` subclass, loaded from a `configs/*.yaml`
  file. Env vars override YAML.
- No `argparse`-driven training scripts past ~5 params. No
  `@hydra.main` decorators. No globals mutated at import time.
- A config object is passed **into** functions, not read from module
  scope. Training entry points look like:

  ```python
  def main(cfg: TrainConfig) -> None: ...
  ```

  with a tiny `if __name__ == "__main__"` that loads the YAML and calls
  `main(cfg)`.

## 4. Training loops

- **HuggingFace Accelerate.** Use `accelerate.Accelerator` for device
  placement, mixed precision, and multi-GPU. Do not use PyTorch Lightning.
- Raw-PyTorch loops are acceptable **only** in throwaway notebooks. Any
  code landing under `src/lpx_adapter/training/` uses Accelerate from its
  first commit.
- Checkpoints, logs, and configs for each run go under
  `experiments/YYYY-MM-DD-<name>/` alongside a short `result.md`. The
  `experiments/` tree is `.gitignore`'d except for `result.md` files.

## 5. Logging

- Use the stdlib `logging` module. Every module declares
  `logger = logging.getLogger(__name__)` at the top. Do not use `print`
  in library code.
- Log level is configured at entry-point startup from the config object,
  not hardcoded.
- Training loops emit per-step metrics through Accelerate's tracker
  interface (W&B or tensorboard; choice per-run, not hardcoded).

## 6. Tests

- First-pass tests are standalone `python -m lpx_adapter.…` scripts or
  short `pytest` modules under `tests/`. A pytest runner gets added when
  the suite crosses ~5 test files.
- Adapter correctness tests must overfit a tiny fixture (e.g., 1 – 10
  pairs) and assert loss falls below a threshold — no mocked training.
- Dataset tests verify determinism: same seed → same first batch.

## 7. Git hygiene

- Commit messages: imperative subject line under 72 chars, blank line,
  body explaining *why* (not *what*). Milestone completions tagged
  `m1.1`, `m1.2`, … matching `PLAN.md`.
- No commits to `main` that break `pip install -e .` or `install_local.sh`.
- Co-author trailer on machine-assisted commits.

## 8. Adding a new module

1. Decide which submodule it belongs in (`adapter`, `training`, `data`,
   `eval`). If it fits none, the submodule list is wrong — update
   `DESIGN.md` §3 first.
2. Create the file under `src/lpx_adapter/<submodule>/<name>.py`.
3. Import via `from lpx_adapter.<submodule> import <name>`.
4. If it introduces a new runtime dep, add it to `pyproject.toml` in the
   same commit.

## 9. What this document is not

Not a style guide (`ruff` decides formatting). Not a design document
(`DESIGN.md`). Not a changelog (git log). Keep it short enough that an
architect can reread it in under two minutes at the start of a session.
