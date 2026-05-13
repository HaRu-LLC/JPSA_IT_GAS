#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="pipeline"
ROOT="$DEFAULT_ROOT"
PUSH=0
FORCE_PUSH=0
DEPLOY=0
REDEPLOY_ID=""
VERSION_DESC=""
BOOTSTRAP_SCRIPT_ID=""
REPORT=""
STRICT_SCAN=0

TERMS=()

usage() {
  cat <<'USAGE'
Usage:
  ops/run_schema_change_pipeline.sh [options]

Modes:
  --mode pipeline|scan|smoke   default: pipeline

Schema terms (repeatable):
  --term <value>
  --old <value>
  --new <value>
  --canonical <value>

Clasp/deploy options:
  --bootstrap-script-id <id>   run bootstrap_clasp.sh with script id
  --push                        run clasp push
  --force                       use --force with clasp push
  --version-desc <text>         run clasp version with description
  --deploy                      run clasp deploy
  --redeploy-id <id>            run clasp redeploy <id>

Other:
  --root <path>                 project root (default: script parent)
  --report <path>               report file path
  --strict-scan                 fail when any scan term is not found
  -h, --help

Examples:
  ops/run_schema_change_pipeline.sh --mode scan --old "旧列" --new "新列" --canonical "正規化列"
  ops/run_schema_change_pipeline.sh --mode smoke
  ops/run_schema_change_pipeline.sh --mode pipeline --old "A" --new "B" --canonical "C" --push
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"; shift 2 ;;
    --root)
      ROOT="${2:-}"; shift 2 ;;
    --term|--old|--new|--canonical)
      TERMS+=("${2:-}"); shift 2 ;;
    --push)
      PUSH=1; shift ;;
    --force)
      FORCE_PUSH=1; shift ;;
    --version-desc)
      VERSION_DESC="${2:-}"; shift 2 ;;
    --deploy)
      DEPLOY=1; shift ;;
    --redeploy-id)
      REDEPLOY_ID="${2:-}"; shift 2 ;;
    --bootstrap-script-id)
      BOOTSTRAP_SCRIPT_ID="${2:-}"; shift 2 ;;
    --report)
      REPORT="${2:-}"; shift 2 ;;
    --strict-scan)
      STRICT_SCAN=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1 ;;
  esac
done

case "$MODE" in
  pipeline|scan|smoke) ;;
  *)
    echo "Invalid mode: $MODE" >&2
    exit 1 ;;
esac

ROOT="$(cd "$ROOT" && pwd)"

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SCAN_SCRIPT="$CODEX_HOME/skills/gas-schema-sync/scripts/column_impact_scan.py"
CHECK_SCRIPT="$CODEX_HOME/skills/gas-smoke-test/scripts/check_gas_contracts.py"
BOOTSTRAP_SCRIPT="$CODEX_HOME/skills/gas-clasp/scripts/bootstrap_clasp.sh"

if [[ -z "$REPORT" ]]; then
  mkdir -p "$ROOT/ops/reports"
  REPORT="$ROOT/ops/reports/pipeline-$(date +%Y%m%d-%H%M%S)-$$.log"
fi

log() {
  echo "[$(date '+%F %T')] $*" | tee -a "$REPORT"
}

run_cmd() {
  local title="$1"
  shift
  log "START: $title"
  {
    echo
    echo "### $title"
    printf '$ %q ' "$@"
    echo
    "$@"
  } >> "$REPORT" 2>&1 || {
    log "FAIL: $title"
    echo "See report: $REPORT" >&2
    exit 1
  }
  log "OK: $title"
}

run_scan() {
  log "START: schema impact scan"
  {
    echo
    echo "### schema impact scan"
    printf '$ %q ' python3 "$SCAN_SCRIPT" "${TERMS[@]}" --root "$ROOT"
    echo
  } >> "$REPORT"

  set +e
  python3 "$SCAN_SCRIPT" "${TERMS[@]}" --root "$ROOT" >> "$REPORT" 2>&1
  local rc=$?
  set -e

  if [[ $rc -eq 0 ]]; then
    log "OK: schema impact scan"
    return 0
  fi

  if [[ $rc -eq 2 && $STRICT_SCAN -eq 0 ]]; then
    log "WARN: schema impact scan found missing terms (non-strict mode)"
    return 0
  fi

  log "FAIL: schema impact scan"
  echo "See report: $REPORT" >&2
  exit 1
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

need_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing file: $1" >&2
    exit 1
  fi
}

need_cmd python3
need_cmd clasp
need_file "$SCAN_SCRIPT"
need_file "$CHECK_SCRIPT"
need_file "$BOOTSTRAP_SCRIPT"

if [[ "$MODE" == "scan" || "$MODE" == "pipeline" ]]; then
  if [[ ${#TERMS[@]} -eq 0 ]]; then
    echo "Mode '$MODE' requires at least one term (--term/--old/--new/--canonical)." >&2
    exit 1
  fi
fi

log "Mode=$MODE"
log "Root=$ROOT"
log "Report=$REPORT"

if [[ -n "$BOOTSTRAP_SCRIPT_ID" ]]; then
  run_cmd "bootstrap clasp workspace" bash -lc "cd \"$ROOT\" && \"$BOOTSTRAP_SCRIPT\" \"$BOOTSTRAP_SCRIPT_ID\""
fi

if [[ "$MODE" == "scan" || "$MODE" == "pipeline" ]]; then
  run_scan
fi

if [[ "$MODE" == "smoke" || "$MODE" == "pipeline" ]]; then
  run_cmd "static gas contract checks" python3 "$CHECK_SCRIPT" --root "$ROOT"
  run_cmd "clasp status" bash -lc "cd \"$ROOT\" && clasp status"
fi

if [[ "$MODE" == "pipeline" ]]; then
  if [[ $PUSH -eq 1 ]]; then
    if [[ $FORCE_PUSH -eq 1 ]]; then
      run_cmd "clasp push --force" bash -lc "cd \"$ROOT\" && clasp push --force"
    else
      run_cmd "clasp push" bash -lc "cd \"$ROOT\" && clasp push"
    fi
  fi

  if [[ -n "$VERSION_DESC" ]]; then
    run_cmd "clasp version" bash -lc "cd \"$ROOT\" && clasp version \"$VERSION_DESC\""
  fi

  if [[ -n "$REDEPLOY_ID" ]]; then
    run_cmd "clasp redeploy" bash -lc "cd \"$ROOT\" && clasp redeploy \"$REDEPLOY_ID\""
  elif [[ $DEPLOY -eq 1 ]]; then
    run_cmd "clasp deploy" bash -lc "cd \"$ROOT\" && clasp deploy"
  fi
fi

log "DONE"
echo "Pipeline completed. Report: $REPORT"
