#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_MIN="20.9.0"
NODE_HOME="${JOB_FINDER_NODE_HOME:-$HOME/.local/job-finder/node}"
YARN_VERSION="4.18.1"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"

OS=""
ARCH=""
LIBC="gnu"

log() { printf '\n==> %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }

on_exit() {
  local code=$?
  if [[ -t 0 ]]; then
    if [[ "$code" -ne 0 ]]; then
      printf '\nSetup failed (exit %s).\n' "$code"
    fi
    printf 'Press Enter to close... '
    read -r _ || true
  fi
}
trap on_exit EXIT

version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    n = split(a, av, ".")
    m = split(b, bv, ".")
    max = n
    if (m > max) max = m
    for (i = 1; i <= max; i++) {
      ai = av[i] + 0
      bi = bv[i] + 0
      if (ai > bi) exit 0
      if (ai < bi) exit 1
    }
    exit 0
  }'
}

detect_os() {
  local uname_s uname_m
  uname_s="$(uname -s)"
  uname_m="$(uname -m)"
  case "$uname_s" in
    Darwin) OS="macos" ;;
    Linux) OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
    *) OS="unknown" ;;
  esac
  case "$uname_m" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64) ARCH="x64" ;;
    *) ARCH="" ;;
  esac
  if [[ "$OS" == "linux" && -f /etc/alpine-release ]]; then
    LIBC="musl"
  fi
}

node_version() {
  node -p "process.versions.node" 2>/dev/null | tr -d '[:space:]' || true
}

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local v
  v="$(node_version)"
  [[ -n "$v" ]] || return 1
  version_ge "$v" "$NODE_MIN"
}

prepend_node() {
  if [[ -x "$NODE_HOME/bin/node" ]]; then
    export PATH="$NODE_HOME/bin:$PATH"
  elif [[ -x "$NODE_HOME/node.exe" ]]; then
    export PATH="$NODE_HOME:$PATH"
  else
    return 0
  fi
  hash -r
}

node_triple() {
  case "$OS" in
    macos) printf 'darwin-%s' "$ARCH" ;;
    linux)
      if [[ "$LIBC" == "musl" ]]; then
        printf 'linux-%s-musl' "$ARCH"
      else
        printf 'linux-%s' "$ARCH"
      fi
      ;;
    windows) printf 'win-%s' "$ARCH" ;;
    *) return 1 ;;
  esac
}

fetch_node_version() {
  local json ver
  json="$(curl -fsSL "https://nodejs.org/dist/index.json")" || {
    echo "Could not reach Node.js downloads. Check the network and run this again." >&2
    exit 1
  }
  ver="$(printf '%s' "$json" | tr '{' '\n' | awk '
    /"lts":"/ && match($0, /"version":"v[0-9.]+"/) {
      s = substr($0, RSTART, RLENGTH)
      sub(/"version":"/, "", s)
      sub(/"$/, "", s)
      print s
      exit
    }
  ' || true)"
  if [[ -z "$ver" ]]; then
    echo "Could not find a Node.js LTS release." >&2
    exit 1
  fi
  printf '%s\n' "$ver"
}

verify_sha256() {
  local file="$1" sumfile="$2" name="$3" expected got
  expected="$(awk -v name="$name" '$2 == name { print $1; exit }' "$sumfile")"
  if [[ -z "$expected" ]]; then
    echo "No checksum listed for $name" >&2
    exit 1
  fi
  if command -v shasum >/dev/null 2>&1; then
    got="$(shasum -a 256 "$file" | awk '{ print $1 }')"
  else
    got="$(sha256sum "$file" | awk '{ print $1 }')"
  fi
  if [[ "$got" != "$expected" ]]; then
    echo "Checksum mismatch for $name" >&2
    exit 1
  fi
}

install_node() {
  if node_ok; then
    log "Node.js $(node_version) is already installed."
    return
  fi
  prepend_node
  if node_ok; then
    log "Using Node.js $(node_version) from $NODE_HOME."
    return
  fi
  if [[ -z "$ARCH" || "$OS" == "unknown" ]]; then
    echo "Cannot install Node.js on $(uname -s) $(uname -m)." >&2
    exit 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to download Node.js." >&2
    exit 1
  fi

  local ver triple url tmp archive name sums
  ver="$(fetch_node_version)"
  triple="$(node_triple)"
  tmp="$(mktemp -d)"
  sums="$tmp/SHASUMS256.txt"
  log "Installing Node.js $ver ($triple) for this user"
  curl -fL "https://nodejs.org/dist/${ver}/SHASUMS256.txt" -o "$sums"

  if [[ "$OS" == "windows" ]]; then
    name="node-${ver}-${triple}.zip"
    archive="$tmp/$name"
    url="https://nodejs.org/dist/${ver}/${name}"
    curl -fL "$url" -o "$archive"
    verify_sha256 "$archive" "$sums" "$name"
    unzip -q "$archive" -d "$tmp/unpacked"
    rm -rf "$NODE_HOME"
    mkdir -p "$(dirname "$NODE_HOME")"
    mv "$tmp/unpacked/node-${ver}-${triple}" "$NODE_HOME"
  else
    name="node-${ver}-${triple}.tar.gz"
    archive="$tmp/$name"
    url="https://nodejs.org/dist/${ver}/${name}"
    curl -fL "$url" -o "$archive"
    verify_sha256 "$archive" "$sums" "$name"
    rm -rf "$NODE_HOME"
    mkdir -p "$NODE_HOME"
    tar -xzf "$archive" -C "$NODE_HOME" --strip-components=1
  fi
  rm -rf "$tmp"
  prepend_node
  if ! node_ok; then
    echo "Node.js installation failed." >&2
    exit 1
  fi
  log "Installed Node.js $(node_version)."
}

