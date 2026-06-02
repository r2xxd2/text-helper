#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.app.pid"
LOG_FILE="$ROOT_DIR/.app.log"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-3000}"

ensure_local_files() {
  mkdir -p "$ROOT_DIR/public"

  if [ ! -f "$ROOT_DIR/.env" ]; then
    if [ -f "$ROOT_DIR/.env.example" ]; then
      cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    else
      touch "$ROOT_DIR/.env"
    fi
  fi

  if [ ! -f "$ROOT_DIR/providers.json" ]; then
    cat > "$ROOT_DIR/providers.json" <<'JSON'
{
  "activeProviderId": "cerebras",
  "activePresetId": "preset-1",
  "providers": [
    {
      "id": "cerebras",
      "type": "openai-compatible",
      "name": "Cerebras",
      "baseUrl": "https://api.cerebras.ai/v1",
      "apiKey": "",
      "selected": true,
      "activeModelId": "model-1",
      "models": [
        {
          "id": "model-1",
          "label": "",
          "model": "gpt-oss-120b",
          "selected": true
        },
        {
          "id": "model-2",
          "label": "",
          "model": "zai-glm-4.7",
          "selected": false
        },
        {
          "id": "model-3",
          "label": "",
          "model": "",
          "selected": false
        }
      ]
    },
    {
      "id": "mistral",
      "type": "openai-compatible",
      "name": "Mistral",
      "baseUrl": "https://api.mistral.ai/v1",
      "apiKey": "",
      "selected": false,
      "activeModelId": "model-1",
      "models": [
        {
          "id": "model-1",
          "label": "",
          "model": "",
          "selected": true
        },
        {
          "id": "model-2",
          "label": "",
          "model": "",
          "selected": false
        },
        {
          "id": "model-3",
          "label": "",
          "model": "",
          "selected": false
        }
      ]
    },
    {
      "id": "cohere",
      "type": "openai-compatible",
      "name": "Cohere",
      "baseUrl": "https://api.cohere.ai/compatibility/v1",
      "apiKey": "",
      "selected": false,
      "activeModelId": "model-1",
      "models": [
        {
          "id": "model-1",
          "label": "",
          "model": "",
          "selected": true
        },
        {
          "id": "model-2",
          "label": "",
          "model": "",
          "selected": false
        },
        {
          "id": "model-3",
          "label": "",
          "model": "",
          "selected": false
        }
      ]
    },
    {
      "id": "groq",
      "type": "openai-compatible",
      "name": "Groq",
      "baseUrl": "https://api.groq.com/openai/v1",
      "apiKey": "",
      "selected": false,
      "activeModelId": "model-1",
      "models": [
        {
          "id": "model-1",
          "label": "",
          "model": "",
          "selected": true
        },
        {
          "id": "model-2",
          "label": "",
          "model": "",
          "selected": false
        },
        {
          "id": "model-3",
          "label": "",
          "model": "",
          "selected": false
        }
      ]
    },
    {
      "id": "cloudflare",
      "type": "openai-compatible",
      "name": "Cloudflare",
      "baseUrl": "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1",
      "apiKey": "",
      "accountId": "",
      "accountIdRequired": true,
      "selected": false,
      "activeModelId": "model-1",
      "models": [
        {
          "id": "model-1",
          "label": "",
          "model": "",
          "selected": true
        },
        {
          "id": "model-2",
          "label": "",
          "model": "",
          "selected": false
        },
        {
          "id": "model-3",
          "label": "",
          "model": "",
          "selected": false
        },
        {
          "id": "model-4",
          "label": "",
          "model": "",
          "selected": false
        },
        {
          "id": "model-5",
          "label": "",
          "model": "",
          "selected": false
        }
      ]
    }
  ],
  "presets": [
    {
      "id": "preset-1",
      "name": "Fix grammar",
      "prompt": "Fix grammar and spelling while preserving the original meaning.",
      "selected": true
    },
    {
      "id": "preset-2",
      "name": "Professional",
      "prompt": "Rewrite in a clear, professional tone while preserving the original meaning.",
      "selected": false
    },
    {
      "id": "preset-3",
      "name": "Shorter",
      "prompt": "Make the text shorter and easier to scan while preserving key details.",
      "selected": false
    },
    {
      "id": "preset-4",
      "name": "Friendlier",
      "prompt": "Rewrite in a friendly, natural tone while preserving the original meaning.",
      "selected": false
    },
    {
      "id": "preset-5",
      "name": "Clearer",
      "prompt": "Improve clarity, structure, and flow while preserving the original meaning.",
      "selected": false
    }
  ]
}
JSON
  fi
}

is_running() {
  local pid="${1:-}"

  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  return 1
}

find_app_pids() {
  ps -eo pid=,command= 2>/dev/null | awk '/node server\.js/ && !/awk/ { print $1 }'
}
