#!/usr/bin/env python3
"""
LPX Saccade Wrapper - Mimics client-server behavior for proper saccade support

This wrapper separates the scanning and rendering logic similar to how the C++ 
client-server model works, which allows saccades to function correctly.

The key is that the scan position changes but the renderer always expects to
render content as if it was scanned from the center, with compensation offsets
applied to keep the visual output stable.
"""

import sys
import os
import numpy as np
import threading
import queue
import time
from typing import Optional, Tuple

# Add build directory to path for lpximage module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'build', 'python'))
import lpximage


class LPXSaccadeWrapper:
    """
    Wrapper that mimics the client-server architecture for proper saccade support.
    
    In the C++ client-server model:
    - Server scans at offset positions and stores the offsets in LPXImage
    - Client renders with compensation based on stored offsets
    - This separation makes saccades work correctly
    
    This wrapper mimics that behavior in Python.
    """
    
    def __init__(self, scan_table_path: str = 'ScanTables63'):
        """
        Initialize the wrapper with scan tables.
        
        Args:
            scan_table_path: Path to the scan tables file
        """
        self.scan_table_path = scan_table_path
        self.tables = None
        self.renderer = None
        self.initialized = False
        
        # Current scan position offsets (similar to WebcamLPXServer)
        self.center_x_offset = 0.0
        self.center_y_offset = 0.0
        
        # Base image dimensions
        self.image_width = 0
        self.image_height = 0
        
        # Threading for mimicking server behavior
        self.scan_queue = queue.Queue(maxsize=3)
        self.render_queue = queue.Queue(maxsize=3)
        self.running = False
        
    def initialize(self, width: int, height: int) -> bool:
        """
        Initialize the LPX system with given dimensions.
        
        Args:
            width: Width of images to be scanned
            height: Height of images to be scanned
            
        Returns:
            True if initialization successful
        """
        if not lpximage.initLPX(self.scan_table_path, width, height):
            print(f"Failed to initialize LPX system")
            return False
        
        self.tables = lpximage.LPXTables(self.scan_table_path)
        if not self.tables.isInitialized():
            print(f"Failed to load scan tables")
            return False
        
        self.renderer = lpximage.LPXRenderer()
        self.renderer.setScanTables(self.tables)
        
        self.image_width = width
        self.image_height = height
        self.initialized = True
        
        print(f"LPX Saccade Wrapper initialized: {width}x{height}")
        print(f"Scan tables loaded: spiralPer={self.tables.spiralPer}")
        
        return True
    
    def set_scan_offset(self, x_offset: float, y_offset: float):
        """
        Set the scan position offset (mimics setCenterOffset in WebcamLPXServer).
        
        Args:
            x_offset: X offset from center
            y_offset: Y offset from center
        """
        self.center_x_offset = x_offset
        self.center_y_offset = y_offset
    
    def handle_movement(self, delta_x: float, delta_y: float, step_size: float = 10.0):
        """
        Handle WASD-style movement commands (mimics handleMovementCommand).
        
        Args:
            delta_x: -1 for left (A), +1 for right (D), 0 for no X movement
            delta_y: -1 for up (W), +1 for down (S), 0 for no Y movement
            step_size: Size of each movement step
        """
        # Accumulate offsets
        self.center_x_offset += delta_x * step_size
        self.center_y_offset += delta_y * step_size
        
        # Apply bounds
        max_offset = 200.0
        self.center_x_offset = max(-max_offset, min(max_offset, self.center_x_offset))
        self.center_y_offset = max(-max_offset, min(max_offset, self.center_y_offset))
        
        print(f"[SCAN] Movement ({delta_x}, {delta_y}) * {step_size} -> "
              f"Offset now: ({self.center_x_offset}, {self.center_y_offset})")
    
    def scan_image_with_saccade(self, image: np.ndarray) -> Optional['lpximage.LPXImage']:
        """
        Scan an image with current saccade offset (mimics server-side scanning).
        
        This is the key function that makes saccades work. It scans at an offset
        position but stores the offset in the LPXImage for the renderer to use
        for compensation.
        
        Args:
            image: Input image to scan (numpy array)
            
        Returns:
            LPXImage with proper offset information for rendering
        """
        if not self.initialized:
            print("ERROR: Wrapper not initialized")
            return None
        
        # Calculate scan position (center + offset)
        # This mimics what the WebcamLPXServer does
        base_x = image.shape[1] / 2.0
        base_y = image.shape[0] / 2.0
        
        scan_x = base_x + self.center_x_offset
        scan_y = base_y + self.center_y_offset
        
        # Perform the scan at the offset position
        lpx_img = lpximage.scanImage(image, scan_x, scan_y)
        
        if lpx_img:
            # The scan has already stored the offsets in the LPXImage
            # These will be used by the renderer for compensation
            stored_x = lpx_img.getXOffset()
            stored_y = lpx_img.getYOffset()
            
            # Debug output
            if abs(stored_x) > 0.1 or abs(stored_y) > 0.1:
                print(f"[SCAN] Scanned at ({scan_x:.1f}, {scan_y:.1f}), "
                      f"stored offsets: ({stored_x:.1f}, {stored_y:.1f})")
        
        return lpx_img
    
    def render_with_compensation(self, lpx_img: 'lpximage.LPXImage', 
                                width: int, height: int, 
                                scale: float = 1.0) -> Optional[np.ndarray]:
        """
        Render an LPXImage with proper compensation (mimics client-side rendering).
        
        The renderer will use the stored offsets to compensate and keep the
        visual output stable despite scan position changes.
        
        Args:
            lpx_img: LPXImage to render
            width: Output width
            height: Output height
            scale: Rendering scale factor
            
        Returns:
            Rendered image as numpy array
        """
        if not self.initialized or not lpx_img:
            return None
        
        # The renderer will automatically use the stored offsets for compensation
        # This mimics what the LPXDebugClient does
        rendered = self.renderer.renderToImage(lpx_img, width, height, scale)
        
        return rendered
    
    def scan_and_render(self, image: np.ndarray, 
                        render_width: int = 600, 
                        render_height: int = 600,
                        scale: float = 1.0) -> Optional[np.ndarray]:
        """
        Combined scan and render with saccade support.
        
        This is a convenience function that combines scanning and rendering
        in a way that properly supports saccades.
        
        Args:
            image: Input image to scan
            render_width: Width of rendered output
            render_height: Height of rendered output
            scale: Rendering scale factor
            
        Returns:
            Rendered image with proper saccade compensation
        """
        # Scan with current offset
        lpx_img = self.scan_image_with_saccade(image)
        if not lpx_img:
            return None
        
        # Render with compensation
        rendered = self.render_with_compensation(lpx_img, render_width, render_height, scale)
        
        return rendered


