#!/usr/bin/env python3
"""
Python LPX Client - Connects to main_webcam_server for proper saccade support

This client mimics how main_debug_renderer works, connecting to the C++ server
over a socket and letting the server handle scanning and saccade movement.
"""

import sys
import os
import cv2
import numpy as np
import socket
import struct
import subprocess
import time
import threading
import queue
from typing import Optional, Tuple

# Add build directory to path for lpximage module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'build', 'python'))
import lpximage


class PythonLPXClient:
    """
    Python client that connects to main_webcam_server.
    
    This replicates the behavior of LPXDebugClient from C++, using the
    same socket protocol to communicate with the server.
    """
    
    # Command types (must match LPXStreamProtocol::CommandType)
    CMD_LPX_IMAGE = 0x01
    CMD_MOVEMENT = 0x02
    
    def __init__(self, scan_table_path: str = 'ScanTables63'):
        self.scan_table_path = scan_table_path
        self.socket = None
        self.running = False
        self.server_process = None
        
        # Image display
        self.window_title = "Python LPX View"
        self.window_width = 600
        self.window_height = 600
        self.scale = 1.0
        
        # Initialize LPX system for rendering
        if not lpximage.initLPX(scan_table_path, 800, 800):
            raise RuntimeError("Failed to initialize LPX system")
        
        self.tables = lpximage.LPXTables(scan_table_path)
        if not self.tables.isInitialized():
            raise RuntimeError("Failed to load scan tables")
        
        self.renderer = lpximage.LPXRenderer()
        self.renderer.setScanTables(self.tables)
        
        # Thread-safe image queue
        self.image_queue = queue.Queue(maxsize=3)
        self.receiver_thread = None
        
        # Movement throttling
        self.last_movement_time = time.time()
        self.movement_throttle = 0.033  # ~30fps
    
    def start_server(self) -> bool:
        """Start the main_webcam_server process."""
        try:
            server_path = os.path.join('build', 'main_webcam_server')
            if not os.path.exists(server_path):
                print(f"ERROR: Server not found at {server_path}")
                return False
            
            # Start server with our scan tables
            cmd = [server_path, self.scan_table_path]
            self.server_process = subprocess.Popen(cmd)
            
            # Wait a moment for server to start
            time.sleep(1.0)
            return True
            
        except Exception as e:
            print(f"Failed to start server: {e}")
            return False
    
    def connect(self, host: str = '127.0.0.1', port: int = 5050) -> bool:
        """Connect to the LPX server."""
        try:
            # Create socket
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((host, port))
            
            # Start receiver thread
            self.running = True
            self.receiver_thread = threading.Thread(target=self._receiver_thread)
            self.receiver_thread.start()
            
            print(f"Connected to LPX server at {host}:{port}")
            return True
            
        except Exception as e:
            print(f"Failed to connect: {e}")
            if self.socket:
                self.socket.close()
                self.socket = None
            return False
    
    def disconnect(self):
        """Disconnect from the server and clean up."""
        self.running = False
        
        # Close socket
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
        
        # Wait for receiver thread
        if self.receiver_thread:
            self.receiver_thread.join()
            self.receiver_thread = None
        
        # Stop server if we started it
        if self.server_process:
            self.server_process.terminate()
            self.server_process.wait()
            self.server_process = None
        
        cv2.destroyAllWindows()
    
    def _receive_lpx_image(self) -> Optional[lpximage.LPXImage]:
        """Receive an LPXImage from the server."""
        try:
            # Read command type
            cmd_data = self.socket.recv(4)
            if not cmd_data:
                return None
            cmd_type = struct.unpack('I', cmd_data)[0]
            
            if cmd_type != self.CMD_LPX_IMAGE:
                print(f"Unexpected command type: {cmd_type}")
                return None
            
            # Read image data size
            size_data = self.socket.recv(4)
            if not size_data:
                return None
            data_size = struct.unpack('I', size_data)[0]
            
            # Read image data
            image_data = b''
            while len(image_data) < data_size:
                chunk = self.socket.recv(data_size - len(image_data))
                if not chunk:
                    return None
                image_data += chunk
            
            # Create LPXImage
            lpx_img = lpximage.LPXImage(self.tables, 800, 800)
            
            # Load the raw data
            # Note: This assumes the C++ serialization format matches
            # what the Python bindings expect
            raw_data = image_data
            lpx_img.loadFromFile(raw_data)
            
            return lpx_img
            
        except Exception as e:
            print(f"Error receiving image: {e}")
            return None
    
    def _receiver_thread(self):
        """Thread that receives images from server and queues them for display."""
        while self.running:
            try:
                # Receive LPXImage
                lpx_img = self._receive_lpx_image()
                if not lpx_img:
                    print("Failed to receive image")
                    break
                
                # Render image
                rendered = self.renderer.renderToImage(
                    lpx_img, self.window_width, self.window_height, self.scale
                )
                
                if rendered is not None:
                    # Add to queue, dropping old frames if full
                    try:
                        self.image_queue.put_nowait(rendered)
                    except queue.Full:
                        try:
                            self.image_queue.get_nowait()
                            self.image_queue.put_nowait(rendered)
                        except:
                            pass
                
            except Exception as e:
                print(f"Receiver thread error: {e}")
                break
        
        self.running = False
    
    def send_movement(self, delta_x: float, delta_y: float, 
                     step_size: float = 10.0) -> bool:
        """Send movement command to server."""
        if not self.socket:
            return False
        
        # Apply throttling
        now = time.time()
        if now - self.last_movement_time < self.movement_throttle:
            return False
        self.last_movement_time = now
        
        try:
            # Send command type
            cmd_type = struct.pack('I', self.CMD_MOVEMENT)
            self.socket.sendall(cmd_type)
            
            # Send movement data
            movement = struct.pack('fff', delta_x, delta_y, step_size)
            self.socket.sendall(movement)
            
            return True
            
        except Exception as e:
            print(f"Failed to send movement: {e}")
            return False
    
    def run(self):
        """Main display loop."""
        cv2.namedWindow(self.window_title, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(self.window_title, 800, 600)
        
        print("\nControls:")
        print("  WASD - Move scan position")
        print("  R - Reset to center")
        print("  Q - Quit\n")
        
        while self.running:
            # Get latest image
            try:
                rendered = self.image_queue.get(timeout=0.1)
            except queue.Empty:
                if not self.running:
                    break
                continue
            
            if rendered is None:
                continue
            
            # Add center crosshair
            center_x = rendered.shape[1] // 2
            center_y = rendered.shape[0] // 2
            cv2.line(rendered, (center_x-10, center_y), 
                    (center_x+10, center_y), (0, 255, 255), 2)
            cv2.line(rendered, (center_x, center_y-10),
                    (center_x, center_y+10), (0, 255, 255), 2)
            
            # Show controls
            cv2.putText(rendered, "WASD: move, R: reset, Q: quit",
                       (10, rendered.shape[0] - 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)
            
            # Display
            cv2.imshow(self.window_title, rendered)
            
            # Handle keyboard
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('q'):
                break
            elif key == ord('w'):
                self.send_movement(0, -1)
            elif key == ord('s'):
                self.send_movement(0, 1)
            elif key == ord('a'):
                self.send_movement(-1, 0)
            elif key == ord('d'):
                self.send_movement(1, 0)
            elif key == ord('r'):
                # Send zero movement to reset
                self.send_movement(0, 0)
        
        self.running = False


def main():
    """Run the Python LPX client."""
    print("=== Python LPX Client ===\n")
    print("Starting C++ server...")
    
    client = PythonLPXClient('ScanTables63')
    
    # Start the C++ server
    if not client.start_server():
        print("Failed to start server")
        return False
    
    print("Connecting to server...")
    if not client.connect():
        print("Failed to connect")
        return False
    
    try:
        print("Running display loop...")
        client.run()
    except KeyboardInterrupt:
        print("\nInterrupted by user")
    finally:
        print("\nDisconnecting...")
        client.disconnect()
    
    print("Done")
    return True


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)