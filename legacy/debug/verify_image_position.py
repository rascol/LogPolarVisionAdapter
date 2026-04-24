#!/usr/bin/env python3
"""
Test to verify if the rendered image position is changing with WASD movements
"""

import cv2
import numpy as np
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'python'))
import lpximage

def test_render_position():
    """Test if the rendered image position changes with offsets"""
    print("Testing render position with different offsets...")
    
    # Initialize LPX system
    lpximage.initLPX("ScanTables63", 640, 480)
    
    # Load scan tables for renderer
    tables = lpximage.LPXTables("ScanTables63")
    renderer = lpximage.LPXRenderer()
    renderer.setScanTables(tables)
    
    # Create a test image with clear features
    test_img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Add a grid pattern
    for x in range(0, 640, 40):
        cv2.line(test_img, (x, 0), (x, 480), (100, 100, 100), 1)
    for y in range(0, 480, 40):
        cv2.line(test_img, (0, y), (640, y), (100, 100, 100), 1)
    
    # Add colored markers
    cv2.circle(test_img, (320, 240), 20, (0, 255, 0), -1)  # Center green
    cv2.circle(test_img, (100, 100), 15, (255, 0, 0), -1)  # Top-left blue
    cv2.circle(test_img, (540, 100), 15, (0, 0, 255), -1)  # Top-right red
    cv2.circle(test_img, (100, 380), 15, (255, 255, 0), -1)  # Bottom-left yellow
    cv2.circle(test_img, (540, 380), 15, (255, 0, 255), -1)  # Bottom-right magenta
    
    # Test different scan positions
    offsets = [
        (0, 0, "Center"),
        (100, 0, "Right 100"),
        (-100, 0, "Left 100"),
        (0, 100, "Down 100"),
        (0, -100, "Up 100"),
    ]
    
    rendered_images = []
    
    for x_off, y_off, label in offsets:
        # Scan from offset position
        scan_x = 320 + x_off  # Center + offset
        scan_y = 240 + y_off
        
        print(f"\nScanning at ({scan_x}, {scan_y}) - {label}")
        
        # Create LPX image by scanning
        lpx_img = lpximage.scanImage(test_img, scan_x, scan_y)
        
        # Render the image
        rendered = renderer.renderToImage(lpx_img, 640, 480, 1.0)
        
        # Add label to rendered image
        cv2.putText(rendered, f"Offset: {label}", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        rendered_images.append((rendered, label, x_off, y_off))
        
        # Show the image
        cv2.imshow("Rendered", rendered)
        print(f"Press any key to continue...")
        cv2.waitKey(0)
    
    # Now analyze if the circle center has moved
    print("\n" + "="*50)
    print("ANALYSIS: Checking if circle center moved...")
    print("="*50)
    
    centers = []
    for img, label, x_off, y_off in rendered_images:
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Find the brightest region (the log-polar circle)
        # Use threshold to find the rendered content
        _, thresh = cv2.threshold(gray, 10, 255, cv2.THRESH_BINARY)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            # Find the largest contour (should be the log-polar circle)
            largest = max(contours, key=cv2.contourArea)
            
            # Get the bounding circle
            (cx, cy), radius = cv2.minEnclosingCircle(largest)
            
            centers.append((cx, cy, label))
            print(f"{label}: Circle center at ({cx:.1f}, {cy:.1f})")
        else:
            print(f"{label}: Could not find circle")
    
    # Check if all centers are the same
    if centers:
        first_center = centers[0][:2]
        all_same = True
        for cx, cy, label in centers[1:]:
            dist = np.sqrt((cx - first_center[0])**2 + (cy - first_center[1])**2)
            if dist > 5:  # Allow 5 pixel tolerance
                all_same = False
                print(f"  ⚠️ {label} center differs by {dist:.1f} pixels!")
        
        if all_same:
            print("\n✅ SUCCESS: Circle stays centered (within 5 pixel tolerance)")
            print("The rendered image is correctly staying in place.")
        else:
            print("\n❌ PROBLEM: Circle center is moving with offsets!")
            print("This indicates the renderer is incorrectly applying offsets.")
    
    cv2.destroyAllWindows()

if __name__ == "__main__":
    test_render_position()