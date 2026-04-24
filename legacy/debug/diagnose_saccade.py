#!/usr/bin/env python3
"""
Diagnostic script to understand the saccade display issue.
This script will help determine if the issue is with the scan position
or the rendering of the output.
"""

import subprocess
import time
import signal
import sys

def run_diagnosis():
    print("=" * 60)
    print("SACCADE BEHAVIOR DIAGNOSTIC")
    print("=" * 60)
    print()
    print("This script will help diagnose the saccade movement issue.")
    print("When you use WASD keys, the expected behavior is:")
    print("  1. The scan position moves on the input camera image")
    print("  2. The rendered log-polar circle stays centered in the window")
    print("  3. The content inside the circle changes based on what's being scanned")
    print()
    print("The INCORRECT behavior would be:")
    print("  - The entire log-polar circle moves around in the window")
    print()
    
    # Step 1: Check build
    print("-" * 40)
    print("Step 1: Checking build...")
    print("-" * 40)
    result = subprocess.run(['make', '-j4'], capture_output=True, text=True)
    if result.returncode != 0:
        print("Build failed!")
        print(result.stderr)
        return
    print("Build successful!")
    print()
    
    # Step 2: Instructions for manual test
    print("-" * 40)
    print("Step 2: Manual Test Instructions")
    print("-" * 40)
    print()
    print("Please run these commands in separate terminals:")
    print()
    print("Terminal 1 - Start the server:")
    print("  python3 examples/lpx_server.py --port 5000 --saccade_port 5051")
    print()
    print("Terminal 2 - Start the C++ debug client:")
    print("  ./bin/lpx_debug_client")
    print()
    print("Now test WASD keys in Terminal 1 and observe the display window.")
    print()
    print("DIAGNOSTIC QUESTIONS:")
    print("1. When you press WASD, does the green circular log-polar image:")
    print("   a) Stay in the center of the window? (CORRECT)")
    print("   b) Move around within the window? (INCORRECT)")
    print()
    print("2. When you press WASD, does the content inside the circle:")
    print("   a) Change to show different parts of the scene? (CORRECT)")
    print("   b) Stay the same? (INCORRECT)")
    print()
    print("3. Look at the server output. Do you see:")
    print("   - [SCAN] Position: messages with changing coordinates?")
    print("   - WASD Center: messages showing the offset values?")
    print()
    print("Press Ctrl+C when done testing...")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n")
        print("-" * 40)
        print("Diagnosis Complete")
        print("-" * 40)
        print()
        print("Based on your observations:")
        print()
        print("If the circle MOVES in the window (1b):")
        print("  -> The issue is that offsets are being applied to the display position")
        print("  -> This suggests the renderer is incorrectly offsetting the output")
        print()
        print("If the circle STAYS CENTERED but content doesn't change (2b):")
        print("  -> The issue is that the scan position isn't actually changing")
        print("  -> This suggests setCenterOffset isn't working properly")
        print()
        print("If everything works correctly (1a and 2a):")
        print("  -> The system is working as designed!")
        print("  -> Perhaps the visual effect is confusing?")
        print()

if __name__ == "__main__":
    run_diagnosis()