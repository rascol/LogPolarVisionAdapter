#!/usr/bin/env python3
import cv2

def test_backends():
    print("🔍 Testing OpenCV Camera Backends")
    print("=" * 40)
    
    # List all available backends
    backends = [
        (cv2.CAP_AVFOUNDATION, "CAP_AVFOUNDATION (macOS native)"),
        (cv2.CAP_ANY, "CAP_ANY (auto-detect)")
    ]
    
    for backend_id, backend_name in backends:
        print(f"\n📹 Testing {backend_name}")
        try:
            cap = cv2.VideoCapture(0, backend_id)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    print(f"   ✅ Backend works: {frame.shape}")
                    print(f"   📊 Backend name: {cap.getBackendName()}")
                else:
                    print(f"   ❌ Can't read frame")
                cap.release()
            else:
                print(f"   ❌ Can't open camera with this backend")
        except Exception as e:
            print(f"   ❌ Exception: {e}")
    
    print(f"\n🔧 Default OpenCV build info:")
    print(f"   OpenCV version: {cv2.__version__}")

if __name__ == "__main__":
    test_backends()
