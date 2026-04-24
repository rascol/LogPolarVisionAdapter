# Local Build Usage Guide

This guide explains how to configure Python scripts to automatically use local builds, making your code production-ready for Git commits.

## ✅ **Solution: Automatic Path Configuration**

Your Python scripts can now automatically detect and use local builds without any wrapper scripts or manual PYTHONPATH configuration.

## 🚀 **Current Status**

The following scripts are already configured for automatic local build usage:
- `validate_saccades/lpx_server.py` ✅

## 📝 **Usage**

### Running Scripts Directly (Production-Ready)

```bash
# These commands work directly from the project directory:
python3 validate_saccades/lpx_server.py --camera 1 --port 5050 --saccade_port 5051 --tables ScanTables63

# No wrapper scripts needed!
# No PYTHONPATH configuration required!
# Ready for Git commits!
```

### Expected Output
```
🔧 Using local build: /Users/ray/Desktop/LPXImage/build/python
LPXImage Server - Converting and streaming video
Camera ID: 1
Resolution: 1920x1080
Scan Tables: ScanTables63
Port: 5050
```

## 🔧 **How It Works**

Each configured script includes automatic path detection code that:

1. **Finds the project root** by searching up the directory tree for `CMakeLists.txt`
2. **Checks for local build** at `build/python/lpximage*.so`
3. **Configures sys.path** to prioritize local build over system installations
4. **Falls back gracefully** to system installations if no local build exists

## 📋 **Adding to New Scripts**

To make any Python script use local builds automatically, add this code block at the top:

```python
#!/usr/bin/env python3

# AUTOMATIC LOCAL BUILD CONFIGURATION
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

# Now import your modules as usual
import lpximage
# ... rest of your imports
```

## 🏗️ **Build Requirements**

### Prerequisites
```bash
# Install system dependencies via Homebrew
brew install python@3.13 opencv numpy
```

### Build the project
```bash
cd build
make
```

The automatic configuration will only activate if:
- `build/python/` directory exists
- `lpximage*.so` file is present in that directory

## 📝 **No Virtual Environment**

This project is configured to use **system Python directly** (Homebrew Python):
- ✅ **Simpler setup**: No virtual environment complexity
- ✅ **Cleaner imports**: No conflicting installations
- ✅ **VSCode friendly**: Works naturally with VSCode Python extension
- ✅ **System dependencies**: Uses Homebrew-installed numpy, opencv-python

The previous `lpximage-env/` virtual environment has been removed for simplicity.

## 🌟 **Benefits**

- ✅ **Production-ready**: Scripts work directly without wrappers
- ✅ **Git-safe**: Can commit scripts without environment dependencies  
- ✅ **Auto-detection**: Finds local builds automatically
- ✅ **Fallback support**: Uses system installation if no local build
- ✅ **Cross-platform**: Works on macOS, Linux, and Windows
- ✅ **No configuration**: Zero manual setup required

## 🔧 **Development Workflow**

1. **Build the project**: `cd build && make`
2. **Run scripts directly**: `python3 your_script.py`
3. **See local build confirmation**: `🔧 Using local build: .../build/python`
4. **Commit to Git**: Scripts are production-ready!

## 📝 **Alternative Methods (Legacy)**

For reference, these methods also work but are not recommended for production:

```bash
# Method 1: Wrapper script (legacy)
./run_local_only.sh validate_saccades/lpx_server.py --args

# Method 2: Setup script (legacy)
source setup.sh
lpx-python3 validate_saccades/lpx_server.py --args

# Method 3: Direct wrapper (legacy)  
./python3-local validate_saccades/lpx_server.py --args
```

## ⚡ **Quick Test**

Verify your setup:

```bash
cd /path/to/LPXImage
python3 lpx_path_config.py
python3 validate_saccades/lpx_server.py --help
```

Both should show: `🔧 Using local build: .../build/python`
