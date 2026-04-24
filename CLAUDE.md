# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Project identity

Two things live in this directory:

1. **LPXImage** — the existing, shipped C++ library (with Python bindings as the `lpximage` module) that converts standard video frames into a 1D array of log-polar cells and streams them over a socket. This is the substrate.
2. **Log-Polar Vision Adapter** — a greenfield project being planned in `PLAN.md` that will use LPXImage/LPXVision as the tokenizer for a vision adapter feeding a large LLM (Nemotron-3-Super-120B-A12B primary, Qwen3.5-122B secondary). **No adapter code exists yet** — `PLAN.md` is the source of truth for what's coming.

When in doubt about whether a task is "fix the library" vs. "build the adapter," check whether the code path already exists. If `src/adapter/`, `src/training/`, etc. are still absent, the task is almost certainly LPXImage-side.

## Build and run

### Preferred workflow: local build

```bash
./install_local.sh          # full clean build + local install (lib/, project root .so)
# or, after the initial install, incremental rebuilds:
cd build && make -j$(sysctl -n hw.ncpu)
```

`install_local.sh` runs cmake with `CMAKE_INSTALL_PREFIX=<project root>`, builds the C++ shared library, builds the pybind11 module, copies `lpximage.cpython-*.so` to the project root, and symlinks `liblpx_image.1.dylib` (and a `.dylib` alias) from `lib/` into the project root so the Python `.so`'s `@loader_path` RPATH resolves without manual intervention. Dependencies come from Homebrew on macOS (`brew install cmake opencv python@3.14`).

### Python path — the #1 footgun

Python will silently import a stale `lpximage` from site-packages instead of the local build unless you force the path. This is called out in both `INSTALL_PYTHON.md` and `python/README.md` as the top source of wasted debugging time. Always use one of:

```bash
PYTHONPATH=. python3 your_script.py                  # one-off
source setup.sh                                       # exports PYTHONPATH, PYTHONNOUSERSITE, etc., and defines lpx-python3
```

Or, in a new Python entry-point script, import `lpx_path_config` and call `lpx_path_config.configure()` before `import lpximage` — it walks up looking for `CMakeLists.txt`, finds `build/python/lpximage*.so`, and prepends it to `sys.path`. Scripts in `validate_saccades/` already do this inline.

To verify you're running the local module, `print(lpximage.__file__)` — it should point under the project directory, not `/opt/homebrew/...` or `site-packages`.

### Tests

```bash
PYTHONPATH=. python3 test/test_basic_import.py
PYTHONPATH=. python3 test/test_saccade_mode.py
PYTHONPATH=. python3 test/test_server_client_full.py
```

There is no pytest runner configured — tests are standalone `python3` scripts under `test/`, `validate_lpxvision/`, and `validate_saccades/`. Run them individually.

### Servers and clients

Three independent Python entry points exercise the streaming pipeline (all require `ScanTables63` in the cwd or via `--tables`):

```bash
python3 examples/lpx_server.py --camera 0 --width 640 --height 480   # webcam → LPX stream on :5050
python3 examples/lpx_file_server.py --file video.mp4 --loop          # file → LPX stream
python3 examples/lpx_renderer.py --host 127.0.0.1                    # subscribe + display
```

The saccade validation harness in `validate_saccades/` adds a second port (`--saccade_port 5051`) carrying `MovementCommand` packets back to the server to steer the log-polar center.

## Architecture

### Data flow

```
cv::Mat frame ──► LPXTables (ScanTables63) ──► LPXImage (1D uint32 cell array)
                                                  │
                                                  ├──► LPXStreamProtocol over TCP
                                                  │        │
                                                  │        ▼
                                                  │    LPXDebugClient ──► LPXRenderer ──► cv::Mat
                                                  │
                                                  └──► LPXVision ──► retinaCells (uint64, packed identifiers)
                                                                      │
                                                                      └──► (future) vision adapter → LLM
```

The scan tables (`ScanTables63` in the repo root, binary format) are the fixed map between pixel coordinates and log-polar cell indices. They are loaded once into a `std::shared_ptr<LPXTables>` and shared by all `LPXImage` instances. `LPXImage::scanFromImage(img, x_center, y_center)` is the hot path; `multithreadedScanImage()` is the parallel variant used by the server.

`LPXRenderer` performs the inverse — rendering the 1D cell array back to a 2D `cv::Mat` for display. There is no neural net involved; it's pure geometric inverse mapping weighted by cell count.

