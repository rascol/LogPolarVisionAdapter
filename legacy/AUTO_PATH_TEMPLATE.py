#!/usr/bin/env python3
"""
TEMPLATE: Optional automatic path configuration for Python scripts

NOTE: With the current VSCode/.env configuration, this may not be necessary!
The PYTHONPATH is automatically configured via:
- .env file
- VSCode terminal.integrated.env.osx settings

Only add this if you need the script to work outside of the configured environment.
"""

# AUTOMATIC LOCAL BUILD CONFIGURATION
# Copy this block to the top of your Python scripts (after shebang and docstring)
import sys
from pathlib import Path

def configure_local_paths():
    """Automatically configure sys.path to use local builds if available."""
    # Get the directory containing this script
    script_dir = Path(__file__).parent.absolute()
    
    # Find the project root (contains CMakeLists.txt)
    current_dir = script_dir
    project_root = None
    
    # Search up the directory tree for CMakeLists.txt
    for parent in [current_dir] + list(current_dir.parents):
        if (parent / "CMakeLists.txt").exists():
            project_root = parent
            break
    
    if project_root:
        # Check for local build
        local_build = project_root / "build" / "python"
        if local_build.exists() and list(local_build.glob("lpximage*.so")):
            # Insert local build path at the beginning of sys.path
            local_build_str = str(local_build)
            if local_build_str not in sys.path:
                sys.path.insert(0, local_build_str)
            
            # Also add project root
            project_root_str = str(project_root)
            if project_root_str not in sys.path:
                sys.path.insert(1, project_root_str)
                
            print(f"🔧 Using local build: {local_build}")
            return True
    
    print("ℹ️  Using system-installed lpximage")
    return False

# Configure paths before importing other modules
configure_local_paths()

# NOW YOU CAN IMPORT YOUR MODULES AS USUAL:
# import lpximage
# import your_other_modules

if __name__ == "__main__":
    print("This is a template file. Copy the configuration block to your scripts.")
