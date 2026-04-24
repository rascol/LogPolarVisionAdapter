#!/usr/bin/env python3
# lpx_renderer.py - Receives LPXImage frames from server, renders them, and displays
import numpy as np
import sys
import os

# Add current directory first, then the build directory
sys.path.insert(0, os.path.dirname(__file__))  # Look in current directory first
sys.path.insert(1, os.path.join(os.path.dirname(__file__), '..', 'build', 'python'))

try:
    import lpximage
    print(f"Loaded lpximage from: {lpximage.__file__ if hasattr(lpximage, '__file__') else 'unknown'}")
except ModuleNotFoundError:
    print("ERROR: lpximage module not found!")
    print("Please ensure LPXImage is properly installed on this machine.")
    print("Refer to INSTALL_PYTHON.md in the LPXImage directory for installation instructions.")
    print("Typically you would need to:")
    print("  1. Build the C++ library and Python bindings")
    print("  2. Install the Python module with pip or add it to your PYTHONPATH")
    import sys
    sys.exit(1)

# Helper function to get version info with fallback
def get_version_info():
    try:
        version = lpximage.getVersionString()
        build = lpximage.getBuildNumber()
        throttle = lpximage.getKeyThrottleMs()
        return version, build, throttle
    except AttributeError:
        return "Unknown", "Unknown", "Unknown"
import time
import signal
import sys
import os
import argparse
import threading
import subprocess

def main():
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='LPXImage Renderer - Receive and display LPXImage video')
    parser.add_argument('--tables', default='../ScanTables63', help='Path to scan tables')
    parser.add_argument('--host', default='127.0.0.1', help='Server hostname or IP address')
    parser.add_argument('--width', type=int, default=800, help='Window width')
    parser.add_argument('--height', type=int, default=600, help='Window height')
    parser.add_argument('--scale', type=float, default=1.0, help='Rendering scale factor')
    args = parser.parse_args()
    
    # Print startup info with version
    version, build, throttle = get_version_info()
    print("=" * 60)
    print(f"LPXImage Renderer v{version} (Build {build})")
    print(f"Key Throttle: {throttle}ms")
    print("=" * 60)
    print(f"Connecting to: {args.host}")
    print(f"Window size: {args.width}x{args.height}")
    print(f"Scan Tables: {args.tables}")
    print("IMPORTANT: Click on the display window and use WASD keys to move")
    print("Press Ctrl+C in terminal to exit")
    
    # Create the LPX debug client
    print("DEBUG: About to create LPXDebugClient...")
    client = lpximage.LPXDebugClient(args.tables)
    print("DEBUG: LPXDebugClient created successfully")
    
    # Configure the display window
    print("DEBUG: Configuring display window...")
    client.setWindowTitle("LPX Remote Renderer")
    client.setWindowSize(args.width, args.height)
    client.setScale(args.scale)
    print(f"DEBUG: Window configured - {args.width}x{args.height}, scale={args.scale}")
    
    # Initialize the window (must be on main thread)
    print("DEBUG: About to initialize window...")
    client.initializeWindow()
    print("DEBUG: Window initialized successfully")
    
    # Keyboard input is now handled directly by the LPXDebugClient window
    print("\n=== KEYBOARD CONTROLS ===")
    print("Click on the main LPX display window and use WASD keys to move")
    print("W/S: Move up/down | A/D: Move left/right | Q/ESC: Quit")
    print("=========================")
    
    # Define a clean exit function
    def clean_exit():
        try:
            print("Cleaning up...")
            client.disconnect()
            print("Disconnected from server")
        except Exception as e:
            print(f"Error disconnecting: {e}")
        print("Renderer exiting...")
        os._exit(0)  # Force exit without cleanup delays
    
    # Set up signal handler for Ctrl+C
    def signal_handler(sig, frame):
        print("\nCtrl+C pressed, forcing immediate exit...")
        # Don't attempt cleanup - C++ operations may be blocking
        # Just force exit immediately
        os._exit(1)
    
    # Register signal handlers for various signals
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Connect to the server (LPXDebugClient always connects to port 5050)
    print(f"Connecting to LPX server at {args.host}...")
    print("NOTE: LPXDebugClient always connects to port 5050")
    try:
        print("DEBUG: About to call client.connect()...")
        # Use host:port format for connection
        server_address = f"{args.host}:5050"
        connect_result = client.connect(server_address)
        print(f"DEBUG: Connect result: {connect_result}")
        if not connect_result:
            print("Failed to connect to server. Check if server is running on port 5050.")
            return
        
        print("Connected to LPX server, receiving video stream...")
        print("DEBUG: Connection established successfully")
        
        # Display frames in a loop
        frame_count = 0
        start_time = time.time()
        print("DEBUG: Entering main display loop...")
        
        loop_count = 0
        while client.isRunning():
            loop_count += 1
            if loop_count % 100 == 1:  # Print every 100 iterations to avoid spam
                print(f"DEBUG: Main loop iteration {loop_count}")
            
            # Process events and update display
            process_result = client.processEvents()
            if loop_count % 100 == 1:
                print(f"DEBUG: processEvents() returned: {process_result}")
            if not process_result:
                print("DEBUG: processEvents() returned False, breaking loop")
                break
            
            # Small delay to prevent overwhelming the CPU and allow display updates
            time.sleep(0.001)  # 1ms delay
            
            # WASD keyboard input is now handled directly by the C++ LPXDebugClient
            # No need for additional keyboard handling here

            # Calculate and display FPS every second
            frame_count += 1
            elapsed = time.time() - start_time
            if elapsed >= 1.0:
                fps = frame_count / elapsed
                print(f"FPS: {fps:.2f}")
                frame_count = 0
                start_time = time.time()
            
    except KeyboardInterrupt:
        print("\nKeyboard interrupt detected")
        clean_exit()
    except Exception as e:
        print(f"Error: {e}")
        clean_exit()
    
    # Normal exit path
    clean_exit()

if __name__ == "__main__":
    main()
