#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -f ".env.modelspecs" ]]; then
  source ./.env.modelspecs
fi

# Ensure sourced values are available to node.
export GEMINI_API_KEY="${GEMINI_API_KEY:-}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-}"
export PORT="${PORT:-3000}"
export GEMINI_MODEL="${GEMINI_MODEL:-}"
export GEMINI_URL="${GEMINI_URL:-}"
export GH_URL="${GH_URL:-}"
export OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
export OPENROUTER_URL=${OPENROUTER_URL:-}

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  read -rsp "Enter GEMINI_API_KEY: " GEMINI_API_KEY
  echo
  export GEMINI_API_KEY
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  read -rsp "Enter GITHUB_TOKEN: " GITHUB_TOKEN
  echo
  export GITHUB_TOKEN
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  read -rsp "Enter OPENROUTER_API_KEY: " OPENROUTER_API_KEY
  echo
  export OPENROUTER_API_KEY
fi

if [[ -z "${GEMINI_URL:-}" ]]; then
  echo "Warning: GEMINI_URL is not set. The Gemini route will stay disabled until it is configured." >&2
fi

if [[ -z "${GH_URL:-}" ]]; then
  echo "Warning: GH_URL is not set. The GitHub Models route will stay disabled until it is configured." >&2
fi

if [[ -z "${OPENROUTER_URL:-}" ]]; then
  echo "Warning: OPENROUTER_URL is not set. The OpenRouter route will stay disabled until it is configured." >&2
fi

echo "Starting unified server on http://localhost:${PORT} (Gemini, GitHub Models, and OpenRouter routes configured as available) ..."
exec /usr/local/bin/node server.cjs
