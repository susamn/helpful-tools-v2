# Makefile for Helpful Tools v2

# Configuration
VENV_DIR := .venv
PYTHON := $(VENV_DIR)/bin/python
PIP := $(VENV_DIR)/bin/pip
PYTEST := $(VENV_DIR)/bin/pytest
NPM := npm
PORT := 8000

# Colors for terminal output
YELLOW := \033[1;33m
GREEN := \033[1;32m
RED := \033[1;31m
RESET := \033[0m

.PHONY: all help install setup run start stop restart test test-backend test-frontend lint format clean build

# Default target
all: help

# Help command to list available targets
help:
	@echo "$(YELLOW)Helpful Tools v2 Management$(RESET)"
	@echo "Usage: make [target]"
	@echo ""
	@echo "$(GREEN)Development:$(RESET)"
	@echo "  install        Install all backend and frontend dependencies"
	@echo "  run            Run the server in the foreground (for development)"
	@echo "  start          Start the server in the background"
	@echo "  stop           Stop the background server"
	@echo "  restart        Restart the background server"
	@echo ""
	@echo "$(GREEN)Testing & Quality:$(RESET)"
	@echo "  test           Run all tests (backend and frontend)"
	@echo "  test-backend   Run Python unit and integration tests"
	@echo "  test-frontend  Run JavaScript tests with Jest"
	@echo "  lint           Check code style (flake8 for Python)"
	@echo "  format         Format code (black for Python, prettier for JS)"
	@echo ""
	@echo "$(GREEN)Maintenance:$(RESET)"
	@echo "  clean          Remove temporary files and caches"
	@echo "  build          Simulate a build (install deps + run tests)"

# --- Installation ---

$(VENV_DIR):
	@echo "$(YELLOW)Creating virtual environment...$(RESET)"
	python3 -m venv $(VENV_DIR)

install: $(VENV_DIR)
	@echo "$(YELLOW)Installing Backend Dependencies...$(RESET)"
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	@# Install extra dev tools if not in requirements
	$(PIP) install flake8 black
	@echo "$(YELLOW)Installing Frontend Dependencies...$(RESET)"
	$(NPM) install
	@echo "$(GREEN)Installation Complete!$(RESET)"

setup: install

# --- Execution ---

run:
	@echo "$(YELLOW)Starting Server on port $(PORT)...$(RESET)"
	$(PYTHON) app.py --port $(PORT)

start:
	@echo "$(YELLOW)Starting Background Server...$(RESET)"
	./quick-start.sh start $(PORT)

stop:
	@echo "$(YELLOW)Stopping Server...$(RESET)"
	./quick-start.sh stop

restart: stop start

# --- Testing ---

test: test-backend test-frontend

test-backend:
	@echo "$(YELLOW)Running Backend Tests (Pytest)...$(RESET)"
	$(PYTEST) tests/ -v --tb=short

test-frontend:
	@echo "$(YELLOW)Running Frontend Tests (Jest)...$(RESET)"
	cd frontend && $(NPM) test

# --- Code Quality ---

lint:
	@echo "$(YELLOW)Linting Python code...$(RESET)"
	$(PYTHON) -m flake8 src/ tests/ --count --select=E9,F63,F7,F82 --show-source --statistics
	@echo "$(YELLOW)Linting completed.$(RESET)"

format:
	@echo "$(YELLOW)Formatting Python code (Black)...$(RESET)"
	$(PYTHON) -m black src/ tests/
	@echo "$(YELLOW)Formatting Frontend code (Prettier)...$(RESET)"
	npx prettier --write "frontend/static/js/**/*.js" "frontend/static/css/**/*.css" "frontend/tools/**/*.html"

# --- Maintenance ---

clean:
	@echo "$(YELLOW)Cleaning up...$(RESET)"
	rm -rf __pycache__
	rm -rf .pytest_cache
	rm -rf .coverage
	rm -rf htmlcov
	rm -rf dist
	rm -rf build
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	@echo "$(GREEN)Clean complete.$(RESET)"

build: install test
	@echo "$(GREEN)Build (Install + Test) passed successfully.$(RESET)"
