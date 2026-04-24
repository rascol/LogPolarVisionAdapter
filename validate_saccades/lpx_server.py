#!/usr/bin/env python3
# lpx_server.py - Captures video, converts it to LPXImage format, and streams to clients

# Local build configuration is handled by VSCode terminal environment
# and .env file via PYTHONPATH setting

# Now import the required modules
import numpy as np
import cv2
import time
import threading
import signal
import sys
import os
import argparse
import select
import termios
import tty
import socket

# Allow OpenCV to request camera permissions on macOS

try:
    import lpximage
except ModuleNotFoundError:
    print("ERROR: lpximage module not found!")
    print("Please ensure LPXImage is properly installed on this machine.")
    print("Refer to INSTALL_PYTHON.md in the LPXImage directory for installation instructions.")
    sys.exit(1)

# Global variables
server = None
current_x_offset = 0.0
current_y_offset = 0.0

# Define signal handler
def signal_handler(sig, frame):
    print("\nCtrl+C pressed, stopping server and exiting...")
    global server
    if server is not None:
        try:
            server.stop()
            print("Server stopped")
        except Exception as e:
            print(f"Error stopping server: {e}")
    
    # Clean up OpenCV resources
    cv2.destroyAllWindows()
    
    # Exit the program
    print("Server exiting...")
    sys.exit(0)

def main():
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='LPXImage Server - Stream video in LPXImage format')
    parser.add_argument('--tables', default='../ScanTables63', help='Path to scan tables')
    parser.add_argument('--camera', type=int, default=0, help='Camera ID')
    parser.add_argument('--width', type=int, default=1920, help='Video width')
    parser.add_argument('--height', type=int, default=1080, help='Video height')
    parser.add_argument('--port', type=int, default=5050, help='Server port')
    parser.add_argument('--saccade_port', type=int, default=5051, help='Port for saccade commands')
    parser.add_argument('--x_offset', type=int, default=0, help='X offset from center (positive = right)')
    parser.add_argument('--y_offset', type=int, default=0, help='Y offset from center (positive = down)')
    args = parser.parse_args()
    
    # Register signal handler
    signal.signal(signal.SIGINT, signal_handler)
    
    # Print startup info
    print(f"LPXImage Server - Converting and streaming video")
    print(f"Camera ID: {args.camera}")
    print(f"Resolution: {args.width}x{args.height}")
    print(f"Scan Tables: {args.tables}")
    print(f"Port: {args.port}")
    print("Press Ctrl+C to exit")
    
    # Create and start the LPX server
    global server
    try:
        # Pre-authorize camera access from main thread to avoid threading issues
        print(f"Requesting camera {args.camera} access...")
        test_cap = cv2.VideoCapture(args.camera)
        if not test_cap.isOpened():
            print("Failed to access camera. Please check camera permissions in System Preferences.")
            return
        test_cap.release()
        print("Camera access granted.")
        
        # Brief pause to ensure camera is fully released
        time.sleep(0.5)
        
        # Initialize the server with scan tables and port
        server = lpximage.WebcamLPXServer(args.tables, args.port)
        
        # Start the server with the specified camera and resolution
        if not server.start(args.camera, args.width, args.height):
            print("Failed to start LPX server. Check camera connection.")
            return
        
        print(f"Server started and listening on port {args.port}")
        print("Waiting for clients to connect...")
        print("\n=== WASD Movement Controls ===")
        print("Use WASD keys to control the log-polar transform center:")
        print("  W - Move up")
        print("  A - Move left")
        print("  S - Move down")
        print("  D - Move right")
        print("  R - Reset to center")
        print("  Q - Quit movement control")
        print("===========================\n")
        
        # Start WASD movement thread
        movement_thread = threading.Thread(target=handle_wasd_movement, args=(args.saccade_port,), daemon=True)
        movement_thread.start()
        
        # Main server loop
        while True:
            # Report status periodically
            client_count = server.getClientCount()
            if client_count > 0:
                print(f"Active clients: {client_count}")
            
            # Add a short delay to allow signal handling
            time.sleep(1)
            
            # You could add more server management code here
            
    except Exception as e:
        print(f"Server error: {e}")
    finally:
        # Clean up if we exit the loop
        if server is not None:
            server.stop()
            print("Server stopped")

def handle_wasd_movement(saccade_port=None):
    """Handle WASD movement commands and saccade network commands."""
    global current_x_offset, current_y_offset
    
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    tty.setcbreak(fd)

    # Setup saccade socket (non-blocking)
    saccade_sock = None
    if saccade_port:
        try:
            saccade_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            saccade_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            saccade_sock.bind(('127.0.0.1', saccade_port))
            saccade_sock.listen(1)
            saccade_sock.setblocking(False)
            print(f"Saccade commands available on port {saccade_port}")
        except:
            saccade_sock = None
            print(f"Warning: Could not bind saccade port {saccade_port}")

    move_map = {
        'w': (0, -10), 'a': (-10, 0), 's': (0, 10), 'd': (10, 0),
    }

    try:
        while True:
            # Existing WASD handling (unchanged)
            if select.select([sys.stdin], [], [], 0) == ([sys.stdin], [], []):
                key = sys.stdin.read(1)
                if key in move_map:
                    dx, dy = move_map[key]
                    # TIMING: Record when key was pressed
                    key_time = time.time() * 1000  # milliseconds
                    print(f"[TIMING] Key '{key}' pressed at {key_time:.3f}ms")
                    
                    current_x_offset += dx
                    current_y_offset += dy
                    
                    # TIMING: Record before setCenterOffset call
                    before_set = time.time() * 1000
                    server.setCenterOffset(current_x_offset, current_y_offset)
                    after_set = time.time() * 1000
                    
                    set_duration = after_set - before_set
                    total_duration = after_set - key_time
                    
                    print(f"[TIMING] setCenterOffset took {set_duration:.3f}ms, total response: {total_duration:.3f}ms")
                    print(f"WASD Center: ({current_x_offset:.1f}, {current_y_offset:.1f})")
                elif key == 'q':
                    break
                elif key == 'r':
                    current_x_offset = current_y_offset = 0.0
                    server.setCenterOffset(current_x_offset, current_y_offset)
                    print("Reset to center (0, 0)")

            # New: Check for saccade commands
            if saccade_sock:
                try:
                    conn, _ = saccade_sock.accept()
                    conn.setblocking(False)
                    try:
                        data = conn.recv(1024).decode().strip()
                        if data:
                            x_rel, y_rel = map(float, data.split(','))
                            current_x_offset += x_rel
                            current_y_offset += y_rel
                            server.setCenterOffset(current_x_offset, current_y_offset)
                            print(f"Saccade: ({x_rel:+.1f}, {y_rel:+.1f}) -> ({current_x_offset:.1f}, {current_y_offset:.1f})")
                    except:
                        pass
                    conn.close()
                except:
                    pass

            time.sleep(0.05)

    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        if saccade_sock:
            saccade_sock.close()

if __name__ == "__main__":
    main()
