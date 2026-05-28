#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/app-utils.sh"

stopped=0

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  if is_running "$pid"; then
    kill "$pid"
    stopped=1
  fi
  rm -f "$PID_FILE"
fi

for pid in $(find_app_pids); do
  if is_running "$pid"; then
    kill "$pid"
    stopped=1
  fi
done

if [ "$stopped" -eq 1 ]; then
  echo "Text Helper stopped."
else
  echo "Text Helper was not running."
fi
