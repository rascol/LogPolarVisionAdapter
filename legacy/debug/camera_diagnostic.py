#!/usr/bin/env python3
"""Camera diagnostic to identify the exact issue"""

import cv2
import sys
import threading
import time

def test_camera_direct(camera_id):
    print(f"📹 Test 1: Direct camera access (camera {camera_id})")
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"❌ Direct access failed for camera {camera_id}")
        return False
    
    ret, frame = cap.read()
    if ret:
        print(f"✅ Direct access successful: {frame.shape}")
        cap.release()
        return True
    else:
        print(f"❌ Could not read frame from camera {camera_id}")
        cap.release()
        return False

def test_camera_with_resolution(camera_id, width=1920, height=1080):
    print(f"📹 Test 2: Camera with specific resolution {width}x{height}")
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"❌ Camera {camera_id} won't open")
        return False
    
    # Try to set resolution like the C++ code does
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    
    actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    print(f"📊 Requested: {width}x{height}, Actual: {actual_width}x{actual_height}")
    
    ret, frame = cap.read()
    if ret:
        print(f"✅ Resolution test successful: {frame.shape}")
        cap.release()
        return True
    else:
        print(f"❌ Could not read frame with resolution {width}x{height}")
        cap.release()
        return False

def test_camera_in_thread(camera_id):
    print(f"📹 Test 3: Camera access in thread (like C++ server)")
    
    success = [False]  # Use list to modify from thread
    
    def thread_function():
        try:
            cap = cv2.VideoCapture(camera_id)
            if not cap.isOpened():
                print(f"❌ Thread: Camera {camera_id} won't open")
                return
            
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            
            ret, frame = cap.read()
            if ret:
                print(f"✅ Thread: Camera access successful: {frame.shape}")
                success[0] = True
            else:
                print(f"❌ Thread: Could not read frame")
            
            cap.release()
            
        except Exception as e:
            print(f"❌ Thread: Exception: {e}")
    
    thread = threading.Thread(target=thread_function)
    thread.start()
    thread.join(timeout=5)  # Wait max 5 seconds
    
    if thread.is_alive():
        print("❌ Thread: Timeout - camera access took too long")
        return False
    
    return success[0]

def main():
    print("🔬 LPXImage Camera Diagnostic")
    print("=" * 40)
    
    cameras_to_test = [0, 1]  # Test first two cameras
    
    for camera_id in cameras_to_test:
        print(f"\n🎥 Testing Camera {camera_id}")
        print("-" * 20)
        
        # Test 1: Direct access
        direct_ok = test_camera_direct(camera_id)
        
        if direct_ok:
            # Test 2: With resolution
            resolution_ok = test_camera_with_resolution(camera_id)
            
            # Test 3: In thread
            thread_ok = test_camera_in_thread(camera_id)
            
            print(f"\n📋 Camera {camera_id} Summary:")
            print(f"   Direct access: {'✅' if direct_ok else '❌'}")
            print(f"   With resolution: {'✅' if resolution_ok else '❌'}")
            print(f"   In thread: {'✅' if thread_ok else '❌'}")
            
            if direct_ok and not thread_ok:
                print(f"🔍 Camera {camera_id}: Threading issue detected!")
            elif direct_ok and not resolution_ok:
                print(f"🔍 Camera {camera_id}: Resolution issue detected!")
        else:
            print(f"📋 Camera {camera_id}: Not accessible")

if __name__ == "__main__":
    main()
