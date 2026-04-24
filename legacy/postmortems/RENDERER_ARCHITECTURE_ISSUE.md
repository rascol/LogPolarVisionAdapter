# C++ Renderer Architecture Issue

## Core Problem
The C++ renderer (`mt_lpx_renderer.cpp`) has a fundamental architectural difference from the JavaScript renderer that prevents it from correctly handling scan position offsets.

## JavaScript Renderer (Correct Behavior)
The JavaScript renderer in `LPXImage.js`:
1. **Uses scan tables** to map output pixels to log-polar cells
2. **For peripheral regions**: Uses pre-computed `outerPixelCellIdx` array from scan tables
3. **For fovea region only**: Uses direct calculation with `getLPXCellIndex`
4. **Handles offsets properly**: Uses offsets to shift which part of the scan map is accessed

## C++ Renderer (Current Issues)
The C++ renderer:
1. **Uses direct calculation for ALL pixels** via `getXCellIndex`
2. **Doesn't use scan tables** for peripheral regions
3. **Incorrectly maps** screen coordinates to cells
4. **Can't handle offsets** because it assumes cells contain data for specific screen positions

## Why This Causes Problems
When the scan position changes (via WASD):
- The scan captures different content from the source image
- This content is stored in the log-polar cells
- The JavaScript renderer correctly uses scan tables to map these cells to output pixels
- The C++ renderer incorrectly tries to calculate which cell "should" be at each screen position

## Attempted Fixes
1. **Setting offsets to 0**: Prevents image shifting but doesn't fix content mapping
2. **Adding/subtracting offsets**: Doesn't work because the fundamental mapping is wrong
3. **Various sign changes**: Can't fix the architectural issue

## Proper Solution
The C++ renderer needs to be rewritten to:
1. Load and use the scan tables' `outerPixelCellIdx` array
2. Use this array to map output pixels to cells for peripheral regions
3. Only use direct calculation for the fovea region
4. Apply offsets by shifting scan map access (like JavaScript does)

## Current Workaround
With offsets disabled (set to 0), the rendered image will at least stay centered in the frame, though the content won't correctly reflect the scan position changes.

## Impact
- Python applications using the lpximage library are affected
- C++ executables (main_webcam_server, main_debug_renderer) are affected
- The scanning works correctly (content is captured from different positions)
- The rendering is incorrect (can't properly display the scanned content)

## Recommendation
For proper saccade support, the C++ renderer needs a significant rewrite to match the JavaScript architecture. This would involve:
1. Loading the full scan table data structures
2. Implementing the scan map offset calculations
3. Using scan tables for peripheral pixel mapping
4. Properly handling the fovea region separately

Without this rewrite, the system can scan at different positions but can't correctly render the results.