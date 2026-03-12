#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID_FILE="$ROOT_DIR/.webapp.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

mkdir -p "$LOG_DIR"

is_running() {
  local pid_file="$1"
  if [ ! -f "$pid_file" ]; then
    return 1
  fi
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    return 1
  fi
  kill -0 "$pid" 2>/dev/null
}

start_backend() {
  if is_running "$BACKEND_PID_FILE"; then
    echo "Backend already running (PID $(cat "$BACKEND_PID_FILE"))."
    return
  fi

  echo "Starting backend on http://127.0.0.1:6003 ..."
  (
    cd "$ROOT_DIR"
    nohup python3 webapp.py 6003 > "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
  )
  echo "Backend started (PID $(cat "$BACKEND_PID_FILE"))."
}

start_frontend() {
  if is_running "$FRONTEND_PID_FILE"; then
    echo "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))."
    return
  fi

  echo "Starting frontend on http://127.0.0.1:3000 ..."
  (
    cd "$ROOT_DIR/frontend"
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
  )
  echo "Frontend started (PID $(cat "$FRONTEND_PID_FILE"))."
}

stop_service() {
  local name="$1"
  local pid_file="$2"

  if ! is_running "$pid_file"; then
    rm -f "$pid_file"
    echo "$name is not running."
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  echo "Stopping $name (PID $pid) ..."
  kill "$pid" 2>/dev/null || true

  for _ in {1..20}; do
    if kill -0 "$pid" 2>/dev/null; then
      sleep 0.2
    else
      break
    fi
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "$name did not exit in time, sending SIGKILL."
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  echo "$name stopped."
}

status() {
  if is_running "$BACKEND_PID_FILE"; then
    echo "Backend: running (PID $(cat "$BACKEND_PID_FILE"))"
  else
    echo "Backend: stopped"
  fi

  if is_running "$FRONTEND_PID_FILE"; then
    echo "Frontend: running (PID $(cat "$FRONTEND_PID_FILE"))"
  else
    echo "Frontend: stopped"
  fi
}

ensure() {
  local recovered=0

  if ! is_running "$BACKEND_PID_FILE"; then
    echo "Backend not running; auto-starting..."
    start_backend
    recovered=1
  fi

  if ! is_running "$FRONTEND_PID_FILE"; then
    echo "Frontend not running; auto-starting..."
    start_frontend
    recovered=1
  fi

  if [ "$recovered" -eq 0 ]; then
    echo "All services already running."
  else
    echo "Logs: $BACKEND_LOG, $FRONTEND_LOG"
  fi
}

case "${1:-start}" in
  start)
    start_backend
    start_frontend
    echo "Logs: $BACKEND_LOG, $FRONTEND_LOG"
    ;;
  stop)
    stop_service "Frontend" "$FRONTEND_PID_FILE"
    stop_service "Backend" "$BACKEND_PID_FILE"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    status
    ;;
  ensure)
    ensure
    ;;
  *)
    echo "Usage: $0 [start|stop|restart|status|ensure]"
    exit 1
    ;;
esac
