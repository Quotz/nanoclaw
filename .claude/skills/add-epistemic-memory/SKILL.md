---
name: add-epistemic-memory
description: Add epistemic memory to NanoClaw — weighted belief model of the user with confidence tracking, dormancy decay, and self-correction
triggers:
  - /add-epistemic-memory
  - epistemic memory
  - belief tracking
  - user profiling
---

# Add Epistemic Memory

Adds a weighted hypothesis model of the user to NanoClaw container agents. Beliefs carry confidence scores, temporal decay, contradiction tracking, and periodic self-auditing.

Based on [rodspeed/epistemic-memory](https://github.com/rodspeed/epistemic-memory).

## What You Get

- **Per-belief confidence** — every observation about the user is weighted (0.0--1.0) with earned confidence, not assumed
- **Dormancy decay** — beliefs fade over time if not reinforced, preventing stale certainty
- **Tensions log** — contradictions are recorded, not silently resolved
- **Periodic review** — every 10 sessions, the agent gut-checks its highest and lowest confidence beliefs with the user
- **`/mirror` skill** — portrait mode, audit dashboard, gut-check, and structured interview

## Prerequisites

- NanoClaw installed and working (run `/setup` first)
- At least one group registered

## Phase 1: Merge the Skill Branch

```bash
git fetch upstream skill/epistemic-memory
git merge upstream/skill/epistemic-memory
```

If there are conflicts, resolve them — the `[skill/epistemic-memory]` comments identify this skill's additions.

Build to verify:
```bash
npm run build
```

## Phase 2: Initialize Per-Group Belief Storage

For each group that should have epistemic memory, create the storage directory and seed files.

### Automatic initialization

The container skill handles this — when an agent starts and finds no files at `/workspace/group/memory/epistemic/`, it creates the initial structure. No manual setup needed.

### Manual initialization (optional)

To pre-seed a group's memory:

```bash
GROUP="main"  # or any group folder name
mkdir -p groups/$GROUP/memory/epistemic

# Empty profile
cat > groups/$GROUP/memory/epistemic/profile.md << 'EOF'
---
name: User Profile
description: Beliefs about the user with per-belief confidence metadata
type: user
---

# User Profile

*Beliefs will accumulate here as the agent learns about you through conversation.*
EOF

# Tensions log
cat > groups/$GROUP/memory/epistemic/tensions.md << 'EOF'
---
name: Tensions Log
description: Running record of contradictions, surprises, and challenges to user profile beliefs
type: user
---

# Tensions Log

Each entry records a moment where observed behavior or stated preference contradicted an existing belief. Default status is **unresolved**.

## Template

```
## YYYY-MM-DD — Short description

**Belief affected:** [which belief]
**What happened:** [what was observed or said]
**Status:** unresolved
**What this suggests:** [optional interpretation, held lightly]
```
EOF

# Session counter
cat > groups/$GROUP/memory/epistemic/session-counter.json << 'EOF'
{
  "count": 0,
  "last_session": null,
  "last_review": null,
  "next_review_at": 10
}
EOF

# Index
cat > groups/$GROUP/memory/epistemic/INDEX.md << 'EOF'
# User Profile Index

## Profile
- [Profile](profile.md) — identity, working style, drives, character traits

## Epistemological Infrastructure
- [Tensions Log](tensions.md) — running record of contradictions and surprises
- Session counter tracks periodic reviews (every 10 sessions)

All beliefs carry metadata: `conf` (0.0--1.0), `first`/`confirmed`/`challenged` dates, `perm` (stable/durable/situational/unknown).
EOF
```

## Phase 3: Verify

Test that the container skill is loaded:

1. Send a message to any registered group
2. The agent should read the epistemic-memory skill on startup
3. Check that `session-counter.json` gets incremented after the conversation

Test `/mirror`:
1. After a few conversations, send `/mirror` to the group
2. The agent should produce a prose portrait based on accumulated beliefs
3. Try `/mirror audit` for the epistemological dashboard

## Phase 4: Optional Enhancements

### Seed from existing group context

If the group already has a `CLAUDE.md` with information about the user, you can ask the agent:

> "Read the group CLAUDE.md and create initial epistemic memory beliefs from what you know about me. Start all beliefs at tentative confidence (0.3-0.4) since they haven't been directly confirmed yet."

### Enable for specific groups only

The epistemic memory activates for any group that has the `memory/epistemic/` directory. To disable it for a group, simply don't create the directory (or remove it).

### Customize decay rates

The default decay rates (stable ~2yr, durable ~5mo, situational ~6wk) are reasonable starting points. After using the system for a while, tune them based on how quickly your beliefs actually change. Edit the lambda values in the container skill.

## Updating

When the upstream [epistemic-memory](https://github.com/rodspeed/epistemic-memory) repo updates:

```bash
# Check for updates
./scripts/sync-epistemic-memory.sh --check

# Apply updates (interactive)
./scripts/sync-epistemic-memory.sh

# Apply updates (non-interactive)
./scripts/sync-epistemic-memory.sh --yes
```

The sync script:
1. Clones/pulls the latest upstream repo
2. Compares the commit hash against the local version
3. Regenerates container skills from the upstream protocol files
4. Copies updated skills to existing group sessions

## Troubleshooting

### Agent not following the protocol
- Check that container skills are synced: `ls data/sessions/*/. claude/skills/epistemic-memory/`
- The skill is copied at container startup — restart the container
- Verify the skill file exists: `cat container/skills/epistemic-memory/SKILL.md`

### Beliefs not persisting
- Beliefs are stored in `groups/{name}/memory/epistemic/` which persists via the group mount
- Check the directory exists: `ls groups/{name}/memory/epistemic/`
- Check file permissions — the container user needs write access

### Session counter not incrementing
- The agent must read and write `session-counter.json` at conversation start
- Check file contents: `cat groups/{name}/memory/epistemic/session-counter.json`
- If stuck at 0, the agent may not be loading the epistemic-memory skill

### /mirror not working
- The mirror skill is separate: check `container/skills/epistemic-memory-mirror/SKILL.md` exists
- The agent needs at least a few beliefs in `profile.md` before a portrait is meaningful
- Try `/mirror audit` first — it works even with a sparse profile
