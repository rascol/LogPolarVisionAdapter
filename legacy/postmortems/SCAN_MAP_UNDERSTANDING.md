# Understanding Scan Maps and Offsets

## The Scan Map Coordinate System

The scan tables contain mappings from "scan map" coordinates to cell indices. The scan map is a virtual coordinate space with dimensions `mapWidth x mapWidth` (it's square).

- Scan map center: `(mapWidth/2, mapWidth/2)`
- Scan map coordinates range from `(0, 0)` to `(mapWidth-1, mapWidth-1)`

## The Problem

When scanning from an offset position, we were incorrectly trying to use the scan map as if it represented image coordinates. This is wrong!

## The Correct Approach

1. The scan map defines a **fixed pattern** of which positions map to which cells
2. This pattern is **always centered** in the scan map coordinate space
3. When we apply an offset, we're moving where in the image we sample from, NOT changing the scan map

## How It Should Work

For peripheral scanning:
1. We need to map scan map positions to image positions
2. The scan map center (mapWidth/2, mapWidth/2) should map to the scan center (x_center, y_center)
3. Each scan map position (sm_x, sm_y) maps to image position:
   - img_x = (sm_x - mapWidth/2) + x_center
   - img_y = (sm_y - mapWidth/2) + y_center
4. We then sample from these image positions

The key insight: The scan map is like a template that we place at the scan center position on the image.