# =============================================================================
# RETOLD — friendly shortcuts. Run these from THIS folder (the repo root).
#
#   make setup       one-time: install the Python tools + create your .env
#   make test-mock   the Phase-1 smoke test — builds a whole sample book with
#                    NO API keys, NO internet, into out/test/
#   make produce     build a REAL order:  make produce ORDER=path.json OUT=out/1001
#
# If you've never used `make`, it just runs the commands shown under each name.
# =============================================================================

# Use python3 if available, else python.
PY ?= $(shell command -v python3 >/dev/null 2>&1 && echo python3 || echo python)

# Defaults for `make produce` (override on the command line).
ORDER ?= samples/sample_order.json
OUT   ?= out/1001

.PHONY: help setup test-mock produce clean

help:
	@echo "RETOLD — available commands:"
	@echo "  make setup       Install Python deps and create your .env from the template."
	@echo "  make test-mock   Build a full SAMPLE book with no API keys (writes out/test/)."
	@echo "  make produce     Build a real order. Example:"
	@echo "                     make produce ORDER=samples/sample_order.json OUT=out/1001"
	@echo "  make clean       Delete the generated out/ folder."

# --- One-time setup ----------------------------------------------------------
setup:
	$(PY) -m pip install -r requirements.txt
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo ""; \
		echo "Created .env from .env.example — open it and paste in your keys."; \
	else \
		echo ".env already exists — leaving it untouched."; \
	fi
	@echo "Setup done. Next: run 'make test-mock' to prove the pipeline works."

# --- Phase-1 smoke test: no keys, no internet needed -------------------------
test-mock:
	$(PY) engine/produce.py --order samples/sample_order.json --out out/test/ --mock
	@echo ""
	@echo "Mock build complete. Open these to eyeball the result:"
	@echo "  out/test/interior.pdf   (the book pages)"
	@echo "  out/test/cover.pdf      (the wrap cover)"
	@echo "  out/test/book.json      (the master data object)"

# --- Build a real order ------------------------------------------------------
produce:
	$(PY) engine/produce.py --order $(ORDER) --out $(OUT)

clean:
	rm -rf out
	@echo "Removed out/."
