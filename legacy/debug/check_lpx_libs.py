#!/usr/bin/env python3
import os
import sys

print("Python executable:", sys.executable)
print("Python path:")
for p in sys.path:
    print(f"  {p}")

# Import lpximage and check where it's loaded from
try:
    import lpximage
    print("\nlpximage module loaded from:", lpximage.__file__)
    
    # Check if the module has version info
    if hasattr(lpximage, 'getVersionString'):
        print("lpximage version:", lpximage.getVersionString())
    
    # Use lsof to check which shared libraries are loaded
    import subprocess
    pid = os.getpid()
    print(f"\nShared libraries loaded by process {pid}:")
    
    # Run lsof to find loaded libraries
    result = subprocess.run(['lsof', '-p', str(pid)], capture_output=True, text=True)
    lines = result.stdout.split('\n')
    
    # Filter for lpx-related libraries
    print("\nLPX-related libraries:")
    for line in lines:
        if 'lpx' in line.lower():
            print(line)
            
except ImportError as e:
    print("Failed to import lpximage:", e)