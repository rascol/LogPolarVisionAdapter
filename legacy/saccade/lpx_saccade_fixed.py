#!/usr/bin/env python3
"""
LPX Saccade Fixed - Workaround for the renderer scaling issue

The problem: The C++ renderer applies compensation scaled by output_size/source_size,
which causes incorrect behavior when rendering at a different size than the source.

The solution: Always render at the same size as the source image (scale factor = 1.0),
then resize the output if needed for display.
"""

import sys
import os
import numpy as np
import cv2
from typing import Optional, Tuple

# Add build directory to path for lpximage module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'build', 'python'))
import lpximage


class LPXSaccadeFixed:
    """
    Fixed wrapper that works around the renderer scaling issue.
    
    The key insight: When rendering at the same size as the source image,
    the compensation scale becomes 1.0, which makes the compensation work correctly.
    """
    
    def __init__(self, scan_table_path: str = 'ScanTables63'):
        self.scan_table_path = scan_table_path
        self.tables = None
        self.renderer = None
        self.initialized = False
        
        # Current scan position offsets
        self.center_x_offset = 0.0
        self.center_y_offset = 0.0
        
        # Source image dimensions
        self.source_width = 0
        self.source_height = 0
        
    def initialize(self, width: int, height: int) -> bool:
        """Initialize the LPX system."""
        if not lpximage.initLPX(self.scan_table_path, width, height):
            print(f"Failed to initialize LPX system")
            return False
        
        self.tables = lpximage.LPXTables(self.scan_table_path)
        if not self.tables.isInitialized():
            print(f"Failed to load scan tables")
            return False
        
        self.renderer = lpximage.LPXRenderer()
        self.renderer.setScanTables(self.tables)
        
        self.source_width = width
        self.source_height = height
        self.initialized = True
        
        print(f"LPX Saccade Fixed initialized: {width}x{height}")
        print(f"Scan tables loaded: spiralPer={self.tables.spiralPer}")
        
        return True
    
    def handle_movement(self, delta_x: float, delta_y: float, step_size: float = 10.0):
        """Handle WASD movement commands."""
        self.center_x_offset += delta_x * step_size
        self.center_y_offset += delta_y * step_size
        
        # Apply bounds
        max_offset = 200.0
        self.center_x_offset = max(-max_offset, min(max_offset, self.center_x_offset))
        self.center_y_offset = max(-max_offset, min(max_offset, self.center_y_offset))
        
        print(f"[SCAN] Offset: ({self.center_x_offset:.0f}, {self.center_y_offset:.0f})")
    
    def scan_and_render_fixed(self, image: np.ndarray, 
                             display_width: int = 600, 
                             display_height: int = 600) -> Optional[np.ndarray]:
        """
        Scan and render with proper saccade support.
        
        The key fix: Always render at source size first, then resize for display.
        This ensures compensation scale = 1.0, which makes the math work correctly.
        """
        if not self.initialized:
            return None
        
        # Calculate scan position
        base_x = image.shape[1] / 2.0
        base_y = image.shape[0] / 2.0
        scan_x = base_x + self.center_x_offset
        scan_y = base_y + self.center_y_offset
        
        # Scan at offset position
        lpx_img = lpximage.scanImage(image, scan_x, scan_y)
        if not lpx_img:
            return None
        
        # CRITICAL FIX: Render at SOURCE SIZE (not display size)
        # This makes compScaleX = compScaleY = 1.0 in the renderer
        rendered_full = self.renderer.renderToImage(lpx_img, 
                                                   self.source_width, 
                                                   self.source_height, 
                                                   1.0)
        
        if rendered_full is None:
            return None
        
        # Now resize to display size if different
        if (display_width != self.source_width or 
            display_height != self.source_height):
            rendered = cv2.resize(rendered_full, (display_width, display_height), 
                                interpolation=cv2.INTER_LINEAR)
        else:
            rendered = rendered_full
        
        return rendered


