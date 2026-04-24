#!/usr/bin/env python3
"""Simple test to verify saccade offset behavior"""

import lpximage
import numpy as np
import cv2

def create_test_image(width=640, height=480):
    """Create a test pattern with colored regions"""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Create quadrants with different colors
    # Top-left: Red
    img[0:height//2, 0:width//2] = [0, 0, 128]
    # Top-right: Green  
    img[0:height//2, width//2:width] = [0, 128, 0]
    # Bottom-left: Blue
    img[height//2:height, 0:width//2] = [128, 0, 0]
    # Bottom-right: Yellow
    img[height//2:height, width//2:width] = [0, 128, 128]
    
    # Add center marker (white circle)
    cv2.circle(img, (width//2, height//2), 20, (255, 255, 255), -1)
    
    # Add offset markers
    cv2.circle(img, (width//2 + 100, height//2), 10, (255, 0, 255), -1)  # Magenta right
    cv2.circle(img, (width//2 - 100, height//2), 10, (0, 255, 255), -1)  # Cyan left
    
    return img

def get_center_color(lpx_img):
    """Get the color of the center (fovea) cell"""
    if lpx_img and lpx_img.getLength() > 0:
        # Get the first cell (center/fovea) value
        value = lpx_img.getCellValue(0)
        if value is not None:
            # Value is a 32-bit RGBA packed integer
            r = (value >> 16) & 0xFF
            g = (value >> 8) & 0xFF
            b = value & 0xFF
            return (r, g, b)
    return None

def main():
    print("=== Simple Saccade Offset Test ===")
    
    # Initialize lpximage
    lpximage.initLPX("ScanTables63")
    
    # Create renderer and scan tables
    renderer = lpximage.LPXRenderer()
    tables = lpximage.LPXTables("ScanTables63")
    renderer.setScanTables(tables)
    
    # Create test image
    test_img = create_test_image()
    img_height, img_width = test_img.shape[:2]
    
    # Test different scan positions
    test_positions = [
        ("Center (white)", img_width/2, img_height/2),
        ("Right (magenta)", img_width/2 + 100, img_height/2),
        ("Left (cyan)", img_width/2 - 100, img_height/2),
        ("Top-left (red)", img_width/4, img_height/4),
        ("Bottom-right (yellow)", 3*img_width/4, 3*img_height/4),
    ]
    
    rendered_images = []
    
    for name, x, y in test_positions:
        print(f"\nScanning at {name}: ({x:.0f}, {y:.0f})")
        
        # Scan the image at this position
        lpx_img = lpximage.scanImage(test_img, x, y)
        
        if not lpx_img:
            print(f"  Failed to scan image")
            continue
        
        # Get center color
        center_color = get_center_color(lpx_img)
        if center_color:
            print(f"  Center cell color (RGB): {center_color}")
        
        # Render the LPXImage
        rendered = renderer.renderToImage(lpx_img, 400, 400, 1.0)
        
        if rendered is None or rendered.size == 0:
            print("  Failed to render image")
            continue
            
        # Add label to rendered image
        cv2.putText(rendered, name, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(rendered, f"Scan: ({x:.0f}, {y:.0f})", (10, 60),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
        
        rendered_images.append(rendered)
        
        # Show original with scan position marked
        orig_display = test_img.copy()
        cv2.circle(orig_display, (int(x), int(y)), 5, (0, 255, 0), -1)
        cv2.circle(orig_display, (int(x), int(y)), 30, (0, 255, 0), 2)
        cv2.putText(orig_display, name, (int(x) + 35, int(y) - 35),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        cv2.imshow(f"Original - {name}", orig_display)
        cv2.imshow(f"Rendered - {name}", rendered)
        
        print("  Press any key to continue...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    
    # Show all rendered images together for comparison
    if rendered_images:
        print("\n=== Comparison View ===")
        print("All rendered images should be centered in their windows.")
        print("The CONTENT should change, but the log-polar image should NOT move.")
        
        for i, (name, _, _) in enumerate(test_positions[:len(rendered_images)]):
            cv2.imshow(f"Rendered {i+1}: {name}", rendered_images[i])
        
        print("\nPress any key to exit...")
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    
    print("\nTest complete!")

if __name__ == "__main__":
    main()