#!/usr/bin/env bash
# Check all external skill dependencies for available updates.
# Runs non-destructively — only reports, never modifies files.
#
# Usage:
#   ./scripts/check-external-updates.sh          # check all
#   ./scripts/check-external-updates.sh --json   # machine-readable output
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

JSON_MODE=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_MODE=true ;;
  esac
done

updates_available=0
json_entries=()

# --- Helper: check a git-based external dependency ---
check_git_dep() {
  local name="$1"
  local repo_url="$2"
  local version_file="$3"
  local sync_script="$4"

  local local_hash=""
  local remote_hash=""
  local stale_days=0

  if [ -f "$version_file" ]; then
    local_hash=$(cat "$version_file" | tr -d '[:space:]')
    # Calculate days since last sync
    local file_mod
    file_mod=$(stat -f %m "$version_file" 2>/dev/null || stat -c %Y "$version_file" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    stale_days=$(( (now - file_mod) / 86400 ))
  fi

  # Query latest commit via GitHub API (lightweight, no clone needed)
  local api_url
  api_url=$(echo "$repo_url" | sed 's|https://github.com/|https://api.github.com/repos/|; s|\.git$||')
  remote_hash=$(curl -sf "${api_url}/commits?per_page=1" 2>/dev/null | grep -m1 '"sha"' | sed 's/.*"sha": "//; s/".*//' || echo "")

  if [ -z "$remote_hash" ]; then
    # Fallback: shallow clone
    local tmp_dir="/tmp/check-${name}-$$"
    git clone --depth 1 --quiet "$repo_url" "$tmp_dir" 2>/dev/null || true
    if [ -d "$tmp_dir/.git" ]; then
      remote_hash=$(cd "$tmp_dir" && git rev-parse HEAD)
    fi
    rm -rf "$tmp_dir"
  fi

  local has_update=false
  if [ -z "$local_hash" ]; then
    has_update=true
  elif [ -n "$remote_hash" ] && [ "$local_hash" != "$remote_hash" ]; then
    has_update=true
  fi

  if $JSON_MODE; then
    json_entries+=("{\"name\":\"$name\",\"local\":\"${local_hash:0:7}\",\"remote\":\"${remote_hash:0:7}\",\"stale_days\":$stale_days,\"has_update\":$has_update,\"sync_script\":\"$sync_script\"}")
  else
    if $has_update; then
      echo "  $name: UPDATE AVAILABLE"
      echo "    Local:  ${local_hash:0:7:-none}"
      echo "    Remote: ${remote_hash:0:7:-unknown}"
      echo "    Update: $sync_script"
      updates_available=$((updates_available + 1))
    else
      local status="up to date"
      if [ $stale_days -gt 30 ]; then
        status="up to date (last checked ${stale_days}d ago)"
      fi
      echo "  $name: $status"
    fi
  fi
}

if ! $JSON_MODE; then
  echo "Checking external skill dependencies..."
  echo ""
fi

# --- Register all external dependencies here ---

# Alfred (if installed)
if [ -f "$PROJECT_ROOT/scripts/update-alfred.sh" ]; then
  # Alfred uses pip, check differently
  local_ver=$(pip show alfred-vault 2>/dev/null | grep "^Version:" | awk '{print $2}' || echo "")
  remote_ver=$(curl -sf "https://pypi.org/pypi/alfred-vault/json" 2>/dev/null | grep -o '"version":"[^"]*"' | head -1 | sed 's/"version":"//;s/"//' || echo "")

  if $JSON_MODE; then
    has_update=false
    if [ -n "$local_ver" ] && [ -n "$remote_ver" ] && [ "$local_ver" != "$remote_ver" ]; then
      has_update=true
    fi
    json_entries+=("{\"name\":\"alfred\",\"local\":\"$local_ver\",\"remote\":\"$remote_ver\",\"stale_days\":0,\"has_update\":$has_update,\"sync_script\":\"./scripts/update-alfred.sh\"}")
  else
    if [ -n "$local_ver" ] && [ -n "$remote_ver" ] && [ "$local_ver" != "$remote_ver" ]; then
      echo "  alfred: UPDATE AVAILABLE ($local_ver -> $remote_ver)"
      echo "    Update: ./scripts/update-alfred.sh"
      updates_available=$((updates_available + 1))
    elif [ -n "$local_ver" ]; then
      echo "  alfred: up to date ($local_ver)"
    else
      echo "  alfred: not installed"
    fi
  fi
fi

# --- Output ---

if $JSON_MODE; then
  echo "[$(IFS=,; echo "${json_entries[*]}")]"
else
  echo ""
  if [ $updates_available -gt 0 ]; then
    echo "$updates_available update(s) available."
  else
    echo "All external dependencies up to date."
  fi
fi

exit $updates_available
