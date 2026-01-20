#!/bin/bash

# YouTube AI Subtitles - Backend Setup Script for Linux/macOS

set -e

echo "YouTube AI Subtitles - Backend Setup"
echo "===================================="
echo ""

# Check if conda is available
if ! command -v conda &> /dev/null; then
    echo "Error: Conda is not installed or not in PATH"
    echo "Please install Conda from: https://docs.conda.io/en/latest/miniconda.html"
    exit 1
fi

# Check if ffmpeg is available
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: FFmpeg is not installed"
    echo ""
    echo "Install FFmpeg:"
    echo "  macOS:   brew install ffmpeg"
    echo "  Ubuntu:  sudo apt install ffmpeg"
    echo "  Fedora:  sudo dnf install ffmpeg"
    exit 1
fi

echo "✓ Conda found"
echo "✓ FFmpeg found"
echo ""

# Create or update conda environment
if conda env list | grep -q "youtube_extension"; then
    echo "Conda environment 'youtube_extension' already exists"
    echo "Updating environment..."
    conda env update -f environment.yml --prune
else
    echo "Creating conda environment..."
    conda env create -f environment.yml
fi

echo ""
echo "✓ Environment ready!"
echo ""
echo "To start the backend, run:"
echo "  make dev"
echo ""
echo "Or manually:"
echo "  conda activate youtube_extension"
echo "  python backend/main.py"
echo ""
