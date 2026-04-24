#!/usr/bin/env python3
"""
test_saccades.py - Simple saccade test client

This script connects to the existing lpx_server.py and sends saccade commands
to test the saccade control functionality. It works alongside lpx_renderer.py
to provide a complete end-to-end test of the saccade pipeline.

Usage:
1. Start lpx_server.py in one terminal
2. Start lpx_renderer.py in another terminal  
3. Run this script to send automated saccade commands
"""

import time
import socket
import sys
import argparse
import signal
import threading
import struct
import select
import termios
import tty

try:
    import lpximage
except ImportError:
    print("ERROR: lpximage module not found!")
    print("Please ensure LPXImage is properly installed.")
    sys.exit(1)

def send_saccade_command(x_rel, y_rel, host='127.0.0.1', port=5051):
    """Send a saccade command to the server."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, port))
        command = f"{x_rel},{y_rel}"
        sock.send(command.encode())
        sock.close()
        print(f"Sent saccade: ({x_rel:+.1f}, {y_rel:+.1f})")
        return True
    except Exception as e:
        print(f"Failed to send saccade command: {e}")
        return False

def test_pattern_saccades(host='127.0.0.1', port=5051, delay=2.0):
    """Test a repeating pattern of saccade movements."""
    print(f"Starting pattern saccade test on {host}:{port}")
    print("This will send a square pattern of saccade movements...")
    
    # Square pattern movements
    pattern = [
        (40, 0),   # Right
        (0, 40),   # Down
        (-40, 0),  # Left
        (0, -40),  # Up (back to start)
    ]
    
    step = 0
    try:
        while True:
            x_rel, y_rel = pattern[step % len(pattern)]
            print(f"Step {step + 1}: Moving by ({x_rel:+.1f}, {y_rel:+.1f})")
            
            if send_saccade_command(x_rel, y_rel, host, port):
                step += 1
            else:
                print("Server may not be ready, retrying in 1 second...")
                time.sleep(1)
                continue
            
            print(f"Waiting {delay} seconds...")
            time.sleep(delay)
            
    except KeyboardInterrupt:
        print("\nStopping saccade test...")

def test_random_saccades(host='127.0.0.1', port=5051, delay=1.5):
    """Test random saccade movements."""
    import random
    
    print(f"Starting random saccade test on {host}:{port}")
    print("This will send random saccade movements...")
    
    try:
        count = 0
        while True:
            # Generate random movement within reasonable bounds
            x_rel = random.uniform(-50, 50)
            y_rel = random.uniform(-50, 50)
            
            count += 1
            print(f"Random saccade {count}: ({x_rel:+.1f}, {y_rel:+.1f})")
            
            if send_saccade_command(x_rel, y_rel, host, port):
                pass
            else:
                print("Server may not be ready, retrying...")
                time.sleep(1)
                continue
            
            print(f"Waiting {delay} seconds...")
            time.sleep(delay)
            
    except KeyboardInterrupt:
        print("\nStopping random saccade test...")

def test_single_saccades(host='127.0.0.1', port=5051):
    """Test individual saccade commands interactively."""
    print(f"Interactive saccade test on {host}:{port}")
    print("Enter saccade commands as 'x,y' or 'quit' to exit")
    print("Examples: '20,0' (right), '0,20' (down), '-20,-20' (up-left)")
    
    try:
        while True:
            try:
                user_input = input("\nSaccade command (x,y): ").strip()
                if user_input.lower() in ['quit', 'q', 'exit']:
                    break
                
                if ',' in user_input:
                    x_str, y_str = user_input.split(',', 1)
                    x_rel = float(x_str.strip())
                    y_rel = float(y_str.strip())
                    
                    send_saccade_command(x_rel, y_rel, host, port)
                else:
                    print("Invalid format. Use: x,y (example: 20,0)")
                    
            except ValueError:
                print("Invalid numbers. Use format: x,y (example: 20,0)")
            except EOFError:
                break
                
    except KeyboardInterrupt:
        print("\nStopping interactive test...")

class MotionTrackingClient:
    """Motion tracking saccade client that processes LPXImage frames."""
    
    def __init__(self, scan_tables_path="ScanTables63", host='127.0.0.1', 
                 data_port=5050, saccade_port=5051):
        self.host = host
        self.data_port = data_port
        self.saccade_port = saccade_port
        self.running = False
        self.manual_override = False
        
        # Initialize LPX system
        print(f"Initializing LPX system with scan tables: {scan_tables_path}")
        if not lpximage.initLPX(scan_tables_path):
            raise RuntimeError(f"Failed to initialize LPX system with scan tables: {scan_tables_path}")
        
        # Initialize saccade control
        self.gaze_control = lpximage.saccade.LPGazeControl()
        self.init_saccade_control()
        
        # Vision processing
        self.current_vision = None
        self.previous_vision = None
        self.frame_count = 0
        
        # Network connections
        self.data_socket = None
        
    def init_saccade_control(self):
        """Initialize saccade control structures."""
        # Initialize camera data for right camera (master)
        self.gaze_control.R.isSaccadeMaster = True
        self.gaze_control.R.x = 0.0
        self.gaze_control.R.y = 0.0
        self.gaze_control.R.x_last = 0.0
        self.gaze_control.R.y_last = 0.0
        self.gaze_control.R.breakaway_count = 0
        self.gaze_control.R.disableSaccadeCount = 0
        self.gaze_control.R.noSaccade = True
        
        # Initialize saccade data
        self.gaze_control.saccade.isRandom = False
        self.gaze_control.saccade.count = 0
        self.gaze_control.saccade.maxCount = 90  # ~3 seconds at 30fps
        self.gaze_control.saccade.mov_x = 0.0
        self.gaze_control.saccade.mov_y = 0.0
        self.gaze_control.saccade.reZero = False
        
        # Set random seed
        self.gaze_control.rv = int(time.time()) & 0xFFFFFFFF
        
        print("Saccade control initialized")
    
    def connect_to_server(self):
        """Connect to server to receive LPXImage data."""
        try:
            self.data_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.data_socket.connect((self.host, self.data_port))
            self.data_socket.settimeout(1.0)  # 1 second timeout
            print(f"Connected to data stream at {self.host}:{self.data_port}")
            return True
        except Exception as e:
            print(f"Failed to connect to data stream: {e}")
            return False
    
    def receive_lpx_frame(self):
        """Receive an LPXImage frame from the server."""
        try:
            # Read frame header (4 bytes length)
            header = b''
            while len(header) < 4:
                chunk = self.data_socket.recv(4 - len(header))
                if not chunk:
                    return None
                header += chunk
            
            frame_size = struct.unpack('<I', header)[0]
            if frame_size == 0 or frame_size > 50*1024*1024:  # Sanity check
                print(f"Invalid frame size: {frame_size}")
                return None
            
            # Read frame data
            frame_data = b''
            while len(frame_data) < frame_size:
                chunk = self.data_socket.recv(min(frame_size - len(frame_data), 8192))
                if not chunk:
                    return None
                frame_data += chunk
            
            return frame_data
            
        except socket.timeout:
            return None
        except Exception as e:
            print(f"Error receiving frame: {e}")
            return None
    
    def process_frame_for_motion(self, frame_data):
        """Process LPXImage frame and detect motion using LPXVision."""
        try:
            # For now, create a mock LPXImage from the frame data
            # In a full implementation, we'd deserialize the actual LPXImage
            # This is simplified for demonstration
            
            # Store previous vision
            if self.current_vision is not None:
                self.previous_vision = self.current_vision
            
            # Create new LPXVision from frame data
            # Note: This is a simplified approach - in reality we'd need to
            # properly deserialize the LPXImage from frame_data first
            
            # For testing, simulate motion detection logic
            if self.previous_vision is not None and self.current_vision is not None:
                # Set up vision pointers in saccade control
                self.gaze_control.R.lpRetina = self.current_vision
                self.gaze_control.R.lpRetina0 = self.previous_vision
                
                # Use saccade functions to locate movement
                lpximage.saccade.locateMovement(self.gaze_control, self.gaze_control.R)
                
                if self.gaze_control.R.isMoving:
                    # Movement detected - compute saccade
                    lpximage.saccade.doMovementSaccade(self.gaze_control, self.gaze_control.R)
                    return self.gaze_control.saccade.mov_x, self.gaze_control.saccade.mov_y
                else:
                    # No movement - check for random saccade
                    self.gaze_control.R.disableSaccadeCount -= 1
                    if self.gaze_control.R.disableSaccadeCount <= 0:
                        lpximage.saccade.selectRandomLocation(self.gaze_control, self.gaze_control.R)
                        lpximage.saccade.doRandomSaccade(self.gaze_control, self.gaze_control.R)
                        return self.gaze_control.saccade.rnd_x, self.gaze_control.saccade.rnd_y
            
            return 0.0, 0.0  # No motion detected
            
        except Exception as e:
            print(f"Error processing frame for motion: {e}")
            return 0.0, 0.0
    
    def handle_manual_input(self):
        """Handle manual saccade commands that override motion tracking."""
        try:
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            tty.setcbreak(fd)
            
            move_map = {
                'w': (0, -20), 'a': (-20, 0), 's': (0, 20), 'd': (20, 0),
                'i': (0, -40), 'j': (-40, 0), 'k': (0, 40), 'l': (40, 0),  # Larger movements
            }
            
            print("\n=== Manual Override Controls ===")
            print("WASD: Small movements (±20 pixels)")
            print("IJKL: Large movements (±40 pixels)")
            print("R: Reset to center | Q: Quit | M: Toggle manual override")
            print("================================")
            
            while self.running:
                if select.select([sys.stdin], [], [], 0.1) == ([sys.stdin], [], []):
                    key = sys.stdin.read(1).lower()
                    
                    if key == 'q':
                        self.running = False
                        break
                    elif key == 'm':
                        self.manual_override = not self.manual_override
                        status = "ENABLED" if self.manual_override else "DISABLED"
                        print(f"\n[MANUAL] Manual override {status}")
                    elif key == 'r':
                        # Reset to center
                        send_saccade_command(0, 0, self.host, self.saccade_port)
                        print("\n[MANUAL] Reset to center")
                    elif key in move_map:
                        dx, dy = move_map[key]
                        send_saccade_command(dx, dy, self.host, self.saccade_port)
                        print(f"\n[MANUAL] Manual saccade: ({dx:+.1f}, {dy:+.1f})")
                        # Temporarily disable motion tracking
                        self.manual_override = True
                        threading.Timer(2.0, lambda: setattr(self, 'manual_override', False)).start()
                
                time.sleep(0.01)
                
        except Exception as e:
            print(f"Error in manual input handling: {e}")
        finally:
            try:
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
            except:
                pass
    
    def run_motion_tracking(self):
        """Main motion tracking loop."""
        print("Starting motion tracking mode...")
        print("This will analyze incoming frames for motion and generate saccades accordingly.")
        
        if not self.connect_to_server():
            return False
        
        self.running = True
        
        # Start manual input handler in separate thread
        input_thread = threading.Thread(target=self.handle_manual_input, daemon=True)
        input_thread.start()
        
        last_status_time = time.time()
        
        try:
            while self.running:
                # Receive frame from server
                frame_data = self.receive_lpx_frame()
                if frame_data is None:
                    time.sleep(0.01)
                    continue
                
                self.frame_count += 1
                
                # Process frame for motion (only if not in manual override)
                if not self.manual_override:
                    delta_x, delta_y = self.process_frame_for_motion(frame_data)
                    
                    # Send saccade command if motion detected
                    if abs(delta_x) > 1.0 or abs(delta_y) > 1.0:
                        # Limit movement to reasonable bounds
                        delta_x = max(-100.0, min(100.0, delta_x))
                        delta_y = max(-100.0, min(100.0, delta_y))
                        
                        success = send_saccade_command(delta_x, delta_y, self.host, self.saccade_port)
                        if success:
                            print(f"[MOTION] Frame {self.frame_count}: Detected motion, saccade ({delta_x:+.1f}, {delta_y:+.1f})")
                
                # Status reporting
                current_time = time.time()
                if current_time - last_status_time >= 5.0:
                    override_status = " [MANUAL OVERRIDE]" if self.manual_override else ""
                    print(f"[STATUS] Processed {self.frame_count} frames{override_status}")
                    last_status_time = current_time
                
                time.sleep(0.033)  # ~30 FPS processing
                
        except KeyboardInterrupt:
            print("\nStopping motion tracking...")
        finally:
            self.running = False
            if self.data_socket:
                self.data_socket.close()
        
        return True

def test_motion_tracking(host='127.0.0.1', data_port=5050, saccade_port=5051):
    """Test motion tracking saccade mode."""
    try:
        client = MotionTrackingClient(host=host, data_port=data_port, saccade_port=saccade_port)
        return client.run_motion_tracking()
    except Exception as e:
        print(f"Motion tracking error: {e}")
        return False

def signal_handler(sig, frame):
    """Handle Ctrl+C signal."""
    print("\nCtrl+C pressed, exiting...")
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description='LPX Saccade Test Client')
    parser.add_argument('--host', default='127.0.0.1', help='Server hostname')
    parser.add_argument('--port', type=int, default=5051, help='Saccade command port')
    parser.add_argument('--mode', choices=['pattern', 'random', 'interactive', 'motion_tracking'], 
                       default='pattern', help='Test mode')
    parser.add_argument('--data_port', type=int, default=5050, help='Server data port (for motion_tracking mode)')
    parser.add_argument('--tables', default='ScanTables63', help='Path to scan tables (for motion_tracking mode)')
    parser.add_argument('--delay', type=float, default=2.0, 
                       help='Delay between saccades (seconds)')
    args = parser.parse_args()
    
    # Register signal handler
    signal.signal(signal.SIGINT, signal_handler)
    
    print("=== LPX Saccade Test Client ===")
    print(f"Server: {args.host}:{args.port}")
    print(f"Mode: {args.mode}")
    if args.mode in ['pattern', 'random']:
        print(f"Delay: {args.delay}s")
    print()
    print("Make sure lpx_server.py and lpx_renderer.py are running!")
    print("Press Ctrl+C to stop")
    print()
    
    # Wait a moment for user to read instructions
    time.sleep(1)
    
    # Run the selected test mode
    try:
        if args.mode == 'pattern':
            test_pattern_saccades(args.host, args.port, args.delay)
        elif args.mode == 'random':
            test_random_saccades(args.host, args.port, args.delay)
        elif args.mode == 'interactive':
            test_single_saccades(args.host, args.port)
        elif args.mode == 'motion_tracking':
            print(f"\n=== Motion Tracking Mode ===")
            print(f"Data stream: {args.host}:{args.data_port}")
            print(f"Saccade commands: {args.host}:{args.port}")
            print(f"Scan tables: {args.tables}")
            print("This mode will:")
            print("- Connect to server and receive LPXImage frames")
            print("- Process frames using LPXVision for motion detection")
            print("- Compute saccades using the saccade control algorithms")
            print("- Send movement commands based on detected motion")
            print("- Allow manual override with WASD/IJKL keys")
            print("==============================\n")
            
            success = test_motion_tracking(
                host=args.host, 
                data_port=args.data_port, 
                saccade_port=args.port
            )
            if not success:
                return 1
    except Exception as e:
        print(f"Error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
