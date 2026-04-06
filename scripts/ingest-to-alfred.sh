#!/usr/bin/env bash
# ingest-to-alfred.sh — Feed new content to Alfred's inbox for processing
#
# Two sources:
#   1. Conversation archives from groups/*/conversations/
#   2. Workspace files from vault/workspace/
#
# Alfred's Curator processes inbox files into structured knowledge records
# (decisions, tasks, people, projects, assumptions, etc.)
#
# Usage:
#   ./scripts/ingest-to-alfred.sh                 # process all new content
#   ./scripts/ingest-to-alfred.sh --dry-run       # show what would be ingested
#   ./scripts/ingest-to-alfred.sh --conversations  # conversations only
#   ./scripts/ingest-to-alfred.sh --workspace      # workspace files only
#   ./scripts/ingest-to-alfred.sh --reset          # clear state (re-ingest all)
#
# Called automatically by NanoClaw after each agent session ends.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$PROJECT_ROOT/data/ingest-alfred.state"
DRY_RUN=false
DO_CONVERSATIONS=true
DO_WORKSPACE=true

# Parse args
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --conversations) DO_WORKSPACE=false ;;
    --workspace) DO_CONVERSATIONS=false ;;
    --reset)
      rm -f "$STATE_FILE"
      echo "State cleared. Next run will process everything."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--dry-run] [--conversations] [--workspace] [--reset]"
      exit 1
      ;;
  esac
done

# Resolve ALFRED_VAULT_PATH from env or .env file
if [ -z "${ALFRED_VAULT_PATH:-}" ]; then
  if [ -f "$PROJECT_ROOT/.env" ]; then
    ALFRED_VAULT_PATH=$(grep -E '^ALFRED_VAULT_PATH=' "$PROJECT_ROOT/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
  fi
fi
ALFRED_VAULT_PATH="${ALFRED_VAULT_PATH/#\~/$HOME}"

if [ -z "${ALFRED_VAULT_PATH:-}" ]; then
  echo "Error: ALFRED_VAULT_PATH not set. Add it to .env or export it."
  exit 1
fi

INBOX_DIR="$ALFRED_VAULT_PATH/inbox"
if [ ! -d "$ALFRED_VAULT_PATH" ]; then
  echo "Error: Alfred vault not found at $ALFRED_VAULT_PATH"
  exit 1
fi

mkdir -p "$INBOX_DIR"
mkdir -p "$(dirname "$STATE_FILE")"
touch "$STATE_FILE"

COUNT=0
SKIPPED=0

# Helper: ingest a file if not already processed
ingest_file() {
  local file="$1"
  local state_key="$2"
  local target_name="$3"
  local source_type="$4"

  # Skip if already processed
  if grep -qF "$state_key" "$STATE_FILE" 2>/dev/null; then
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local target_path="$INBOX_DIR/$target_name"

  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] [$source_type] $state_key → inbox/$target_name"
    COUNT=$((COUNT + 1))
    return
  fi

  # Copy with source frontmatter
  {
    echo "---"
    echo "source: nanoclaw-$source_type"
    echo "created: $(date -Iseconds)"
    echo "original_path: $state_key"
    echo "---"
    echo ""
    cat "$file"
  } > "$target_path"

  echo "$state_key" >> "$STATE_FILE"
  COUNT=$((COUNT + 1))
  echo "Ingested [$source_type]: $state_key"
}

# --- Source 1: Conversation archives ---
if [ "$DO_CONVERSATIONS" = true ]; then
  for file in "$PROJECT_ROOT"/groups/*/conversations/*.md; do
    [ -f "$file" ] || continue
    rel_path="${file#$PROJECT_ROOT/groups/}"
    group_name="${rel_path%%/*}"
    filename="$(basename "$file")"
    ingest_file "$file" "conv:${group_name}/${filename}" "conversation-${group_name}-${filename}" "conversation"
  done
fi

# --- Source 2: Workspace files ---
if [ "$DO_WORKSPACE" = true ]; then
  WORKSPACE_DIR="$PROJECT_ROOT/vault/workspace"
  if [ -d "$WORKSPACE_DIR" ]; then
    while IFS= read -r -d '' file; do
      rel_path="${file#$WORKSPACE_DIR/}"
      # Use modification time as part of the key so re-edited files get re-ingested
      mod_time=$(stat -f '%m' "$file" 2>/dev/null || stat -c '%Y' "$file" 2>/dev/null || echo "0")
      ingest_file "$file" "ws:${rel_path}:${mod_time}" "workspace-$(echo "$rel_path" | tr '/' '-')" "workspace"
    done < <(find "$WORKSPACE_DIR" -name '*.md' -type f -print0)
  fi
fi

# Summary
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "Dry run: $COUNT new items would be ingested ($SKIPPED already processed)"
else
  if [ "$COUNT" -gt 0 ]; then
    echo "Ingested $COUNT items into Alfred inbox ($SKIPPED already processed)"
  fi
fi
