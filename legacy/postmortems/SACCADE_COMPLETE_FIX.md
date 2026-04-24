# Complete Saccade Fix Summary

## The Requirements
1. When scan offset changes, scan from a different position on the input image
2. Store the offset in LPXImage
3. Renderer applies the same offset to keep visual display stable

## Implementation Status

### ✅ Completed
1. Added x_ofs and y_ofs back to LPXImage class
2. Added getters/setters for offsets
3. Store offsets during scanning (optimized_scan.cpp line 217)
4. Renderer applies offsets (mt_lpx_renderer.cpp lines 271-272)
5. Network protocol sends/receives offsets
6. Python bindings expose offset methods

### ❌ Issues Found
1. Fovea scanning is broken - not sampling from the correct positions
2. The test shows cell0 = 0x0 (black) instead of the expected color

## The Bug
In optimized_scan.cpp lines 234-235:
```cpp
const int x = static_cast<int>(x_center + sct->innerCells[i].x - scanMapCenterX);
const int y = static_cast<int>(y_center + sct->innerCells[i].y - scanMapCenterY);
```

This is incorrect. The innerCells positions are scan map coordinates, not offsets from the scan map center.

## The Fix Needed
The innerCells need to be treated as positions in the scan map coordinate system, then converted to image coordinates based on the scan center.