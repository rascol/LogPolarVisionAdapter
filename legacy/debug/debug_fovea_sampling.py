#!/usr/bin/env python3
"""Debug test to trace what coordinates are being sampled in the fovea"""

import lpximage
import numpy as np

def create_coordinate_test_image(width=640, height=480):
    """Create an image where pixel values encode their coordinates"""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Create a test pattern where we can identify coordinates
    # Center region (white cross)
    cx, cy = width//2, height//2
    
    # Horizontal line at center
    img[cy-2:cy+3, :] = [255, 255, 255]
    # Vertical line at center  
    img[:, cx-2:cx+3] = [255, 255, 255]
    
    # Mark specific test points with unique colors
    # Center point - bright red
    img[cy-5:cy+6, cx-5:cx+6] = [0, 0, 255]
    
    # Point at (cx+50, cy) - bright green
    if cx+50 < width:
        img[cy-5:cy+6, cx+45:cx+56] = [0, 255, 0]
    
    # Point at (cx-50, cy) - bright blue  
    if cx-50 >= 0:
        img[cy-5:cy+6, cx-55:cx-46] = [255, 0, 0]
    
    # Point at (cx, cy+50) - yellow
    if cy+50 < height:
        img[cy+45:cy+56, cx-5:cx+6] = [0, 255, 255]
        
    # Point at (cx, cy-50) - magenta
    if cy-50 >= 0:
        img[cy-55:cy-46, cx-5:cx+6] = [255, 0, 255]
    
    return img

def test_fovea_sampling():
    print("=== Fovea Sampling Debug Test ===\n")
    
    # Initialize
    lpximage.initLPX("ScanTables63")
    
    # Create test image
    test_img = create_coordinate_test_image()
    height, width = test_img.shape[:2]
    cx, cy = width//2, height//2
    
    print(f"Image size: {width}x{height}")
    print(f"Image center: ({cx}, {cy})")
    
    # Test positions
    positions = [
        ("Center", cx, cy, "Should sample red center point"),
        ("Right +50", cx + 50, cy, "Should sample green point"),
        ("Left -50", cx - 50, cy, "Should sample blue point"),
        ("Down +50", cx, cy + 50, "Should sample yellow point"),
        ("Up -50", cx, cy - 50, "Should sample magenta point"),
    ]
    
    print("\nTesting different scan positions:")
    print("-" * 50)
    
    for name, x, y, expected in positions:
        print(f"\n{name}: Scanning at ({x}, {y})")
        print(f"  Offset from center: ({x-cx}, {y-cy})")
        print(f"  Expected: {expected}")
        
        # Scan at this position
        lpx_img = lpximage.scanImage(test_img, float(x), float(y))
        
        if not lpx_img:
            print("  ERROR: Failed to scan")
            continue
            
        # Check stored offset
        stored_x_ofs = lpx_img.getXOffset()
        stored_y_ofs = lpx_img.getYOffset()
        print(f"  Stored offset: ({stored_x_ofs}, {stored_y_ofs})")
        
        # Get first few cell values (fovea region)
        print("  First 5 fovea cells (RGB):")
        for i in range(min(5, lpx_img.getLength())):
            value = lpx_img.getCellValue(i)
            if value is not None:
                r = (value >> 16) & 0xFF
                g = (value >> 8) & 0xFF
                b = value & 0xFF
                color_name = "unknown"
                if r > 200 and g < 50 and b < 50:
                    color_name = "RED (center)"
                elif r < 50 and g > 200 and b < 50:
                    color_name = "GREEN (right)"
                elif r < 50 and g < 50 and b > 200:
                    color_name = "BLUE (left)"
                elif r < 50 and g > 200 and b > 200:
                    color_name = "YELLOW (down)"
                elif r > 200 and g < 50 and b > 200:
                    color_name = "MAGENTA (up)"
                elif r > 200 and g > 200 and b > 200:
                    color_name = "WHITE (cross)"
                elif r == 0 and g == 0 and b == 0:
                    color_name = "BLACK (background)"
                    
                print(f"    Cell {i}: RGB({r},{g},{b}) - {color_name}")
        
        # Also check what's at the actual image coordinates we're trying to scan
        if 0 <= int(x) < width and 0 <= int(y) < height:
            actual_color = test_img[int(y), int(x)]
            print(f"  Actual pixel at ({int(x)},{int(y)}): BGR{tuple(actual_color)}")

if __name__ == "__main__":
    test_fovea_sampling()