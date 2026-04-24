#!/usr/bin/env python3
"""Debug version of lpx_server.py with detailed error reporting"""

import numpy as np
import cv2
import lpximage
import traceback

def debug_server_init():
    print("🔍 Debug: Testing LPXImage server initialization...")
    
    # Test 1: Can we import lpximage?
    print("✅ lpximage module imported successfully")
    
    # Test 2: Can we create server with scan tables?
    try:
        print("🔍 Debug: Creating server with ScanTables63...")
        server = lpximage.WebcamLPXServer("ScanTables63", 5050)
        print("✅ Server created successfully")
    except Exception as e:
        print(f"❌ Server creation failed: {e}")
        traceback.print_exc()
        return None
    
    # Test 3: Can we start server with camera?
    try:
        print("🔍 Debug: Starting server with camera 0...")
        result = server.start(0, 1920, 1080)
        print(f"📊 Server start result: {result}")
        if result:
            print("✅ Server started successfully with camera!")
            server.stop()
        else:
            print("❌ Server start returned False")
    except Exception as e:
        print(f"❌ Server start failed with exception: {e}")
        traceback.print_exc()
    
    return server

if __name__ == "__main__":
    debug_server_init()