def test_wrapper():
    """Test the saccade wrapper with sample movements."""
    import cv2
    
    print("=== Testing LPX Saccade Wrapper ===\n")
    
    # Create test image with markers
    test_img = np.zeros((800, 800, 3), dtype=np.uint8)
    
    # Center cross (white)
    cv2.line(test_img, (400, 350), (400, 450), (255, 255, 255), 3)
    cv2.line(test_img, (350, 400), (450, 400), (255, 255, 255), 3)
    
    # Directional markers
    cv2.circle(test_img, (400, 200), 30, (255, 0, 0), -1)  # Top - Blue
    cv2.circle(test_img, (400, 600), 30, (0, 255, 0), -1)  # Bottom - Green
    cv2.circle(test_img, (200, 400), 30, (255, 255, 0), -1)  # Left - Cyan
    cv2.circle(test_img, (600, 400), 30, (255, 0, 255), -1)  # Right - Magenta
    
    # Initialize wrapper
    wrapper = LPXSaccadeWrapper('ScanTables63')
    if not wrapper.initialize(800, 800):
        print("Failed to initialize wrapper")
        return False
    
    # Create window
    cv2.namedWindow('Saccade Test', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('Saccade Test', 800, 600)
    
    print("\nControls:")
    print("  WASD - Move scan position")
    print("  R - Reset to center")
    print("  Q - Quit\n")
    
    while True:
        # Scan and render with current offset
        rendered = wrapper.scan_and_render(test_img, 600, 600)
        
        if rendered is None:
            print("Failed to render")
            break
        
        # Add crosshair at display center
        center_x, center_y = 300, 300
        cv2.line(rendered, (center_x-10, center_y), (center_x+10, center_y), (0, 255, 255), 2)
        cv2.line(rendered, (center_x, center_y-10), (center_x, center_y+10), (0, 255, 255), 2)
        
        # Add text overlay showing current offset
        offset_text = f"Offset: ({wrapper.center_x_offset:.0f}, {wrapper.center_y_offset:.0f})"
        cv2.putText(rendered, offset_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(rendered, "WASD to move, R to reset, Q to quit", (10, 580),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        
        # Calculate center of mass to verify stability
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
            stability_text = f"Shift: ({shift_x:+d}, {shift_y:+d})"
            color = (0, 255, 0) if (abs(shift_x) < 20 and abs(shift_y) < 20) else (0, 0, 255)
            cv2.putText(rendered, stability_text, (10, 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        cv2.imshow('Saccade Test', rendered)
        
        # Handle keyboard input
        key = cv2.waitKey(30) & 0xFF
        
        if key == ord('q'):
            break
        elif key == ord('w'):
            wrapper.handle_movement(0, -1, 10)  # Move up
        elif key == ord('s'):
            wrapper.handle_movement(0, 1, 10)   # Move down
        elif key == ord('a'):
            wrapper.handle_movement(-1, 0, 10)  # Move left
        elif key == ord('d'):
            wrapper.handle_movement(1, 0, 10)   # Move right
        elif key == ord('r'):
            wrapper.set_scan_offset(0, 0)       # Reset to center
            print("[SCAN] Reset to center")
    
    cv2.destroyAllWindows()
    print("\nTest completed")
    return True


if __name__ == '__main__':
    # Run the test
    success = test_wrapper()
    sys.exit(0 if success else 1)