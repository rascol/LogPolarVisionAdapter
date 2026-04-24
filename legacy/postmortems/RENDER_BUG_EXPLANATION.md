# The Saccade Rendering Bug - Root Cause

## The Fundamental Problem

The C++ renderer has a critical assumption that breaks saccade support:
**It assumes the log-polar cells always contain data scanned from the center of the source image.**

## What Happens During Scanning

When you press WASD and scan at position (500, 400) instead of (400, 400):
1. The scanner correctly samples from position (500, 400)
2. Cell[0] now contains the pixel at (500, 400), not (400, 400)
3. Cell[1] contains a pixel near (500, 400), not near (400, 400)
4. And so on for all cells

## What the Renderer Does Wrong

The C++ renderer uses `getXCellIndex(x - centerX, y - centerY, spiralPer)` to determine which cell to display at each output pixel.

For output pixel at (centerX, centerY):
- It calculates: cell_index = getXCellIndex(0, 0, spiralPer) = 0
- It displays Cell[0]
- But Cell[0] contains data from (500, 400), not (400, 400)!

This causes the visual shift because the renderer is displaying cells at the wrong positions.

## Why Setting Offsets to 0 Didn't Fix It

We tried setting j_ofs = k_ofs = 0, which prevented the renderer from shifting the output position. But this doesn't fix the fundamental problem: **the renderer doesn't know how to map cells that were scanned at an offset position**.

## The Correct Solution (What JavaScript Does)

The JavaScript renderer:
1. Uses pre-computed scan tables that map output pixels to cells
2. When scanning at an offset, it adjusts which part of the scan table is used
3. This correctly maps the offset-scanned cells to the right output positions

## Why a Quick Fix is Difficult

To properly fix this, the C++ renderer would need to:
1. Stop using direct `getXCellIndex` calculation
2. Load and use the scan tables' pixel-to-cell mapping
3. Apply offsets to the scan table lookup (not to output position)

This is a major architectural change, not a simple bug fix.

## Current Workaround

With j_ofs = k_ofs = 0, we prevent additional shifting, but the fundamental mapping is still wrong. The image appears to move because we're displaying offset-scanned content using center-based mapping.

## Visual Confirmation

In our test:
- Cyan crosshair: Stays at display center (correct)
- Red dot (center of mass): Moves with scan position (incorrect)

This confirms that the rendered content is shifting due to the incorrect cell-to-pixel mapping.