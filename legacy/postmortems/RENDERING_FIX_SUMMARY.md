# Saccade Offset Rendering Fix Summary

## Problem Description
When using WASD keys to move the scanning position in the LPXImage system, the entire rendered image was visibly shifting inside the display window. This was contrary to the expected behavior where the displayed image should remain centered and only the content should change.

## Root Cause
The C++ renderer (`mt_lpx_renderer.cpp`) was incorrectly applying scan position offsets, causing the output image to shift position rather than just changing which content was being displayed.

### Key Issues:
1. **Incorrect offset application**: The renderer was adding offsets to the output position instead of using them to determine which cells to read
2. **Sign confusion**: The stored offsets represent position relative to image center, and the renderer was applying them with the wrong sign

## The Fix

### Changes Made to `mt_lpx_renderer.cpp`:

1. **Lines 49-52**: Fixed coordinate calculation for all pixels
   ```cpp
   // BEFORE (incorrect):
   float relX = x - outputCenterX + j_ofs;
   float relY = y - outputCenterY + k_ofs;
   
   // AFTER (correct):
   float relX = x - outputCenterX - j_ofs;
   float relY = y - outputCenterY - k_ofs;
   ```

2. **Lines 80-82**: Fixed fovea region coordinate calculation  
   ```cpp
   // BEFORE (incorrect):
   float relXtoCenter = x - outputCenterX + j_ofs;
   float relYtoCenter = y - outputCenterY + k_ofs;
   
   // AFTER (correct):
   float relXtoCenter = x - outputCenterX - j_ofs;
   float relYtoCenter = y - outputCenterY - k_ofs;
   ```

3. **Lines 280-283**: Removed incorrect offset scaling and use stored offsets directly
   ```cpp
   // Get the scan position offsets - these affect which cells we read, not where we render
   int j_ofs = static_cast<int>(std::floor(lpxImage->getXOffset()));
   int k_ofs = static_cast<int>(std::floor(lpxImage->getYOffset()));
   ```

4. **Lines 215-220**: Removed adjusted center position calculation
   - The renderer now always uses the image center for rendering
   - Offsets only affect which cells are read, not where the output is positioned

## How It Works Now

The corrected renderer behavior matches the JavaScript implementation:

1. **Output position is fixed**: The rendered image always appears centered in the output window
2. **Scan offsets affect content**: The offsets determine which log-polar cells map to which output pixels
3. **Coordinate transformation**: For each output pixel at position (x, y):
   - Calculate relative position from output center
   - Apply scan offsets to get position in scan coordinate space  
   - Use this position to determine which log-polar cell to read

## Testing

Two test scripts verify the fix:

1. **`test_rendering_fix.py`**: Automated test that measures center of mass
2. **`test_visual_centering.py`**: Visual test showing three scans side-by-side

Both tests confirm that:
- The rendered image stays centered in the window
- Only the content changes when scan position moves
- The behavior now matches the JavaScript reference implementation

## Result

The saccade offset problem is now fixed. Moving the scan position with WASD keys changes what content is visible in the log-polar transform, but the rendered image remains centered in the display window, providing a stable viewing experience as intended.