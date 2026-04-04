# Epistemic Memory Integration

Architecture and build documentation for the epistemic memory integration (`skill/epistemic-memory` branch).

## Overview

[Epistemic Memory](https://github.com/rodspeed/epistemic-memory) is a protocol for AI systems to maintain weighted, decaying, self-correcting beliefs about a user — instead of flat facts. This integration brings the protocol into NanoClaw container agents as container skills.

Unlike the Alfred integration (which required Dockerfile changes, Python runtime, env vars, and mount security), epistemic memory is **pure files** — no code changes to the NanoClaw host. The entire integration lives in container skills and a sync script.

## Architecture

```
HOST
├── NanoClaw (Node.js)
│   ├── container-runner.ts ← syncs skills into container at startup
│   └── groups/{name}/memory/epistemic/ ← persistent belief storage per group
│
└── Container (ephemeral, per-request)
    ├── /home/node/.claude/skills/epistemic-memory/SKILL.md ← protocol rules
    ├── /home/node/.claude/skills/epistemic-memory-mirror/SKILL.md ← /mirror modes
    └── /workspace/group/memory/epistemic/ ← group mount (persistent)
        ├── profile.md           ← beliefs with per-belief metadata
        ├── tensions.md          ← contradiction log
        ├── session-counter.json ← periodic review trigger
        └── INDEX.md             ← profile index
```

## How It Works

### Belief accumulation (automatic)

```
User sends a message
  → NanoClaw spawns container with group mount + skills
  → Agent reads epistemic-memory skill, learns the protocol
  → Agent increments session counter in /workspace/group/memory/epistemic/
  → During conversation, agent observes profile-relevant signals
  → Agent updates beliefs: confidence adjustments, new entries, challenge logs
  → Container exits, beliefs persist in groups/{name}/memory/epistemic/
```

### /mirror inspection (user-triggered)

```
User sends "/mirror"
  → Agent reads epistemic-memory-mirror skill
  → Agent loads all beliefs from /workspace/group/memory/epistemic/
  → Agent applies dormancy decay (exponential, permanence-dependent)
  → Agent generates a prose portrait of the user
  → Agent identifies gaps, contradictions, and the one thing it'd ask
```

### Periodic review (every 10 sessions)

```
Session counter reaches next_review_at threshold
  → Agent applies dormancy decay to all beliefs
  → Agent gut-checks highest/lowest confidence beliefs with user
  → Agent updates stale beliefs, resolves or logs tensions
  → Agent sets next_review_at = count + 10
```

## File Inventory

### On `skill/epistemic-memory` branch

| File | Type | Purpose |
|------|------|---------|
| `container/skills/epistemic-memory/SKILL.md` | New | Container skill: belief protocol, metadata format, confidence scale, decay rules, update rules, session counter |
| `container/skills/epistemic-memory-mirror/SKILL.md` | New | Container skill: /mirror modes (portrait, audit, gut-check, interview) |
| `.claude/skills/add-epistemic-memory/SKILL.md` | New | Feature skill: interactive installer with 4 phases |
| `scripts/sync-epistemic-memory.sh` | New | Update script: pulls latest upstream, regenerates container skills |
| `.epistemic-memory-version` | New | Tracks upstream commit hash for update detection |
| `docs/EPISTEMIC-MEMORY-INTEGRATION.md` | New | This file |
| `scripts/check-external-updates.sh` | New | Unified checker for all external skill deps (epistemic-memory, alfred) |
| `.claude/skills/update-skills/SKILL.md` | Modified | Added Step 5: external dependency check after skill branch updates |
| `docs/skills-as-branches.md` | Modified | Added to skill branch table |

### Inside container (at runtime)

| Path | Purpose |
|------|---------|
| `/home/node/.claude/skills/epistemic-memory/SKILL.md` | Protocol rules (synced from `container/skills/` at startup) |
| `/home/node/.claude/skills/epistemic-memory-mirror/SKILL.md` | Mirror modes (synced at startup) |
| `/workspace/group/memory/epistemic/profile.md` | Persistent beliefs (via group mount) |
| `/workspace/group/memory/epistemic/tensions.md` | Contradiction log (via group mount) |
| `/workspace/group/memory/epistemic/session-counter.json` | Review trigger (via group mount) |

### Per-group on host (created during setup or auto-initialized)

| Path | Purpose |
|------|---------|
| `groups/{name}/memory/epistemic/profile.md` | User beliefs |
| `groups/{name}/memory/epistemic/tensions.md` | Tensions log |
| `groups/{name}/memory/epistemic/session-counter.json` | Session counter |
| `groups/{name}/memory/epistemic/INDEX.md` | Profile index |

## Integration Boundary

### What we depend on (stable)

- **Belief metadata format** — `conf:N | first:DATE | confirmed:DATE | challenged:DATE | perm:CLASS` inline in backticks after each `##` heading. This is the core data format.
- **Confidence scale** — 5 tiers: Factual (0.9--1.0), Established (0.7--0.8), Developing (0.5--0.6), Tentative (0.3--0.4), Speculative (0.0--0.2).
- **Permanence classes** — stable, durable, situational, unknown.
- **Dormancy decay formula** — `effective_conf = conf * e^(-lambda * days)` with permanence-dependent lambda.
- **Session counter schema** — `{count, last_session, last_review, next_review_at}`.
- **Tensions log format** — dated entries with belief affected, what happened, status, interpretation.
- **Mirror modes** — portrait, audit, gut-check, interview.

### What we don't depend on

- File paths within the upstream repo (we regenerate container skills from content)
- The upstream CLAUDE.md instructions (we use container skills instead)
- Any future code additions to the upstream repo (we only use the protocol)

## Update Mechanism

Two layers handle upstream updates:

### Layer 1: Sync script

`scripts/sync-epistemic-memory.sh` pulls the latest from GitHub and regenerates container skills:

```bash
./scripts/sync-epistemic-memory.sh           # interactive
./scripts/sync-epistemic-memory.sh --check   # version check only
./scripts/sync-epistemic-memory.sh --yes     # non-interactive
```

Steps:
1. Reads local commit hash from `.epistemic-memory-version`
2. Clones/pulls `rodspeed/epistemic-memory` to `/tmp/epistemic-memory-sync`
3. Compares commit hashes
4. Regenerates `container/skills/epistemic-memory/SKILL.md` from upstream protocol
5. Regenerates `container/skills/epistemic-memory-mirror/SKILL.md` from upstream mirror skill
6. Updates `.epistemic-memory-version`
7. Copies updated skills to existing group sessions under `data/sessions/`

### Layer 2: Unified update check

`scripts/check-external-updates.sh` checks all external skill dependencies in one go:

```bash
./scripts/check-external-updates.sh          # human-readable
./scripts/check-external-updates.sh --json   # machine-readable
```

It checks epistemic-memory (git commit hash) and alfred (pip version) if installed. Exit code = number of updates available (0 = all up to date).

This is integrated into `/update-skills` as Step 5 — after checking skill branches, it automatically checks external deps and offers to apply updates.

### Layer 3: Staleness warning (in-container)

The container skill instructs the agent to check the age of `.epistemic-memory-version` at session start. If it's been 30+ days since the last sync, the agent mentions it once — a passive nudge, not a blocker.

### Layer 4: Git commit tracking

The `.epistemic-memory-version` file stores the upstream commit hash. This is simpler than Alfred's pip version tracking because there's no package manager — the upstream is just a git repo with files.

### What survives updates without action

| Upstream changes | Impact |
|---|---|
| Protocol wording changes | Zero until sync — agents use our container skill, not upstream files |
| New mirror modes | Zero until sync — mirror skill is regenerated from upstream |
| New file types in upstream | Zero — we only read the files we know about |
| Structural reorganization | May require sync script update if file paths change |

### What requires action

| Change | Action |
|---|---|
| New upstream commit | Run `./scripts/sync-epistemic-memory.sh` |
| Breaking format change (belief metadata) | Update container skill manually |
| New files we should incorporate | Update sync script to read them |

## Design Decisions

### Why container skills (not host code changes)

The epistemic memory protocol is pure instructions — it tells the AI how to read, write, and maintain belief files. No CLI, no Python, no system dependencies. Container skills are the perfect fit:

- Zero Dockerfile changes (no runtime to install)
- Zero config.ts changes (no env vars to forward)
- Zero container-runner.ts changes (no special mount logic)
- Skills are synced automatically at container startup (line 144-154 of container-runner.ts)

### Why per-group storage (not global)

NanoClaw's core design principle is group isolation. Each group has its own filesystem, memory, and sessions. Epistemic memory follows the same pattern:

- Different groups may represent different contexts (work, personal, family)
- Belief confidence is context-dependent (user may behave differently in different groups)
- No cross-group information leakage

### Why a sync script (not direct file copy)

The upstream repo's file structure doesn't map 1:1 to NanoClaw's container skill format. The sync script:

- Strips YAML frontmatter from upstream Markdown
- Rewrites storage paths (`memory/user/` → `/workspace/group/memory/epistemic/`)
- Adds the NanoClaw-specific "Quick Reference" header
- Stamps the version tag
- Handles the structural differences if upstream reorganizes

### Why not an MCP server

The epistemic memory protocol is stateless read/write to Markdown files. The container agent already has filesystem access. Adding an MCP server would add complexity for zero benefit:

- No computation beyond what the LLM does (decay is applied at read-time by the agent)
- No external data sources to query
- No coordination between multiple processes

## Comparison with Alfred Integration

| Aspect | Alfred | Epistemic Memory |
|--------|--------|-----------------|
| Nature | External daemon + CLI | Protocol (files only) |
| Dockerfile | New RUN layer (Python, venv, pip) | None |
| config.ts | New env var export | None |
| container-runner.ts | New env forwarding block | None |
| .env.example | New placeholder | None |
| Mount security | Allowlist for vault path | Uses existing group mount |
| Update mechanism | pip upgrade + schema sync | git pull + file regeneration |
| Runtime dependency | Python 3 + alfred-vault package | None |
| Branch weight | ~6 modified files + ~4 new files | 0 modified host files + ~5 new files |
| Conflict risk | Low (tagged, isolated) | Minimal (only touches skill branch table) |

## Surviving NanoClaw Updates

This integration has the **lowest conflict risk** of any feature skill because it modifies only one existing file (skill branch table) and creates only new files.

| File | Strategy | Risk |
|------|----------|------|
| `docs/skills-as-branches.md` | Appended row to table | Minimal — same as every other skill |
| All other files | New files | None — new files never conflict |
