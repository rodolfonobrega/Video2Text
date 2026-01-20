#!/bin/bash

# YouTube AI Subtitles - Start Backend Script for Linux/macOS

set -e

echo "Starting YouTube AI Subtitles Backend..."
echo ""

# Activate conda environment
eval "$(conda shell.bash hook)"
conda activate youtube_extension

# Start the backend server
cd "$(dirname "$0")"
python backend/main.py
