#!/usr/bin/env python3
"""
Run server with local build
"""
import sys
import os

# Use local build instead of site-packages
sys.path.insert(0, '/Users/ray/Desktop/LPXImage/build/python')
os.environ['PYTHONPATH'] = '/Users/ray/Desktop/LPXImage/build/python:' + os.environ.get('PYTHONPATH', '')

# Now run the server
if __name__ == '__main__':
    import subprocess
    import sys
    
    # Run the server script with the modified environment
    cmd = [sys.executable, 'validate_saccades/lpx_server.py'] + sys.argv[1:]
    
    print("=== LPX Server (Local Build) ===")
    print(f"Using local build from: {sys.path[0]}")
    print(f"Running: {' '.join(cmd)}")
    
    # Set environment for subprocess
    env = os.environ.copy()
    env['PYTHONPATH'] = '/Users/ray/Desktop/LPXImage/build/python:' + env.get('PYTHONPATH', '')
    
    try:
        subprocess.run(cmd, env=env)
    except KeyboardInterrupt:
        print("\nServer stopped by user")
