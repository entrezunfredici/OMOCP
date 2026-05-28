#!/bin/sh
set -e

REQUIREMENTS="/workspace/plugins/sdk-plugin/requirements.txt"
# Venv persistent dans le volume openclaw-config pour éviter la réinstallation à chaque restart
VENV="/workspace/openclaw-config/.sdk-venv"

if [ -f "$REQUIREMENTS" ]; then
  PYTHON_VER="$(python3 --version 2>&1)"
  MARKER="$VENV/.python-version"
  NEEDS_INSTALL=0

  if [ ! -f "$VENV/bin/python" ]; then
    NEEDS_INSTALL=1
  elif [ ! -f "$MARKER" ] || [ "$(cat "$MARKER" 2>/dev/null)" != "$PYTHON_VER" ]; then
    NEEDS_INSTALL=1
  fi

  if [ "$NEEDS_INSTALL" = "1" ]; then
    echo "[env-api] Installing Python deps (version: $PYTHON_VER)..."
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --no-cache-dir -r "$REQUIREMENTS"
    echo "$PYTHON_VER" > "$MARKER"
    echo "[env-api] Done."
  fi
  export PYTHON="$VENV/bin/python"
fi

exec node index.mjs
