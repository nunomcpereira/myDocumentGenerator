.PHONY: dev backend frontend install install-backend install-frontend check-deps help

ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BACKEND_DIR := $(ROOT_DIR)backend
FRONTEND_DIR := $(ROOT_DIR)frontend

PYTHON_BIN := $(shell \
  if [ -x "$(BACKEND_DIR)/.venv/bin/python" ]; then \
    echo "$(BACKEND_DIR)/.venv/bin/python"; \
  elif [ -x "$(ROOT_DIR).venv/bin/python" ]; then \
    echo "$(ROOT_DIR).venv/bin/python"; \
  else \
    command -v python3 2>/dev/null; \
  fi)

dev: check-deps
	@trap 'kill 0' INT TERM EXIT; \
	echo "Starting backend from $(BACKEND_DIR)"; \
	cd "$(BACKEND_DIR)" && $(PYTHON_BIN) -m uvicorn app.main:app --reload & \
	echo "Starting frontend from $(FRONTEND_DIR)"; \
	cd "$(FRONTEND_DIR)" && npm run dev & \
	echo ""; \
	echo "  Backend:  http://127.0.0.1:8000"; \
	echo "  Frontend: http://127.0.0.1:5173"; \
	echo ""; \
	wait

backend:
	cd "$(BACKEND_DIR)" && $(PYTHON_BIN) -m uvicorn app.main:app --reload

frontend:
	cd "$(FRONTEND_DIR)" && npm run dev

install: install-backend install-frontend

install-backend:
	cd "$(BACKEND_DIR)" && $(PYTHON_BIN) -m pip install -r requirements.txt

install-frontend:
	cd "$(FRONTEND_DIR)" && npm install

check-deps:
	@if [ -z "$(PYTHON_BIN)" ]; then \
	  echo "Error: Python 3 not found. Create a virtual environment first." >&2; exit 1; \
	fi
	@if ! command -v npm >/dev/null 2>&1; then \
	  echo "Error: npm not found. Install Node.js first." >&2; exit 1; \
	fi
	@PYVER=$$($(PYTHON_BIN) -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"); \
	case "$$PYVER" in 3.14.*) \
	  echo "Warning: Python $$PYVER is active. Prefer 3.12 or 3.13 venv in backend/.venv." >&2;; \
	esac
	@$(PYTHON_BIN) -c "\
import importlib.util, sys; \
missing=[m for m in ['langchain_chroma','chromadb','langchain_huggingface','sentence_transformers','docx','reportlab'] if importlib.util.find_spec(m) is None]; \
sys.exit(0) if not missing else (print(f'Warning: missing backend deps: {missing}', file=sys.stderr), sys.exit(0))" 2>&1 || true

help:
	@echo "Targets:"
	@echo "  make dev              - Start backend + frontend concurrently"
	@echo "  make backend          - Start backend only"
	@echo "  make frontend         - Start frontend only"
	@echo "  make install          - Install all dependencies"
	@echo "  make install-backend  - Install Python dependencies"
	@echo "  make install-frontend - Install npm dependencies"
	@echo "  make check-deps       - Validate environment"
