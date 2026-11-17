#!/usr/bin/env bash
# Clean end-to-end test for frugal setup against an isolated 9Router.
#
# What it does:
#   - optionally stops whatever is listening on 127.0.0.1:20128 (asks first)
#   - runs frugal with its own FRUGAL_HOME and a fresh 9Router DATA_DIR
#   - sets a known dashboard password for the fresh instance
#   - stops the frugal-managed 9Router and removes the temp dir on exit
#
# It never touches ~/.9router. Harness configs (Pi/OpenCode) are real unless
# you pass --isolated-home.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/dist/cli/index.js"
WORK="${FRUGAL_CLEAN_DIR:-/tmp/frugal-clean}"
PASSWORD="${FRUGAL_CLEAN_PASSWORD:-test1234}"
STOP_PORT=1
KEEP=0
DRY=0
ISOLATE_HOME=0

usage() {
  cat <<'EOF'
Usage: scripts/frugal-clean-test.sh [options]

  --work <dir>        Temp working dir (default /tmp/frugal-clean)
  --password <pw>     Test dashboard password (default test1234)
  --no-stop           Abort if port 20128 is busy instead of offering to stop it
  --keep              Keep the temp dir after the run
  --isolated-home     Put HOME/XDG in the temp dir so Pi/OpenCode configs are not touched
  --dry-run           Print the plan and exit without touching the port or running setup
  -h, --help          This help

Environment overrides: FRUGAL_CLEAN_DIR, FRUGAL_CLEAN_PASSWORD
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --work) WORK="${2:?--work needs a dir}"; shift 2 ;;
    --password) PASSWORD="${2:?--password needs a value}"; shift 2 ;;
    --no-stop) STOP_PORT=0; shift ;;
    --keep) KEEP=1; shift ;;
    --isolated-home) ISOLATE_HOME=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

export FRUGAL_HOME="$WORK/frugal-home"
export FRUGAL_ROUTER_DATA_DIR="$WORK/nine-data"
export FRUGAL_ROUTER_INITIAL_PASSWORD="$PASSWORD"
export FRUGAL_ROUTER_PASSWORD="$PASSWORD"

if [[ $ISOLATE_HOME -eq 1 ]]; then
  mkdir -p "$WORK/home"
  export HOME="$WORK/home"
  export XDG_CONFIG_HOME="$WORK/home/.config"
fi

echo "frugal clean test"
echo "  repo:            $ROOT"
echo "  FRUGAL_HOME:     $FRUGAL_HOME"
echo "  9Router data:    $FRUGAL_ROUTER_DATA_DIR"
echo "  dashboard pw:    $PASSWORD"
[[ $ISOLATE_HOME -eq 1 ]] && echo "  HOME (isolated): $HOME"

if [[ $DRY -eq 1 ]]; then
  echo "  dry run: not stopping the port, not running setup"
  exit 0
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:20128 -sTCP:LISTEN >/dev/null 2>&1; then
  echo
  echo "Port 20128 is in use:"
  lsof -nP -iTCP:20128 -sTCP:LISTEN
  if [[ $STOP_PORT -eq 0 ]]; then
    echo "Refusing to continue with a busy port (--no-stop)." >&2
    exit 1
  fi
  if [[ -t 0 ]]; then
    read -r -p "Stop it so frugal can start its own 9Router? [y/N] " answer
    case "$answer" in
      y|Y)
        for pid in $(lsof -tiTCP:20128 -sTCP:LISTEN); do
          echo "Stopping PID $pid"
          kill "$pid" 2>/dev/null || true
        done
        sleep 1
        ;;
      *)
        echo "Port still busy; aborting." >&2
        exit 1
        ;;
    esac
  else
    echo "Non-interactive shell; stop it yourself or pass --no-stop." >&2
    exit 1
  fi
fi

mkdir -p "$WORK"

cleanup() {
  echo
  echo "Stopping frugal-managed 9Router..."
  FRUGAL_HOME="$FRUGAL_HOME" node "$CLI" stop >/dev/null 2>&1 || true
  if [[ $KEEP -eq 1 ]]; then
    echo "Kept: $WORK"
  else
    echo "Removing: $WORK"
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

if [[ ! -f "$CLI" ]]; then
  echo "Building frugal..."
  (cd "$ROOT" && npm run build)
fi

echo
echo "Starting frugal setup..."
(cd "$ROOT" && node "$CLI" setup)

echo
echo "Done. If you used the default password, the 9Router dashboard is at:"
echo "  http://127.0.0.1:20128/dashboard"