#!/usr/bin/env python3
"""Minimal test to isolate LPXImage server camera issue"""

# Test the server with minimal setup
import sys
import os

# Temporarily add build directory to path for this test only
build_path = "/Users/ray/Desktop/LPXImage/build/python"
if build_path not in sys.path:
    sys.path.insert(0, build_path)

print("🔬 Minimal LPXImage Server Test")
print("=" * 35)

try:
    import lpximage
    print("✅ lpximage imported successfully")
except Exception as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)

# Test server creation
try:
    print("🔧 Creating WebcamLPXServer...")
    server = lpximage.WebcamLPXServer("ScanTables63", 5050)
    print("✅ Server object created")
except Exception as e:
    print(f"❌ Server creation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test server start - this is where it's probably failing
try:
    print("📹 Starting server with camera 0, 640x480...")
    result = server.start(0, 640, 480)
    print(f"📊 Start result: {result}")
    
    if result:
        print("🎉 SUCCESS! Server started with camera!")
        print("🛑 Stopping server...")
        server.stop()
        print("✅ Server stopped cleanly")
    else:
        print("❌ Server.start() returned False - camera connection failed")
        
except Exception as e:
    print(f"💥 Server start threw exception: {e}")
    import traceback
    traceback.print_exc()

print("\n🏁 Test complete")
