#!/usr/bin/env bash
# Run generator module tests via the MolVis host client and server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/client" && npm test -- ../generator/client
cd "$ROOT/server" && .venv/bin/python -m pytest \
  tests/test_generation.py \
  tests/test_chemge.py \
  tests/test_ml_generation.py \
  -q
