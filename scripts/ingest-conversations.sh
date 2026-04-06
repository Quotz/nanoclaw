#!/usr/bin/env bash
# ingest-conversations.sh — Copy new conversation archives to Alfred's inbox
#
# Scans groups/*/conversations/ for markdown files not yet processed,
# adds source frontmatter, and copies them to Alfred's vault inbox.
# Alfred's Curator worker will then process them into structured records.
#
# Usage:
#   ./scripts/ingest-conversations.sh              # process new conversations
#   ./scripts/ingest-conversations.sh --dry-run    # show what would be copied
#   ./scripts/ingest-conversations.sh --reset      # clear processed state (re-ingest all)
#
# Requires:
#   ALFRED_VAULT_PATH — path to Alfred vault (reads from .env if not set)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$PROJECT_ROOT/data/ingest-conversations.state"
DRY_RUN=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --reset)
      rm -f "$STATE_FILE"
      echo "State cleared. Next run will process all conversations."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--dry-run] [--reset]"
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

# Expand ~ in path
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

# Find all conversation markdown files
CONVERSATIONS_PATTERN="$PROJECT_ROOT/groups/*/conversations/*.md"
COUNT=0
SKIPPED=0

for file in $CONVERSATIONS_PATTERN; do
  [ -f "$file" ] || continue

  # Derive a unique key from the file path (group + filename)
  REL_PATH="${file#$PROJECT_ROOT/groups/}"
  GROUP_NAME="${REL_PATH%%/*}"
  FILENAME="$(basename "$file")"
  STATE_KEY="${GROUP_NAME}/${FILENAME}"

  # Skip if already processed
  if grep -qF "$STATE_KEY" "$STATE_FILE" 2>/dev/null; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Target filename includes group name to avoid collisions
  TARGET_NAME="${GROUP_NAME}-${FILENAME}"
  TARGET_PATH="$INBOX_DIR/$TARGET_NAME"

  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] Would copy: $STATE_KEY → inbox/$TARGET_NAME"
    COUNT=$((COUNT + 1))
    continue
  fi

  # Copy with source frontmatter prepended
  {
    echo "---"
    echo "source: nanoclaw"
    echo "group: $GROUP_NAME"
    echo "created: $(date -Iseconds)"
    echo "original_path: $REL_PATH"
    echo "---"
    echo ""
    cat "$file"
  } > "$TARGET_PATH"

  # Record as processed
  echo "$STATE_KEY" >> "$STATE_FILE"
  COUNT=$((COUNT + 1))
  echo "Ingested: $STATE_KEY → inbox/$TARGET_NAME"
done

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "Dry run: $COUNT new conversations would be ingested ($SKIPPED already processed)"
else
  if [ "$COUNT" -gt 0 ]; then
    echo ""
    echo "Ingested $COUNT conversations into Alfred inbox ($SKIPPED already processed)"
    echo "Alfred's Curator will process them into structured records."
  else
    echo "No new conversations to ingest ($SKIPPED already processed)"
  fi
fi
