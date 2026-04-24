#!/usr/bin/env python3
"""
LPXImage Path Configuration Module

This module provides automatic path configuration for LPXImage projects.
It ensures that local builds are used when available, making the code
production-ready for Git commits without requiring wrapper scripts.

Usage:
    # At the top of your Python script:
    import lpx_path_config
    lpx_path_config.configure()
    
    # Then import lpximage as usual:
    import lpximage
"""

import sys
import os
from pathlib import Path


def configure():
    """
    Automatically configure sys.path to use local builds if available.
    
    This function:
    1. Searches for the project root (directory containing CMakeLists.txt)
    2. Checks for a local build directory (build/python/)  
    3. Adds the local build to sys.path if it exists
    4. Adds the project root to sys.path
    
    Returns:
        bool: True if local build was found and configured, False otherwise
    """
    # Get the directory containing the script that imported this module
    frame = sys._getframe(1)
    script_path = frame.f_globals.get('__file__')
    
    if not script_path:
        # Fallback to current working directory
        script_dir = Path.cwd()
    else:
        script_dir = Path(script_path).parent.absolute()
    
    # Find the project root (contains CMakeLists.txt)
    project_root = find_project_root(script_dir)
    
    if not project_root:
        print("ℹ️  Could not find LPXImage project root")
        return False
    
    # Check for local build
    local_build = project_root / "build" / "python"
    
    if not local_build.exists():
        print("ℹ️  No local build directory found")
        return False
    
    # Check for the Python module (platform-specific name)
    python_module_found = False
    for pattern in ["lpximage*.so", "lpximage*.dll", "lpximage*.pyd"]:
        if list(local_build.glob(pattern)):
            python_module_found = True
            break
    
    if not python_module_found:
        print("ℹ️  No lpximage Python module found in build directory")
        return False
    
    # Configure sys.path
    local_build_str = str(local_build)
    project_root_str = str(project_root)
    
    # Insert local build path at the beginning of sys.path
    if local_build_str not in sys.path:
        sys.path.insert(0, local_build_str)
    
    # Also add project root
    if project_root_str not in sys.path:
        sys.path.insert(1, project_root_str)
    
    print(f"🔧 Using local LPXImage build: {local_build}")
    return True


def find_project_root(start_dir):
    """
    Find the LPXImage project root by searching up the directory tree
    for a directory containing CMakeLists.txt.
    
    Args:
        start_dir (Path): Directory to start searching from
        
    Returns:
        Path or None: Path to project root, or None if not found
    """
    current_dir = Path(start_dir).absolute()
    
    # Search up the directory tree
    for parent in [current_dir] + list(current_dir.parents):
        cmake_file = parent / "CMakeLists.txt"
        if cmake_file.exists():
            # Verify this is likely an LPXImage project by checking for key files
            if (parent / "include").exists() or (parent / "src").exists():
                return parent
    
    return None


def get_build_info():
    """
    Get information about the current build configuration.
    
    Returns:
        dict: Dictionary containing build information
    """
    script_dir = Path(sys._getframe(1).f_globals.get('__file__', '.')).parent.absolute()
    project_root = find_project_root(script_dir)
    
    if not project_root:
        return {"project_root": None, "local_build": None, "configured": False}
    
    local_build = project_root / "build" / "python"
    configured = str(local_build) in sys.path
    
    return {
        "project_root": project_root,
        "local_build": local_build,
        "configured": configured,
        "local_build_exists": local_build.exists(),
        "python_paths": sys.path.copy()
    }


if __name__ == "__main__":
    # When run directly, just configure paths and show status
    print("LPXImage Path Configuration")
    print("=" * 30)
    
    success = configure()
    
    info = get_build_info()
    print(f"\nProject root: {info['project_root']}")
    print(f"Local build: {info['local_build']}")
    print(f"Build exists: {info['local_build_exists']}")
    print(f"Configured: {info['configured']}")
    
    if success:
        print("\n✅ Local build configuration successful!")
        try:
            import lpximage
            print("✅ lpximage module imported successfully!")
            print(f"   Module file: {getattr(lpximage, '__file__', 'built-in')}")
        except ImportError as e:
            print(f"❌ lpximage import failed: {e}")
    else:
        print("\n⚠️  Using system installation (if available)")
