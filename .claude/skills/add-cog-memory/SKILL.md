---
name: add-cog-memory
description: Scaffold the Cog-native memory system for NanoClaw. Creates vault/memory/ with three-tier structure, installs /memory-* container skills, wires up the post-session ingestion hook, and optionally installs nightly cron for reflect/housekeeping. Replaces the Alfred integration with a zero-runtime architecture.
---

# Add Cog-Native Memory

This skill sets up the Cog-style memory system inside NanoClaw. After running it:

- `vault/memory/` contains a three-tier memory structure (hot/warm/glacier + threads)
- Container agents have `/memory-reflect`, `/memory-housekeeping`, `/memory-evolve`, `/memory-foresight`, `/memory-history` skills available
- Every session-end appends new observations to the appropriate domain
- QMD indexes the memory as a searchable collection
- No Python runtime, no daemon, no background processes — all maintenance is either triggered synchronously or via cron

Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

## Phase 1: Pre-flight

### Check if already applied

```bash
test -f vault/memory/CONVENTIONS.md && echo "ALREADY_APPLIED" || echo "NOT_APPLIED"
```

If already applied, skip to Phase 5 (Verify).

### Check prerequisites

- **Claude Code** must be on PATH: `which claude`
- **jq** for JSON parsing (optional but recommended): `which jq`
- **QMD** installed and configured: `which qmd && qmd status`

If any are missing, tell the user to install them first.

## Phase 2: Apply Code Changes

This skill assumes NanoClaw's `main` branch already contains the Cog integration (memory skills, `ingest-to-memory.sh`, `COG_MEMORY_PATH` in config). If not, the user needs to pull the latest `main` first or merge the feature branch.

Verify the key files exist:

```bash
test -f scripts/ingest-to-memory.sh || echo "MISSING: ingest-to-memory.sh"
test -f container/skills/memory-reflect/SKILL.md || echo "MISSING: memory-reflect skill"
test -f container/skills/memory-housekeeping/SKILL.md || echo "MISSING: memory-housekeeping skill"
grep -q "COG_MEMORY_PATH" src/config.ts || echo "MISSING: COG_MEMORY_PATH in config.ts"
```

If any are missing, stop and instruct the user to run `/update-nanoclaw` first to pull in the Cog integration.

## Phase 3: Scaffold the Memory Vault

Create the vault directory structure and seed files. All files must start with an L0 comment summary.

```bash
mkdir -p vault/memory/personal/threads \
         vault/memory/work/nanoclaw/threads \
         vault/memory/cog-meta/scenarios \
         vault/memory/glacier
```

