#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

check_url() {
  local url="$1"
  curl -s --max-time 2 -o /dev/null "$url"
}

if check_url "http://127.0.0.1:6003/api/settings" && check_url "http://127.0.0.1:3000/"; then
  exit 0
fi

echo "[keepalive] restarting services..." >&2
./start.sh start >/dev/null 2>&1 || true
