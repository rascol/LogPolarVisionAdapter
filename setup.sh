#!/bin/bash
# LPXImage Development Environment Setup
# Source this file to configure your environment for local development
# Usage: source setup.sh  (or . setup.sh)

# Check if being sourced (not executed)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "❌ Error: This script must be sourced, not executed directly."
    echo "   Usage: source setup.sh"
    echo "   Or:    . setup.sh"
    exit 1
fi

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if build directory exists
if [[ ! -d "${PROJECT_DIR}/build/python" ]]; then
    echo "⚠️  Warning: Build directory not found at ${PROJECT_DIR}/build/python"
    echo "   Run 'cd build && make' to build the project first."
    return 1
fi

# Check if the Python module exists
if [[ ! -f "${PROJECT_DIR}/build/python/lpximage.cpython-313-darwin.so" ]]; then
    echo "⚠️  Warning: Python module not found. Please build the project first."
    echo "   Run 'cd build && make' to build the project."
    return 1
fi

# Set PYTHONPATH to use ONLY local build and project root (no site-packages)
export PYTHONPATH="${PROJECT_DIR}/build/python:${PROJECT_DIR}"

# Ensure Python doesn't write bytecode files (cleaner development)
export PYTHONDONTWRITEBYTECODE=1

# Disable user site-packages to prevent conflicts
export PYTHONNOUSERSITE=1

# Clear any virtual environment settings
unset VIRTUAL_ENV
unset CONDA_DEFAULT_ENV

# Use Homebrew Python directly (no virtual environment)
export PATH="/opt/homebrew/bin:$PATH"

# Change to project directory
cd "${PROJECT_DIR}"

# Verify the setup works
echo "🔧 LPXImage Environment Configured Successfully!"
echo "   Project Directory: ${PROJECT_DIR}"
echo "   PYTHONPATH: ${PYTHONPATH}"
echo ""

# Create a Python function that uses the correct configuration
function lpx-python3() {
    # Use regular python3 but ensure our build directory is first in PYTHONPATH
    PYTHONPATH="${PROJECT_DIR}/build/python:${PROJECT_DIR}" \
    PYTHONDONTWRITEBYTECODE=1 \
    python3 "$@"
}

# Test import (check that it loads our local version, not site-packages)
if lpx-python3 -c "import lpximage; import sys; print('✅ lpximage module loads successfully'); print('Loaded from:', lpximage.__file__ if hasattr(lpximage, '__file__') else 'built-in')" 2>/dev/null; then
    echo "✅ Environment setup complete - ready for development!"
else
    echo "❌ Module import failed - please check your build"
    return 1
fi

echo ""
echo "🚀 You can now run commands using lpx-python3:"
echo "   lpx-python3 validate_saccades/lpx_server.py --camera 1 --port 5050 --saccade_port 5051 --tables ScanTables63"
echo ""
echo "💡 Or use the python3-local wrapper:"
echo "   ./python3-local validate_saccades/lpx_server.py --camera 1 --port 5050 --saccade_port 5051 --tables ScanTables63"
echo ""
