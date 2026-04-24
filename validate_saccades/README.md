# Saccade Validation Testing

This directory contains scripts for end-to-end testing of the LPX saccade control system.

## Components

### 1. lpx_server.py
- Captures video from camera or processes video files
- Converts frames to LPXImage format
- Streams LPXImage data to clients
- Accepts saccade movement commands via network socket
- Controls the log-polar transform center based on received commands

### 2. lpx_renderer.py  
- Connects to lpx_server.py as a client
- Receives LPXImage frames from the server
- Renders and displays the log-polar transformed video in real-time
- Shows the visual effects of saccade movements

### 3. test_saccades.py
- Simple saccade command client  
- Sends automated saccade movement commands to the server
- Tests different saccade patterns (square, random, interactive)
- **NEW**: Motion tracking mode that processes LPXImage frames for intelligent saccades
- Demonstrates the complete saccade control loop

## Usage

### Basic Testing Setup

1. **Start the server** (in terminal 1):
   ```bash
   cd validate_saccades
   python lpx_server.py --camera 0 --port 5050 --saccade_port 5051
   ```

2. **Start the renderer** (in terminal 2):
   ```bash
   cd validate_saccades  
   python lpx_renderer.py --host 127.0.0.1
   ```

3. **Run saccade tests** (in terminal 3):
   ```bash
   cd validate_saccades
   python test_saccades.py --port 5051 --mode pattern
   ```

### Test Modes

#### Pattern Mode (default)
Sends a repeating square pattern of saccade movements:
```bash
python test_saccades.py --mode pattern --delay 2.0
```

#### Random Mode  
Sends random saccade movements:
```bash
python test_saccades.py --mode random --delay 1.5
```

#### Interactive Mode
Allows manual entry of saccade commands:
```bash
python test_saccades.py --mode interactive
```
Then enter commands like: `20,0` (right), `0,20` (down), `-30,-15` (up-left)

#### Motion Tracking Mode ⭐ NEW
Intelligent saccade mode that processes LPXImage frames for motion detection:
```bash
python test_saccades.py --mode motion_tracking --data_port 5050 --tables ScanTables63
```

This mode:
- Connects to the server data stream to receive LPXImage frames
- Uses LPXVision to convert frames for motion analysis  
- Applies the mt_lpx_saccade algorithms (`locateMovement`, `doMovementSaccade`, etc.)
- Computes saccades based on detected motion in the visual field
- Sends intelligent movement commands to track motion
- Supports manual override with keyboard controls:
  - **WASD**: Small movements (±20 pixels)
  - **IJKL**: Large movements (±40 pixels) 
  - **M**: Toggle manual override on/off
  - **R**: Reset to center
  - **Q**: Quit

### Parameters

- `--host`: Server hostname (default: 127.0.0.1)
- `--port`: Saccade command port (default: 5051) 
- `--mode`: Test mode (pattern/random/interactive)
- `--delay`: Delay between automatic saccades in seconds

## Expected Behavior

When all three components are running:

1. The **server** captures video and converts to LPX format
2. The **renderer** displays the log-polar transformed video
3. The **saccade client** sends movement commands
4. You should see the log-polar center moving in real-time in the renderer window
5. The movement corresponds to the saccade commands being sent

## Manual Controls

In addition to the automated saccade client, you can also control saccades manually:

- **WASD keys** in the server terminal: Move the log-polar center
- **WASD keys** in the renderer window: Also control movement  
- **Interactive mode** in test_saccades.py: Enter custom commands

## Troubleshooting

- Ensure all scripts use the same host and port settings
- Check that the camera is not in use by another application
- Verify that the ScanTables63 directory exists and contains scan table files
- Make sure lpximage Python module is properly installed

## Advanced Usage

The saccade functionality can be extended by:
- Implementing motion detection algorithms in test_saccades.py
- Adding LPXVision frame analysis for intelligent saccade selection
- Integrating with the mt_lpx_saccade C++ functions via the Python bindings
- Recording and analyzing saccade performance metrics
