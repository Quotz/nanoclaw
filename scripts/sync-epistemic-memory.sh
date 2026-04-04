#!/usr/bin/env bash
# [skill/epistemic-memory] Sync container skills from upstream epistemic-memory repo.
# Pulls latest protocol and mirror files, regenerates container skills if changed.
#
# Usage:
#   ./scripts/sync-epistemic-memory.sh           # interactive
#   ./scripts/sync-epistemic-memory.sh --check   # check for updates only
#   ./scripts/sync-epistemic-memory.sh --yes     # non-interactive
set -euo pipefail

REPO_URL="https://github.com/rodspeed/epistemic-memory.git"
CLONE_DIR="/tmp/epistemic-memory-sync"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$PROJECT_ROOT/.epistemic-memory-version"
PROTOCOL_SKILL="$PROJECT_ROOT/container/skills/epistemic-memory/SKILL.md"
MIRROR_SKILL="$PROJECT_ROOT/container/skills/epistemic-memory-mirror/SKILL.md"

CHECK_ONLY=false
AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    --yes)   AUTO_YES=true ;;
    *)       echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# --- Step 1: Get current local version ---
LOCAL_HASH=""
if [ -f "$VERSION_FILE" ]; then
  LOCAL_HASH=$(cat "$VERSION_FILE" | tr -d '[:space:]')
fi

# --- Step 2: Clone/pull upstream ---
echo "Fetching upstream epistemic-memory..."
if [ -d "$CLONE_DIR/.git" ]; then
  cd "$CLONE_DIR"
  git fetch origin --quiet
  git reset --hard origin/master --quiet 2>/dev/null || git reset --hard origin/main --quiet
  cd "$PROJECT_ROOT"
else
  rm -rf "$CLONE_DIR"
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR" 2>/dev/null
fi

REMOTE_HASH=$(cd "$CLONE_DIR" && git rev-parse HEAD)
REMOTE_SHORT=$(echo "$REMOTE_HASH" | cut -c1-7)

echo "Local:  ${LOCAL_HASH:-none}"
echo "Remote: $REMOTE_SHORT ($REMOTE_HASH)"

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
  echo "Already up to date."
  exit 0
fi

echo "Update available: ${LOCAL_HASH:0:7} -> $REMOTE_SHORT"

if $CHECK_ONLY; then
  exit 0
fi

# --- Step 3: Show what changed ---
if [ -n "$LOCAL_HASH" ] && [ -d "$CLONE_DIR/.git" ]; then
  echo ""
  echo "=== Changes ==="
  # For shallow clones, just show file list
  (cd "$CLONE_DIR" && git log --oneline -10 2>/dev/null) || echo "(shallow clone — full diff unavailable)"
  echo ""
fi

if ! $AUTO_YES; then
  read -p "Update container skills? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# --- Step 4: Regenerate container skills ---
echo "Regenerating container skills..."

# Source files from upstream
UPSTREAM_PROTOCOL="$CLONE_DIR/memory/user/epistemic-protocol.md"
UPSTREAM_MIRROR="$CLONE_DIR/.claude/skills/mirror/SKILL.md"
UPSTREAM_TENSIONS="$CLONE_DIR/memory/user/tensions.md"
UPSTREAM_PROFILE="$CLONE_DIR/memory/user/profile-example.md"
UPSTREAM_COUNTER="$CLONE_DIR/memory/user/session-counter.json"
UPSTREAM_INDEX="$CLONE_DIR/memory/user/INDEX.md"

# Check that source files exist
for f in "$UPSTREAM_PROTOCOL" "$UPSTREAM_MIRROR" "$UPSTREAM_TENSIONS"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: Expected file not found: $f"
    echo "The upstream repo structure may have changed. Manual update needed."
    exit 1
  fi
done

# Generate the protocol container skill
# We build this from the upstream protocol file, adapted for NanoClaw's container paths
cat > "$PROTOCOL_SKILL" << 'SKILL_HEADER'
# Epistemic Memory — Belief Protocol

Weighted hypothesis model of the user. Beliefs carry confidence, timestamps, permanence classification, and dormancy decay. This replaces flat-fact memory with a living, self-correcting profile.

**Storage:** `/workspace/group/memory/epistemic/`

## Quick Reference

| File | Purpose |
|------|---------|
| `profile.md` | All beliefs about the user (one `##` heading per belief) |
| `tensions.md` | Contradictions and surprises log |
| `session-counter.json` | Session count, review triggers |
| `INDEX.md` | Index of profile files |

---

SKILL_HEADER

# Extract the core protocol content (skip frontmatter)
awk 'BEGIN{skip=0} /^---$/{skip++; next} skip>=2{print}' "$UPSTREAM_PROTOCOL" \
  | sed 's|memory/user/|/workspace/group/memory/epistemic/|g' \
  >> "$PROTOCOL_SKILL"

# Append version tag
echo "" >> "$PROTOCOL_SKILL"
echo "---" >> "$PROTOCOL_SKILL"
echo "" >> "$PROTOCOL_SKILL"
echo "*Synced from [rodspeed/epistemic-memory](https://github.com/rodspeed/epistemic-memory) @ $REMOTE_SHORT*" >> "$PROTOCOL_SKILL"

# Copy the mirror skill, adapting paths
sed 's|memory/user/|/workspace/group/memory/epistemic/|g; s|user/epistemic-protocol\.md|the epistemic-memory skill|g' \
  "$UPSTREAM_MIRROR" \
  | sed "s|your project's memory directory|/workspace/group/memory/epistemic/|g" \
  > "$MIRROR_SKILL"

# Append storage reference and version tag
cat >> "$MIRROR_SKILL" << EOF

---

*Synced from [rodspeed/epistemic-memory](https://github.com/rodspeed/epistemic-memory) @ $REMOTE_SHORT*
EOF

# --- Step 5: Update version file ---
echo "$REMOTE_HASH" > "$VERSION_FILE"

# --- Step 6: Copy skills to existing group sessions ---
SESSIONS_DIR="$PROJECT_ROOT/data/sessions"
if [ -d "$SESSIONS_DIR" ]; then
  updated=0
  for group_dir in "$SESSIONS_DIR"/*/; do
    skills_dir="$group_dir.claude/skills"
    if [ -d "$skills_dir" ]; then
      cp -r "$PROJECT_ROOT/container/skills/epistemic-memory" "$skills_dir/"
      cp -r "$PROJECT_ROOT/container/skills/epistemic-memory-mirror" "$skills_dir/"
      updated=$((updated + 1))
    fi
  done
  if [ $updated -gt 0 ]; then
    echo "Updated skills in $updated group session(s)."
  fi
fi

echo ""
echo "Done! Container skills updated to $REMOTE_SHORT."
echo ""
echo "Next steps:"
echo "  - Review changes in container/skills/epistemic-memory/"
echo "  - Review changes in container/skills/epistemic-memory-mirror/"
echo "  - Rebuild container if skills are baked into image: ./container/build.sh"
echo "  - Commit changes: git add -A && git commit"
