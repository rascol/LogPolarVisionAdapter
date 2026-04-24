#!/bin/bash
# run_local_only.sh
# Ensures Python imports the local build instead of site-packages version

echo "====================================================================="
echo "Running LPXImage with local build (bypassing site-packages)"
echo "====================================================================="

# Get the absolute path to build directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="${SCRIPT_DIR}/build/python"

echo "Using build directory: ${BUILD_DIR}"

# Insert the local build path at the beginning of Python's import path
export PYTHONPATH="${BUILD_DIR}:${PYTHONPATH}"

# Run the command with the new environment
echo "Command: $@"
echo "====================================================================="

# Execute the original command with environment modified to use local build
python3 "$@"