### LPXVision (the adapter's raw input)

`lpx_vision::LPXVision` takes an `LPXImage` and computes per-cell **retinaCells** — 24-bit packed identifiers with 8 × 3-bit components: `mwh` (luminance), `hue`, and six gradient fields (x/y/z × luminance/hue) derived from hexagonal-cell opponent-process color. A "view" is 151 retinaCells covering ~7 spiral revolutions (spiral period 21.5 cells/rev). This is a `friend class` of `LPXImage` to reach private color accumulators — see `include/lpx_image.h:139`.

**Python binding works** (cleared 2026-04-24, PLAN.md Gate 0). `'LPXVision' in dir(lpximage)` is True; `LPXVision(scanned_lpximage)` and its `spiralPer` / `viewlength` / `retinaCells` / `getCellIdentifierName()` members all behave. The historical "silent pybind11 registration failure" reported in earlier notes was misdiagnosed — the real cause was `lpximage` failing to `dlopen` at all (OpenCV/OpenEXR Homebrew drift, stale root dylib, or Python ABI mismatch). A clean `install_local.sh` against the current Homebrew stack resolves it. The binding code at `python/lpx_bindings.cpp:217-239` is fine.

### Saccades

`include/mt_lpx_saccade.h` + `src/mt_lpx_saccade.cpp` port a JavaScript gaze-control system — motion detection, saccade selection, random saccades after 4 s of no motion. The server holds the current center offset; the client sends `MovementCommand{deltaX, deltaY, stepSize}` on the saccade port and the server applies it before the next `scanFromImage` call. Saccade development is largely complete — multiple `SACCADE_*.md` and `RENDERING_FIX_SUMMARY.md` files in the root are postmortems of specific bugs in this subsystem.

### C++ library layout

- `src/mt_lpx_image.cpp`, `src/optimized_scan.cpp` — multithreaded scan
- `src/mt_lpx_renderer.cpp` — inverse render
- `src/lpx_webcam_server.cpp`, `src/lpx_file_server.cpp` — server/protocol
- `src/lpx_vision*.cpp` — retinaCell construction
- `src/main_*.cpp` — standalone C++ executables that link against `liblpx_image`

All source files compile into a single shared library `liblpx_image.1.dylib` (SOVERSION 1, no VERSION to avoid the redundant `liblpx_image.1.0.0.dylib` — see `CMakeLists.txt:64-71`). pybind11 module is a separate target in `python/` and links against `liblpx_image`.

### RPATH

macOS `@loader_path` RPATHs (`CMakeLists.txt:21-25`) let the Python `.so` find `liblpx_image.1.dylib` when both sit in the project root after `install_local.sh`. If you move the `.so` without moving the dylib, imports will fail with `Library not loaded: @rpath/liblpx_image.1.dylib`. `scripts/fix_macos_paths.sh` is the escape hatch.

## Conventions to preserve

- **Don't `pip install` the package into the active Python** while also keeping a local build — the site-packages copy will win imports and mask your changes. Uninstall or use `setup.sh` to override.
- **Scan tables path is positional**: most APIs take the path as a string, not an `LPXTables` object. The `"ScanTables63"` file must be reachable from the cwd unless you pass an absolute path.
- **`LPXDebugClient::processEvents()` must run on the main thread** on macOS (Cocoa requirement). The server and client are designed as a main-thread-renders / background-thread-networks split — see the usage example in `README.md`.
- **Loose files in the repo root are intentional scratch space**: `debug_*.py`, `diagnose_*.py`, `simple_offset_test.py`, `verify_image_position.py`, and the many `*_SUMMARY.md` / `*_FIX_PLAN.md` docs are debugging artifacts kept around for reference. `PLAN.md` §9 flags these for eventual cleanup into `legacy/` but hasn't been done.
- **`.js` files under `src/` and `validate_lpxvision/`** are historical — the C++ port replaced them but they're retained for reference when porting additional JS functionality.

## Working with PLAN.md

`PLAN.md` is the design doc for the future vision adapter. It is explicitly versioned ("Draft v0.5") and its preamble lists what each revision changed — preserve that changelog pattern when editing. The milestone IDs (M1.1, M1.2, ...) and gate IDs (G0, G1, ...) are referenced throughout and should be stable. `DESIGN.md` and `CONVENTIONS.md` are planned but don't exist yet.
