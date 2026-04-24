#!/bin/bash
# clean_path.sh - Clean PATH of old virtual environment references

echo "🧹 Cleaning PATH of old virtual environment references..."

# Remove lpximage-env and test-env from PATH
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v "lpximage-env" | grep -v "test-env" | tr '\n' ':' | sed 's/:$//')

echo "✅ Cleaned PATH: $PATH"
echo ""
echo "🚀 You can now run:"
echo "   python3 validate_saccades/lpx_server.py --camera 1 --port 5050 --saccade_port 5051 --tables ScanTables63"
echo ""
echo "💡 To make this permanent, source this script or restart your terminal."
