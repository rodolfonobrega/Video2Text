.PHONY: help install setup dev docker-up docker-down docker-logs docker-restart lint format clean

help:
	@echo "YouTube AI Subtitles - Available Commands:"
	@echo "  make install      - Install Python dependencies"
	@echo "  make setup        - Create conda environment and install dependencies"
	@echo "  make dev          - Start backend server locally"
	@echo "  make docker-up    - Start backend with Docker"
	@echo "  make docker-down  - Stop Docker containers"
	@echo "  make docker-logs  - Show Docker logs"
	@echo "  make docker-restart - Restart Docker containers"
	@echo "  make lint         - Run linters"
	@echo "  make format       - Format code"
	@echo "  make clean        - Clean temporary files"

install:
	@echo "Installing Python dependencies..."
	pip install -r backend/requirements.txt

setup:
	@echo "Setting up conda environment..."
	conda env create -f environment.yml || conda create -n youtube_extension python=3.12
	conda activate youtube_extension
	pip install -r backend/requirements.txt
	npm install

dev:
	@echo "Starting backend server..."
	@echo "Press Ctrl+C to stop"
	python backend/main.py

docker-up:
	@echo "Starting Docker containers..."
	docker-compose up -d --build
	@echo "Backend running at http://localhost:8000"

docker-down:
	@echo "Stopping Docker containers..."
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-restart:
	@echo "Restarting Docker containers..."
	docker-compose restart

lint:
	@echo "Running linters..."
	npm run lint
	black --check backend/
	@echo "Linting complete"

format:
	@echo "Formatting code..."
	npm run format
	black backend/
	@echo "Formatting complete"

clean:
	@echo "Cleaning temporary files..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	find . -type f -name ".DS_Store" -delete 2>/dev/null || true
	find . -type f -name "*.mp3" -delete 2>/dev/null || true
	@echo "Clean complete"
