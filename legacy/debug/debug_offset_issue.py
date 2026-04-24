#!/usr/bin/env python3
"""
Debug the offset issue to understand what's happening
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'python'))

import lpximage
import cv2
import numpy as np

# Initialize
lpximage.initLPX("ScanTables63", 640, 480)
tables = lpximage.LPXTables("ScanTables63")
renderer = lpximage.LPXRenderer()
renderer.setScanTables(tables)

# Create a test image with clear markers
test_img = np.ones((480, 640, 3), dtype=np.uint8) * 30  # Dark gray background

# Add a grid
for x in range(0, 640, 40):
    cv2.line(test_img, (x, 0), (x, 480), (60, 60, 60), 1)
for y in range(0, 480, 40):
    cv2.line(test_img, (0, y), (640, y), (60, 60, 60), 1)

# Add distinct colored regions
cv2.rectangle(test_img, (280, 200), (360, 280), (0, 255, 0), -1)  # Green center
cv2.rectangle(test_img, (380, 200), (460, 280), (255, 0, 0), -1)  # Blue right
cv2.rectangle(test_img, (180, 200), (260, 280), (0, 0, 255), -1)  # Red left

# Mark the exact center
cv2.circle(test_img, (320, 240), 3, (255, 255, 255), -1)

print("Test image created with:")
print("  Green rectangle at center")
print("  Blue rectangle to the right") 
print("  Red rectangle to the left")
print()

# Test different offsets
offsets = [
    (0, 0, "Center - should see green"),
    (100, 0, "Right 100 - should see blue"),
    (-100, 0, "Left 100 - should see red"),
]

for x_off, y_off, description in offsets:
    print(f"\n--- Scanning with offset ({x_off}, {y_off}): {description} ---")
    
    # Scan
    lpx_img = lpximage.scanImage(test_img, 320 + x_off, 240 + y_off)
    
    # Get center cell value
    if lpx_img:
        center_val = lpx_img.getCellValue(0)
        # Extract RGB
        r = (center_val >> 16) & 0xFF
        g = (center_val >> 8) & 0xFF
        b = center_val & 0xFF
        
        print(f"  Center cell RGB: ({r}, {g}, {b})")
        
        # Identify color
        if g > 200 and r < 100 and b < 100:
            print("  ✓ Seeing GREEN (correct for center scan)")
        elif b > 200 and r < 100 and g < 100:
            print("  ✓ Seeing BLUE (correct for right scan)")
        elif r > 200 and g < 100 and b < 100:
            print("  ✓ Seeing RED (correct for left scan)")
        else:
            print(f"  ? Unexpected color")
            
        # Render and check position
        rendered = renderer.renderToImage(lpx_img, 640, 480, 1.0)
        gray = cv2.cvtColor(rendered, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 5, 255, cv2.THRESH_BINARY)
        M = cv2.moments(thresh)
        
        if M["m00"] > 0:
            cx = M["m10"] / M["m00"]
            cy = M["m01"] / M["m00"]
            dist = np.sqrt((cx - 320)**2 + (cy - 240)**2)
            print(f"  Rendered center: ({cx:.1f}, {cy:.1f})")
            print(f"  Distance from expected center: {dist:.1f} pixels")
            
            if dist > 10:
                print("  ❌ ERROR: Rendered image is offset!")
            else:
                print("  ✓ Rendered image is centered")
    else:
        print("  ERROR: Failed to scan")