enable_yarn() {
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  if ! corepack yarn --version >/dev/null 2>&1; then
    log "Updating Corepack"
    if ! npm install -g corepack@latest; then
      echo "Could not install Corepack into the Node.js directory." >&2
      exit 1
    fi
  fi
  local got
  got="$(corepack yarn --version | tr -d '[:space:]')"
  case "$got" in
    4.*) log "Using Yarn $got." ;;
    *)
      echo "Yarn $got cannot install this project. Yarn 4 is required (packageManager is yarn@$YARN_VERSION)." >&2
      exit 1
      ;;
  esac
}

install_deps() {
  log "Installing project packages"
  corepack yarn install
}

ollama_bin() {
  if command -v ollama >/dev/null 2>&1; then
    command -v ollama
    return 0
  fi
  if [[ -x "$HOME/Applications/Ollama.app/Contents/Resources/ollama" ]]; then
    printf '%s\n' "$HOME/Applications/Ollama.app/Contents/Resources/ollama"
    return 0
  fi
  if [[ -x /Applications/Ollama.app/Contents/Resources/ollama ]]; then
    printf '%s\n' "/Applications/Ollama.app/Contents/Resources/ollama"
    return 0
  fi
  return 1
}

start_ollama() {
  local bin="$1"
  if curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:11434/api/tags"; then
    return 0
  fi
  if [[ "$OS" == "macos" ]]; then
    if [[ -d "$HOME/Applications/Ollama.app" ]]; then
      open "$HOME/Applications/Ollama.app" >/dev/null 2>&1 || true
    else
      open -a Ollama >/dev/null 2>&1 || true
    fi
  fi
  if ! curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:11434/api/tags"; then
    nohup "$bin" serve >/tmp/job-finder-ollama.log 2>&1 &
    disown || true
  fi
  local i=0
  while [[ "$i" -lt 30 ]]; do
    if curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:11434/api/tags"; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

install_ollama() {
  log "Checking Ollama (ranks roles; the site still opens without it)"
  local bin=""
  if bin="$(ollama_bin)"; then
    :
  else
    case "$OS" in
      macos)
        if command -v brew >/dev/null 2>&1; then
          brew install ollama || warn "Homebrew could not install Ollama."
        else
          local tmp zip dest
          tmp="$(mktemp -d)"
          zip="$tmp/Ollama.zip"
          dest="$HOME/Applications"
          if curl -fL "https://ollama.com/download/Ollama-darwin.zip" -o "$zip"; then
            mkdir -p "$dest"
            unzip -q -o "$zip" -d "$dest" || warn "Could not unpack Ollama."
          else
            warn "Could not download Ollama."
          fi
          rm -rf "$tmp"
        fi
        hash -r || true
        ;;
      linux)
        if ! curl -fsSL https://ollama.com/install.sh | sh; then
          warn "Could not install Ollama. The site will open, but roles will not be ranked."
        fi
        hash -r || true
        ;;
      *)
        warn "Install Ollama from https://ollama.com if you want role ranking."
        ;;
    esac
    bin="$(ollama_bin || true)"
  fi

  if [[ -z "$bin" ]]; then
    warn "Ollama is not available. Role ranking stays off until it is installed."
    return 0
  fi
  if start_ollama "$bin"; then
    log "Downloading ranking model $OLLAMA_MODEL (about 1 GB)"
    "$bin" pull "$OLLAMA_MODEL" || warn "Could not download $OLLAMA_MODEL."
  else
    warn "Ollama is installed but not running. Start it, then run: ollama pull $OLLAMA_MODEL"
  fi
}

main() {
  detect_os
  log "Job Finder setup"
  printf 'Operating system: %s (%s)\n' "$OS" "$(uname -m)"
  printf 'This installs Node.js %s or newer, Yarn %s, project packages, and Ollama for ranking.\n' "$NODE_MIN" "$YARN_VERSION"
  printf 'The SQLite database is created automatically at data/jobs.db.\n'
  if [[ ! -f "$ROOT/package.json" ]]; then
    echo "package.json was not found in $ROOT" >&2
    exit 1
  fi
  install_node
  enable_yarn
  install_deps
  install_ollama
  log "Setup finished."
  case "$OS" in
    macos) printf 'Next: double-click "Open Job Finder.command". Leave that window open while you use the app.\n' ;;
    windows) printf 'Next: double-click "Open Job Finder.bat". Leave that window open while you use the app.\n' ;;
    *) printf 'Next: double-click "Open Job Finder.sh". Leave that window open while you use the app.\n' ;;
  esac
}

main "$@"