**Files to create** (only if they don't already exist):

- `vault/memory/CONVENTIONS.md` — the memory rules (see this skill's sibling file if needed)
- `vault/memory/hot-memory.md` — cross-domain top-level
- `vault/memory/personal/hot-memory.md`
- `vault/memory/personal/observations.md`
- `vault/memory/personal/action-items.md`
- `vault/memory/personal/entities.md`
- `vault/memory/work/nanoclaw/hot-memory.md`
- `vault/memory/work/nanoclaw/observations.md`
- `vault/memory/work/nanoclaw/action-items.md`
- `vault/memory/work/nanoclaw/entities.md`
- `vault/memory/cog-meta/hot-memory.md`
- `vault/memory/cog-meta/self-observations.md`
- `vault/memory/cog-meta/patterns.md`
- `vault/memory/cog-meta/improvements.md`
- `vault/memory/glacier/index.md`

**Seed template for each file** (adjust the L0 summary per file):

```markdown
<!-- L0: <specific one-line summary, max 80 chars> -->
# <Domain> <Section>

<!-- Short comment explaining format/edit pattern -->
```

Ask the user for additional work domains: "Besides personal and the default nanoclaw dev work, any other active projects to scaffold? (e.g., `client-acme`, `myapp`, leave blank to skip)"

For each additional domain, repeat the scaffold under `vault/memory/work/<project>/`.

## Phase 4: Wire Container Skills + Mount

Container skills are already in `container/skills/memory-*/` from the code change. They get synced into each per-group `.claude/skills/` directory automatically by `src/container-runner.ts` when a container starts.

The mount is also automatic: `src/container-runner.ts` mounts `COG_MEMORY_PATH` → `/workspace/extra/memory` as read-write for every container.

Verify the mount works by rebuilding the container:

```bash
./container/build.sh
```

## Phase 5: QMD Collection

Update QMD's index config to include the memory collection:

```bash
# Check current config
cat ~/.config/qmd/index.yml
```

Ensure it contains a `memory` collection pointing at the absolute path of `vault/memory/`:

```yaml
memory:
  path: /absolute/path/to/vault/memory
  glob: "**/*.md"
```

Then rebuild the index:

```bash
qmd update
```

Expected: a line like `Indexed: N new ... in memory`.

## Phase 6: Optional Cron Setup

Ask the user: "Want me to install nightly cron entries for memory maintenance? These run /memory-reflect and /memory-housekeeping once a day, and /memory-evolve once a week."

If yes, add to `crontab -e` (show the user what to paste):

```
# NanoClaw memory maintenance (Cog-native)
0 3 * * * cd /path/to/nanoclaw && claude -p "Run the /memory-reflect skill against vault/memory/" >> logs/nightly-reflect.log 2>&1
30 3 * * * cd /path/to/nanoclaw && claude -p "Run the /memory-housekeeping skill against vault/memory/" >> logs/nightly-housekeeping.log 2>&1
0 4 * * 0 cd /path/to/nanoclaw && claude -p "Run the /memory-evolve skill against vault/memory/" >> logs/weekly-evolve.log 2>&1
```

Substitute `/path/to/nanoclaw` with the actual project path. Foresight is deliberately omitted from cron — it's more valuable as an on-demand nudge.

## Phase 7: Verify

End-to-end sanity check:

```bash
# 1. Scaffold exists and has L0 headers
find vault/memory -name "*.md" | xargs grep -l "<!-- L0:" | wc -l
# Expect: at least 14 files

# 2. Ingest dry-run
./scripts/ingest-to-memory.sh --dry-run
# Expect: a list (can be empty if nothing new)

# 3. QMD indexes the memory collection
qmd status | grep -A1 memory
# Expect: memory collection with N docs

# 4. Container builds
./container/build.sh
# Expect: clean build, smaller than before (no Python)

# 5. Agent can see the mount
# Start a chat, ask: "run ls /workspace/extra/memory"
# Expect: CONVENTIONS.md, hot-memory.md, personal/, work/, etc.

# 6. Agent can invoke /memory-reflect
# In chat: "run /memory-reflect"
# Expect: agent reads observations.md, notes no content, writes no-op debrief
```

## Phase 8: Summarize

Tell the user:
- Where memory lives: `vault/memory/`
- How to invoke skills: `/memory-reflect`, `/memory-housekeeping`, `/memory-evolve`, `/memory-foresight`, `/memory-history` from any chat
- How ingestion works: automatic after every session via `scripts/ingest-to-memory.sh`
- How maintenance runs: cron (if they installed it) or on-demand
- What's in Obsidian: open `vault/` as a vault — see both `workspace/` (freeform notes) and `memory/` (structured tiered memory)

## Rollback

If something breaks:

```bash
# Stop any running NanoClaw
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist 2>/dev/null || true

# Restore Alfred integration from git (if you want to fall back)
git checkout main -- src/config.ts src/container-runner.ts src/index.ts container/Dockerfile .env.example

# Remove the new vault/memory (IT HAS NO DATA YOU CAN'T RECREATE — IT'S A SCAFFOLD)
rm -rf vault/memory

# Rebuild container
./container/build.sh
```