def test_fixed_wrapper():
    """Test the fixed saccade wrapper."""
    print("=== Testing Fixed Saccade Wrapper ===\n")
    
    # Create 800x800 test image with markers
    test_img = np.zeros((800, 800, 3), dtype=np.uint8)
    
    # Center cross (white)
    cv2.line(test_img, (400, 350), (400, 450), (255, 255, 255), 3)
    cv2.line(test_img, (350, 400), (450, 400), (255, 255, 255), 3)
    
    # Directional markers
    cv2.circle(test_img, (400, 200), 30, (255, 0, 0), -1)  # Top - Blue
    cv2.circle(test_img, (400, 600), 30, (0, 255, 0), -1)  # Bottom - Green  
    cv2.circle(test_img, (200, 400), 30, (255, 255, 0), -1)  # Left - Yellow
    cv2.circle(test_img, (600, 400), 30, (255, 0, 255), -1)  # Right - Magenta
    
    # Initialize wrapper with SOURCE SIZE
    wrapper = LPXSaccadeFixed('ScanTables63')
    if not wrapper.initialize(800, 800):  # Use source size
        print("Failed to initialize wrapper")
        return False
    
    # Create window
    cv2.namedWindow('Fixed Saccade Test', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('Fixed Saccade Test', 800, 600)
    
    print("\nControls:")
    print("  WASD - Move scan position") 
    print("  R - Reset to center")
    print("  Q - Quit")
    print("\nThis version renders at source size then resizes,")
    print("which should fix the compensation scaling issue.\n")
    
    while True:
        # Scan and render with fix (renders at 800x800, displays at 600x600)
        rendered = wrapper.scan_and_render_fixed(test_img, 600, 600)
        
        if rendered is None:
            print("Failed to render")
            break
        
        # Add crosshair at display center
        center_x, center_y = 300, 300
        cv2.line(rendered, (center_x-10, center_y), (center_x+10, center_y), (0, 255, 255), 2)
        cv2.line(rendered, (center_x, center_y-10), (center_x, center_y+10), (0, 255, 255), 2)
        
        # Calculate center of mass
        gray = cv2.cvtColor(rendered, cv2.COLOR_BGR2GRAY)
        M = cv2.moments(gray)
        if M["m00"] != 0:
            com_x = int(M["m10"] / M["m00"])
            com_y = int(M["m01"] / M["m00"])
            # Draw center of mass (red dot)
            cv2.circle(rendered, (com_x, com_y), 5, (0, 0, 255), -1)
            
            # Check stability
            shift_x = com_x - center_x
            shift_y = com_y - center_y
            
            # Determine if compensation is working
            is_stable = abs(shift_x) < 15 and abs(shift_y) < 15
            
            # Show status
            offset_text = f"Scan Offset: ({wrapper.center_x_offset:.0f}, {wrapper.center_y_offset:.0f})"
            cv2.putText(rendered, offset_text, (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            shift_text = f"Image Shift: ({shift_x:+d}, {shift_y:+d})"
            color = (0, 255, 0) if is_stable else (0, 0, 255)
            cv2.putText(rendered, shift_text, (10, 55),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            
            status_text = "STABLE" if is_stable else "DRIFTING"
            cv2.putText(rendered, status_text, (10, 80),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        cv2.putText(rendered, "WASD: move, R: reset, Q: quit", (10, 580),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)
        
        cv2.imshow('Fixed Saccade Test', rendered)
        
        # Handle keyboard
        key = cv2.waitKey(30) & 0xFF
        
        if key == ord('q'):
            break
        elif key == ord('w'):
            wrapper.handle_movement(0, -1, 10)
        elif key == ord('s'):
            wrapper.handle_movement(0, 1, 10)
        elif key == ord('a'):
            wrapper.handle_movement(-1, 0, 10)
        elif key == ord('d'):
            wrapper.handle_movement(1, 0, 10)
        elif key == ord('r'):
            wrapper.center_x_offset = 0
            wrapper.center_y_offset = 0
            print("[SCAN] Reset to center")
    
    cv2.destroyAllWindows()
    print("\nTest completed")
    return True


if __name__ == '__main__':
    success = test_fixed_wrapper()
    sys.exit(0 if success else 1)