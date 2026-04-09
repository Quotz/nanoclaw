#!/usr/bin/env bash
# ingest-to-memory.sh — Append observations to vault/memory/ from new content sources
#
# Two sources:
#   1. Conversation archives from groups/*/conversations/
#   2. Workspace files from vault/workspace/
#
# For each new/changed source, appends a one-line observation (pointer + snippet)
# to the appropriate domain's observations.md. Never copies full content — just
# references the source file via a wiki-style pointer.
#
# Domain routing:
#   - Conversations → personal/observations.md by default (content-agnostic)
#   - Workspace files → personal/observations.md unless path starts with `work/`
#     in which case → work/<first-path-segment>/observations.md
#
# Usage:
#   ./scripts/ingest-to-memory.sh                 # process all new content
#   ./scripts/ingest-to-memory.sh --dry-run       # show what would be ingested
#   ./scripts/ingest-to-memory.sh --conversations # conversations only
#   ./scripts/ingest-to-memory.sh --workspace     # workspace files only
#   ./scripts/ingest-to-memory.sh --reset         # clear state (re-ingest all)
#
# Called automatically by NanoClaw after each agent session ends.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STATE_FILE="$PROJECT_ROOT/data/ingest-memory.state"
MEMORY_ROOT="$PROJECT_ROOT/vault/memory"
WORKSPACE_DIR="$PROJECT_ROOT/vault/workspace"
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

if [ ! -d "$MEMORY_ROOT" ]; then
  echo "Error: vault/memory/ not found. Run /add-cog-memory to scaffold it first."
  exit 1
fi

mkdir -p "$(dirname "$STATE_FILE")"
touch "$STATE_FILE"

COUNT=0
SKIPPED=0

# Resolve domain for a workspace file based on its relative path
# Returns "personal" or "work/<project>"
resolve_workspace_domain() {
  local rel_path="$1"
  if [[ "$rel_path" == work/* ]]; then
    # work/<project>/... → work/<project>
    local project
    project="$(echo "$rel_path" | cut -d/ -f2)"
    if [ -n "$project" ]; then
      echo "work/$project"
      return
    fi
  fi
  echo "personal"
}

# Ensure a domain's observations.md exists (bootstrap if missing)
ensure_domain_observations() {
  local domain="$1"
  local obs_file="$MEMORY_ROOT/$domain/observations.md"
  if [ ! -f "$obs_file" ]; then
    mkdir -p "$(dirname "$obs_file")"
    cat > "$obs_file" <<EOF
<!-- L0: ${domain} domain append-only event log — raw observations tagged by theme -->
# ${domain} Observations

<!--
Format: - YYYY-MM-DD [tags]: <observation>
Append only. Never edit past entries.
-->
EOF
  fi
}

# Append one observation line to a domain's observations.md
append_observation() {
  local domain="$1"
  local tag="$2"
  local summary="$3"
  local source_ref="$4"

  local obs_file="$MEMORY_ROOT/$domain/observations.md"
  local today
  today="$(date +%Y-%m-%d)"
  local line="- ${today} [${tag}]: ${summary} [[${source_ref}]]"

  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] [$domain] $line"
    return
  fi

  ensure_domain_observations "$domain"
  echo "$line" >> "$obs_file"
}

# Extract a summary from a conversation transcript.
# Looks for the first <message> tag content (the user's opening message).
extract_conversation_summary() {
  local file="$1"
  local msg
  # Try to grab the first user message from <message ...>content</message>
  # Uses sed (macOS-compatible, no grep -P needed)
  msg="$(sed -n 's/.*<message[^>]*>\([^<]*\)<\/message>.*/\1/p' "$file" 2>/dev/null | head -1 | head -c 80)"
  if [ -n "$msg" ]; then
    echo "$msg"
    return
  fi
  # Fallback: first **User**: line, stripping XML tags
  msg="$(grep -m1 '^\*\*User\*\*:' "$file" 2>/dev/null | sed 's/\*\*User\*\*: //;s/<[^>]*>//g' | head -c 80)"
  if [ -n "$msg" ]; then
    echo "$msg"
    return
  fi
  echo "(conversation)"
}

# Extract a summary from a workspace/general markdown file.
# Takes the first non-empty, non-heading, non-frontmatter line.
extract_file_summary() {
  local file="$1"
  local summary
  summary="$(awk '
    BEGIN { in_fm = 0 }
    /^---$/ { in_fm = !in_fm; next }
    in_fm { next }
    /^#/ { next }
    /^<!--/ { next }
    /^[[:space:]]*$/ { next }
    { print; exit }
  ' "$file" | head -c 80)"
  echo "${summary:-(no preview)}"
}

# Generic: ingest a file if not already processed
ingest_file() {
  local file="$1"
  local state_key="$2"
  local domain="$3"
  local tag="$4"
  local source_ref="$5"

  if grep -qF "$state_key" "$STATE_FILE" 2>/dev/null; then
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local summary
  if [ "$tag" = "conversation" ]; then
    summary="$(extract_conversation_summary "$file")"
  else
    summary="$(extract_file_summary "$file")"
  fi

  append_observation "$domain" "$tag" "$summary" "$source_ref"

  if [ "$DRY_RUN" != true ]; then
    echo "$state_key" >> "$STATE_FILE"
  fi
  COUNT=$((COUNT + 1))
}

# --- Source 1: Conversation archives ---
if [ "$DO_CONVERSATIONS" = true ]; then
  for file in "$PROJECT_ROOT"/groups/*/conversations/*.md; do
    [ -f "$file" ] || continue
    rel_path="${file#$PROJECT_ROOT/groups/}"
    group_name="${rel_path%%/*}"
    filename="$(basename "$file")"
    state_key="conv:${group_name}/${filename}"

    # Conversation source ref: relative path from project root (for wiki-link discovery)
    source_ref="groups/${group_name}/conversations/${filename%.md}"

    # Conversations land in personal/ by default
    ingest_file "$file" "$state_key" "personal" "conversation" "$source_ref"
  done
fi

# --- Source 2: Workspace files ---
if [ "$DO_WORKSPACE" = true ]; then
  if [ -d "$WORKSPACE_DIR" ]; then
    while IFS= read -r -d '' file; do
      rel_path="${file#$WORKSPACE_DIR/}"
      mod_time=$(stat -f '%m' "$file" 2>/dev/null || stat -c '%Y' "$file" 2>/dev/null || echo "0")
      state_key="ws:${rel_path}:${mod_time}"

      domain="$(resolve_workspace_domain "$rel_path")"
      source_ref="vault/workspace/${rel_path%.md}"

      ingest_file "$file" "$state_key" "$domain" "workspace" "$source_ref"
    done < <(find "$WORKSPACE_DIR" -name '*.md' -type f -print0)
  fi
fi

# Summary
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "Dry run: $COUNT new items would be ingested ($SKIPPED already processed)"
else
  if [ "$COUNT" -gt 0 ]; then
    echo "Ingested $COUNT observations into vault/memory/ ($SKIPPED already processed)"
  fi
fi
