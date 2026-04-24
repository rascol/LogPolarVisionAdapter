# Saccade Offset Fix Plan

## The Problem
When using WASD to move the scan position, the entire rendered log-polar image moves within the display window instead of staying centered and showing different content.

## Root Cause
The scanning process incorrectly applies offsets to the pixel-to-cell mapping. When scanning from an offset position (x_center + offset, y_center + offset), the current code:
1. Shifts the entire coordinate system
2. Maps pixels to cells based on this shifted coordinate system
3. Results in cells being filled with wrong content

This causes the renderer (which is correctly passive) to display an image that appears offset.

## The Fix
The scan should:
1. Keep the pixel-to-cell mapping constant (always based on image center)
2. Only offset the sampling position when reading pixels
3. Fill cells based on the unshifted coordinate system

### Changes Required

#### In `optimized_scan.cpp`:

**Fovea Processing (lines 233-235):**
- Current: Maps offset coordinates directly to cells
- Fix: Map unshifted coordinates to cells, but sample from offset position

**Peripheral Processing (lines 139-142, 148-163):**  
- Current: Calculates scan map indices based on offset position
- Fix: Calculate scan map indices based on image coordinates, then sample from offset position

### Key Principle
The scan tables define a fixed relationship between image positions and log-polar cells. This relationship should NOT change when we move the scan position. Only the sampling location should move.

### Implementation
Replace coordinate calculations to separate:
- **Cell mapping coordinates**: Always relative to image center
- **Sampling coordinates**: Relative to scan center (with offset)