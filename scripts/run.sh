#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_HOME="${JOB_FINDER_NODE_HOME:-$HOME/.local/job-finder/node}"
PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}"

if [[ -x "$NODE_HOME/bin/node" ]]; then
  export PATH="$NODE_HOME/bin:$PATH"
elif [[ -x "$NODE_HOME/node.exe" ]]; then
  export PATH="$NODE_HOME:$PATH"
fi
hash -r || true
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

waiter=""
cleanup() {
  local code=$?
  if [[ -n "$waiter" ]]; then
    kill "$waiter" 2>/dev/null || true
  fi
  if [[ -t 0 && "$code" -ne 0 && "$code" -ne 130 ]]; then
    printf '\nThe app stopped (exit %s).\nPress Enter to close... ' "$code"
    read -r _ || true
  fi
}
trap cleanup EXIT

open_url() {
  local uname_s
  uname_s="$(uname -s)"
  case "$uname_s" in
    Darwin) open "$1" ;;
    Linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$1" >/dev/null 2>&1 || true
      else
        printf 'Open %s in your browser.\n' "$1"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*) cmd.exe /c start "" "$1" ;;
    *) printf 'Open %s in your browser.\n' "$1" ;;
  esac
}

if ! command -v node >/dev/null 2>&1 || ! command -v corepack >/dev/null 2>&1; then
  echo "Dependencies are missing. Double-click Install Job Finder first." >&2
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  printf 'Installing project packages...\n'
  corepack yarn install
fi

mkdir -p "$ROOT/data"
printf 'Preparing the job database...\n'
corepack yarn prisma db init --yes

if command -v ollama >/dev/null 2>&1; then
  if ! curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:11434/api/tags"; then
    case "$(uname -s)" in
      Darwin)
        if ! open -a Ollama >/dev/null 2>&1; then
          nohup ollama serve >/tmp/job-finder-ollama.log 2>&1 &
          disown || true
        fi
        ;;
      *)
        nohup ollama serve >/tmp/job-finder-ollama.log 2>&1 &
        disown || true
        ;;
    esac
  fi
fi

if curl -sf --max-time 2 -o /dev/null "$URL"; then
  printf 'Opening %s\n' "$URL"
  open_url "$URL"
  exit 0
fi

(
  i=0
  while [[ "$i" -lt 60 ]]; do
    if curl -sf --max-time 20 -o /dev/null "$URL"; then
      open_url "$URL"
      exit 0
    fi
    i=$((i + 1))
    sleep 1
  done
) &
waiter=$!

printf 'Starting Job Finder at %s\n' "$URL"
printf 'Leave this window open. Closing it stops the app.\n'
corepack yarn dev --port "$PORT"
