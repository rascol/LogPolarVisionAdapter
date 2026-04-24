# Final Fix Summary

## The Core Problem
The scan cache (`pixelToCellLUT`) is pre-computed assuming the scan is centered at a specific position. When we scan from an offset position, this lookup table gives wrong results.

## Why The Rendered Image Moves
1. The peripheral cells are being filled based on the wrong mapping
2. The renderer (correctly) places cells at fixed positions
3. Because the cells contain wrongly-mapped data, the image appears offset

## The Solution
We need to either:
1. **Recompute the scan cache for each offset** (expensive)
2. **Skip the cache for offset scans** and use the original binary search
3. **Store the offset and have the renderer compensate** (you said no to this)

## Recommended Fix
Since you want the renderer to be passive, the only solution is to fix the scanning. The simplest approach is to disable the optimized scan cache when using offsets and fall back to a correct but slower implementation.

The fovea is already fixed and working correctly. Only the peripheral scan needs fixing.