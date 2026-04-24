#!/bin/bash
# install_local.sh - Build and install LPXImage libraries locally

set -e  # Exit on any error

echo "=== LPXImage Local Installation Script ==="
echo "This script will build and install the LPXImage libraries locally."
echo ""

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Project root: $PROJECT_ROOT"

# Create and enter build directory
BUILD_DIR="$PROJECT_ROOT/build"
echo "Build directory: $BUILD_DIR"

if [ -d "$BUILD_DIR" ]; then
    echo "Cleaning existing build directory..."
    rm -rf "$BUILD_DIR"
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

echo ""
echo "=== Configuring CMake for local installation ==="
cmake -DCMAKE_INSTALL_PREFIX="$PROJECT_ROOT" \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_PYTHON_BINDINGS=ON \
      "$PROJECT_ROOT"

echo ""
echo "=== Building libraries ==="
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo ""
echo "=== Installing libraries locally ==="
make install

echo ""
echo "=== Installation Summary ==="
echo "Libraries installed to:"
if [ -d "$PROJECT_ROOT/lib" ]; then
    ls -la "$PROJECT_ROOT/lib/"
else
    echo "Warning: lib directory not found at $PROJECT_ROOT/lib"
fi

echo ""
echo "Python module installed to:"
PYTHON_MODULE="$PROJECT_ROOT/build/python/lpximage.cpython-*.so"
if ls $PYTHON_MODULE 1> /dev/null 2>&1; then
    ls -la $PYTHON_MODULE
    # Copy to project root for easy access
    cp $PYTHON_MODULE "$PROJECT_ROOT/"
    echo "Python module copied to project root."

    # The Python .so uses @loader_path RPATH, so liblpx_image.1.dylib must sit
    # next to it in the project root. Symlink to lib/ rather than copying so
    # there's one source of truth and future rebuilds can't leave a stale copy.
    ln -sf lib/liblpx_image.1.dylib "$PROJECT_ROOT/liblpx_image.1.dylib"
    ln -sf liblpx_image.1.dylib "$PROJECT_ROOT/liblpx_image.dylib"
    echo "Root dylib symlinks refreshed:"
    ls -la "$PROJECT_ROOT/liblpx_image"*.dylib
else
    echo "Warning: Python module not found"
fi

echo ""
echo "=== Testing Installation ==="
cd "$PROJECT_ROOT"

# Test library loading
echo "Testing library loading..."
if [ -f "$PROJECT_ROOT/lib/liblpx_image.dylib" ] || [ -f "$PROJECT_ROOT/lib/liblpx_image.so" ]; then
    echo "✅ C++ library installed successfully"
else
    echo "❌ C++ library not found"
fi

# Test Python module
echo "Testing Python module..."
if PYTHONPATH="$PROJECT_ROOT" python3 -c "import lpximage; print('✅ Python module imported successfully')" 2>/dev/null; then
    echo "✅ Python module working"
else
    echo "❌ Python module not working"
fi

echo ""
echo "=== Checking for site-packages pollution ==="
# A stale pip install will silently win imports whenever a script forgets to
# prepend the local build to sys.path. Detect it now, while we can still
# tell the user how to fix it.
POLLUTION=0

if python3 -m pip show lpximage >/dev/null 2>&1; then
    INSTALL_LOC=$(python3 -m pip show lpximage 2>/dev/null | awk -F': ' '/^Location:/ {print $2}')
    echo "⚠️  lpximage is installed via pip at: $INSTALL_LOC"
    POLLUTION=1
fi

# Import from a neutral cwd with PYTHONPATH unset — this is what a stray
# `python3` invocation outside the project would see.
STRAY=$(cd /tmp && env -u PYTHONPATH python3 -c "import lpximage, os; print(os.path.abspath(lpximage.__file__))" 2>/dev/null || true)
if [ -n "$STRAY" ]; then
    case "$STRAY" in
        "$PROJECT_ROOT"/*) : ;;  # same tree — fine
        *)
            echo "⚠️  A stale lpximage is importable from outside the project: $STRAY"
            POLLUTION=1
            ;;
    esac
fi

if [ "$POLLUTION" -eq 1 ]; then
    echo ""
    echo "    This will shadow your local build whenever a script forgets to"
    echo "    configure sys.path. Remove it with:"
    echo "        python3 -m pip uninstall lpximage"
    echo "    (Repeat with --user or in each env if more than one copy is found.)"
else
    echo "✅ No stale lpximage found outside the project"
fi

echo ""
echo "=== Installation Complete ==="
echo "To use the libraries:"
echo "1. C++ projects should link against: $PROJECT_ROOT/lib/liblpx_image.*"
echo "2. Python scripts should use: PYTHONPATH=$PROJECT_ROOT python3 your_script.py"
echo "3. Or run: export PYTHONPATH=$PROJECT_ROOT before running Python scripts"
