#!/usr/bin/env python3
"""Debug script to verify scan center behavior"""

import lpximage
import numpy as np
import cv2
import time

def create_test_pattern(width=640, height=480):
    """Create a test pattern with distinct features at different locations"""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Draw a grid
    for x in range(0, width, 20):
        cv2.line(img, (x, 0), (x, height), (40, 40, 40), 1)
    for y in range(0, height, 20):
        cv2.line(img, (0, y), (width, y), (40, 40, 40), 1)
    
    # Draw unique markers at different positions
    # Center marker (red circle)
    cv2.circle(img, (width//2, height//2), 20, (0, 0, 255), -1)
    cv2.putText(img, "CENTER", (width//2 - 30, height//2 - 30), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # Right marker (blue square)
    cv2.rectangle(img, (width//2 + 100 - 20, height//2 - 20), 
                 (width//2 + 100 + 20, height//2 + 20), (255, 0, 0), -1)
    cv2.putText(img, "RIGHT", (width//2 + 100 - 20, height//2 - 30), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # Left marker (green triangle)
    pts = np.array([[width//2 - 100, height//2 - 20],
                    [width//2 - 120, height//2 + 20],
                    [width//2 - 80, height//2 + 20]], np.int32)
    cv2.fillPoly(img, [pts], (0, 255, 0))
    cv2.putText(img, "LEFT", (width//2 - 100 - 20, height//2 - 30), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # Up marker (yellow diamond)
    pts = np.array([[width//2, height//2 - 100 - 20],
                    [width//2 - 20, height//2 - 100],
                    [width//2, height//2 - 100 + 20],
                    [width//2 + 20, height//2 - 100]], np.int32)
    cv2.fillPoly(img, [pts], (0, 255, 255))
    cv2.putText(img, "UP", (width//2 - 10, height//2 - 130), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    
    # Down marker (magenta hexagon)
    pts = []
    for i in range(6):
        angle = i * np.pi / 3
        x = int(width//2 + 20 * np.cos(angle))
        y = int(height//2 + 100 + 20 * np.sin(angle))
        pts.append([x, y])
    cv2.fillPoly(img, [np.array(pts, np.int32)], (255, 0, 255))
    cv2.putText(img, "DOWN", (width//2 - 20, height//2 + 70), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    
    return img

def main():
    print("=== Saccade Debug Test ===")
    
    # Initialize
    lpximage.initLPX("ScanTables63", 640, 480)
    tables = lpximage.LPXTables("ScanTables63")
    renderer = lpximage.LPXRenderer()
    renderer.setScanTables(tables)
    
    # Create test image
    test_img = create_test_pattern()
    cv2.imshow("Original Test Pattern", test_img)
    
    # Test different scan positions
    positions = [
        (0, 0, "Center"),
        (50, 0, "Right (+50, 0)"),
        (-50, 0, "Left (-50, 0)"),
        (0, -50, "Up (0, -50)"),
        (0, 50, "Down (0, 50)"),
    ]
    
    for x_offset, y_offset, label in positions:
        print(f"\n--- Testing: {label} ---")
        
        # Calculate scan center
        center_x = test_img.shape[1] / 2.0 + x_offset
        center_y = test_img.shape[0] / 2.0 + y_offset
        
        print(f"Image size: {test_img.shape[1]}x{test_img.shape[0]}")
        print(f"Image center: ({test_img.shape[1]/2.0}, {test_img.shape[0]/2.0})")
        print(f"Scan center: ({center_x}, {center_y})")
        print(f"Offset from center: ({x_offset}, {y_offset})")
        
        # Scan
        lpx_img = lpximage.scanImage(test_img, center_x, center_y)
        
        if lpx_img:
            print(f"LPXImage created with {lpx_img.getLength()} cells")
            print(f"LPXImage stored offset: ({lpx_img.getXOffset()}, {lpx_img.getYOffset()})")
            
            # Render
            rendered = renderer.renderToImage(lpx_img, 800, 600, 1.0)
            
            if rendered is not None and rendered.size > 0:
                # Mark scan position on original
                marked_img = test_img.copy()
                cv2.circle(marked_img, (int(center_x), int(center_y)), 5, (0, 255, 0), -1)
                cv2.putText(marked_img, f"Scan: {label}", (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                
                # Add label to rendered
                cv2.putText(rendered, f"Rendered: {label}", (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(rendered, f"Stored offset: ({lpx_img.getXOffset():.1f}, {lpx_img.getYOffset():.1f})", 
                           (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
                
                # Show both
                cv2.imshow("Original with Scan Position", marked_img)
                cv2.imshow("Rendered LPX", rendered)
                
                print("\nPress any key to continue...")
                cv2.waitKey(0)
        else:
            print("Failed to create LPXImage")
    
    cv2.destroyAllWindows()
    print("\nDebug test complete!")

if __name__ == "__main__":
    main()