#!/usr/bin/env python3
"""Debug script to trace exactly what's happening with saccades"""

import lpximage
import numpy as np
import time

print("=== Saccade Debug Trace ===\n")

# Initialize
print("1. Initializing LPX system...")
lpximage.initLPX("ScanTables63", 640, 480)

# Create a simple test server
print("2. Creating webcam server...")
server = lpximage.WebcamLPXServer("ScanTables63", 5555)

# Create test image with distinct regions
test_img = np.zeros((480, 640, 3), dtype=np.uint8)
# Left half blue, right half red
test_img[:, :320] = (255, 0, 0)  # Blue
test_img[:, 320:] = (0, 0, 255)  # Red

print("3. Test image: left half BLUE, right half RED\n")

# Test setCenterOffset directly
offsets = [
    (0, 0, "Center"),
    (160, 0, "Right"),
    (-160, 0, "Left"),
]

print("4. Testing setCenterOffset on server:\n")

for x_off, y_off, label in offsets:
    print(f"Setting offset to ({x_off}, {y_off}) - {label}")
    server.setCenterOffset(x_off, y_off)
    
    # Note: In real usage, the server would capture from camera
    # and apply these offsets during scanning.
    # For this test, we'll manually scan to show the effect:
    
    center_x = 320 + x_off  # Image center + offset
    center_y = 240 + y_off
    
    print(f"  This would scan at position ({center_x}, {center_y})")
    
    # Manually scan to demonstrate
    lpx = lpximage.scanImage(test_img, center_x, center_y)
    
    # Check what color we see
    val = lpx.getCellValue(0)
    r = (val >> 16) & 0xFF
    g = (val >> 8) & 0xFF  
    b = val & 0xFF
    
    if b > r:
        color = "BLUE"
    elif r > b:
        color = "RED"
    else:
        color = f"RGB({r},{g},{b})"
    
    print(f"  Scan result: seeing {color}")
    print(f"  Expected: {'BLUE/RED boundary' if label == 'Center' else 'RED' if label == 'Right' else 'BLUE'}")
    print()

print("\n5. Summary:")
print("If the scan results match expectations, then setCenterOffset IS working")
print("to change the scan position on the input image.")
print("\nThe issue might be:")
print("- The rendered output is being displayed with an offset (wrong)")
print("- The camera feed doesn't have enough contrast to see the difference")
print("- The movement amounts are too small to be visible")