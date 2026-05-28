#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/app-utils.sh"

ensure_local_files

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  if is_running "$pid"; then
    echo "Text Helper is already running at http://$HOST:$PORT"
    exit 0
  fi
fi

existing_pids="$(find_app_pids)"
if [ -n "$existing_pids" ]; then
  echo "Text Helper appears to already be running at http://$HOST:$PORT"
  echo "$existing_pids" | head -n 1 > "$PID_FILE"
  exit 0
fi

cd "$ROOT_DIR"
echo "$$" > "$PID_FILE"
echo "Text Helper starting at http://$HOST:$PORT"
echo "Press Ctrl-C to stop, or run npm run app:stop from another terminal."
exec node server.js
