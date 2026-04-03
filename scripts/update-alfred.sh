#!/usr/bin/env bash
#
# Update Alfred vault integration for NanoClaw.
#
# Checks for new alfred-vault releases on PyPI, upgrades the host and
# container installations, re-syncs the container skill from the live
# schema, rebuilds the container image, and refreshes per-group skills.
#
# Usage:
#   ./scripts/update-alfred.sh           # interactive (prompts before upgrading)
#   ./scripts/update-alfred.sh --yes     # non-interactive (auto-approve)
#   ./scripts/update-alfred.sh --check   # check only, don't upgrade
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

AUTO_YES=false
CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    --check|-c) CHECK_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--yes|--check|--help]"
      echo "  --yes    Auto-approve upgrade (non-interactive)"
      echo "  --check  Check for updates only, don't install"
      exit 0
      ;;
  esac
done

# ---------------------------------------------------------------------------
# 1. Detect current installed version
# ---------------------------------------------------------------------------
echo "=== Alfred Vault Update Check ==="
echo ""

CURRENT=""
if command -v alfred >/dev/null 2>&1; then
  CURRENT=$(pip show alfred-vault 2>/dev/null | grep "^Version:" | awk '{print $2}') || true
fi

if [ -z "$CURRENT" ]; then
  echo "Host: alfred-vault is NOT installed"
  echo "  Install it first: pip install alfred-vault"
  echo "  Or run /add-alfred to set up the full integration."
  exit 1
fi

echo "Host installed: alfred-vault $CURRENT"

# ---------------------------------------------------------------------------
# 2. Check PyPI for latest version
# ---------------------------------------------------------------------------
LATEST=$(python3 -c "
import urllib.request, json, sys
try:
    resp = urllib.request.urlopen('https://pypi.org/pypi/alfred-vault/json', timeout=10)
    data = json.loads(resp.read())
    print(data['info']['version'])
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null) || {
  echo "WARNING: Could not reach PyPI. Skipping version check."
  LATEST="$CURRENT"
}

echo "PyPI latest:    alfred-vault $LATEST"
echo ""

if [ "$CURRENT" = "$LATEST" ]; then
  echo "Already up to date."
  if [ "$CHECK_ONLY" = true ]; then
    exit 0
  fi
  echo ""
  echo "Re-syncing container skill from installed schema anyway..."
else
  echo "Update available: $CURRENT -> $LATEST"
  if [ "$CHECK_ONLY" = true ]; then
    exit 0
  fi

  # Prompt for upgrade
  if [ "$AUTO_YES" = false ]; then
    read -rp "Upgrade alfred-vault to $LATEST? [y/N] " answer
    if [[ ! "$answer" =~ ^[Yy] ]]; then
      echo "Skipped. Run with --yes to auto-approve."
      exit 0
    fi
  fi

  echo ""
  echo "=== Upgrading host installation ==="
  pip install --upgrade alfred-vault
  echo ""
fi

# ---------------------------------------------------------------------------
# 3. Sync container skill from live schema
# ---------------------------------------------------------------------------
echo "=== Syncing container skill ==="
python3 "$SCRIPT_DIR/sync-alfred-schema.py"
echo ""

# ---------------------------------------------------------------------------
# 4. Rebuild container image
# ---------------------------------------------------------------------------
echo "=== Rebuilding container image ==="
"$PROJECT_ROOT/container/build.sh"
echo ""

# ---------------------------------------------------------------------------
# 5. Refresh per-group skills
# ---------------------------------------------------------------------------
echo "=== Refreshing per-group container skills ==="
SKILL_SRC="$PROJECT_ROOT/container/skills/vault-alfred"
COUNT=0
for dir in "$PROJECT_ROOT"/data/sessions/*/.claude/skills; do
  if [ -d "$dir" ]; then
    cp -r "$SKILL_SRC" "$dir/"
    COUNT=$((COUNT + 1))
  fi
done
echo "Updated $COUNT group(s)"
echo ""

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
NEW_VERSION=$(pip show alfred-vault 2>/dev/null | grep "^Version:" | awk '{print $2}') || true
echo "=== Done ==="
echo "alfred-vault: $CURRENT -> ${NEW_VERSION:-$CURRENT}"
echo ""
echo "Restart NanoClaw to pick up changes:"
echo "  macOS:  launchctl kickstart -k gui/\$(id -u)/com.nanoclaw"
echo "  Linux:  systemctl --user restart nanoclaw"
