# Knowledge Stack

Architecture documentation for NanoClaw's knowledge and memory systems. This covers how all memory components work together to make the agent smarter over time.

## Overview

Four layers, each solving a different problem:

| Layer | Component | Purpose | Runs |
|-------|-----------|---------|------|
| **Capture (session)** | Auto-memory (Claude Code built-in) | Agent writes learnings to `MEMORY.md` during each session | During sessions |
| **Consolidate (session)** | Auto-dream (Claude Code built-in) | Background prune/reorganize of `MEMORY.md` between sessions | Between sessions |
| **Structure (persistent)** | Cog-native memory (`vault/memory/` + `/memory-*` skills) | Three-tier structured memory with observations, entities, actions, threads | On-demand + nightly cron |
| **Search (retrieval)** | QMD | Hybrid retrieval (BM25 + vector + LLM reranking) across all collections | On-demand via MCP |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUTS                                                             │
│                                                                     │
│  User work logs (Obsidian) ───┐                                     │
│  Conversation transcripts ────┼──→ scripts/ingest-to-memory.sh      │
│  Meeting notes ───────────────┘            │                        │
│                                            ▼                        │
│                               vault/memory/{domain}/observations.md │
│                               (one-line pointers, append-only)      │
│                                            │                        │
│                                            ▼                        │
│                               ┌────────────────────────┐            │
│                               │ Container skills       │            │
│                               │ /memory-reflect        │            │
│                               │ /memory-housekeeping   │            │
│                               │ /memory-evolve         │            │
│                               │ /memory-foresight      │            │
│                               │ /memory-history        │            │
│                               └──────────┬─────────────┘            │
│                                          │                          │
│                     ┌────────────────────┼─────────────────────┐    │
│                     ▼                    ▼                     ▼    │
│             hot-memory.md          patterns.md            threads/  │
│             (cross-domain)         (distilled rules)      (topics)  │
│                     │                    │                     │    │
│                     └──────────┬─────────┴─────────────────────┘    │
│                                ▼                                    │
│                          glacier/ (archived via housekeeping)       │
│                                                                     │
│                     ┌──────────┴──────────┐                         │
│                     ▼                      ▼                        │
│              ┌──────────┐          ┌──────────────┐                 │
│              │   QMD    │          │  Container   │                 │
│              │  Search  │◀─ query ─│  Agent       │                 │
│              │  (MCP)   │          │  (Claude)    │                 │
│              └──────────┘          │              │                 │
│                                    │  auto-memory │                 │
│                                    │  auto-dream  │                 │
│                                    └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Vault Structure

Everything lives in `vault/` at the project root (gitignored):

```
vault/
├── workspace/                  ← USER's space (Obsidian)
│   ├── work-logs/              ← Daily work logs, standups, wrapups
│   ├── notes/                  ← General notes, ideas, research
│   └── ...                     ← Organize however you want
│
└── memory/                     ← Cog-native structured memory
    ├── CONVENTIONS.md          ← The rules (read on session start)
    ├── hot-memory.md           ← Cross-domain top-level (<50 lines)
    ├── link-index.md           ← Backlink index (auto-generated)
    ├── personal/               ← Default domain
    │   ├── hot-memory.md
    │   ├── observations.md     ← Append-only event log
    │   ├── action-items.md
    │   ├── entities.md
    │   └── threads/            ← Raised topics (zettelkasten)
    ├── work/
    │   └── {project}/          ← One per active project
    │       ├── hot-memory.md
    │       ├── observations.md
    │       ├── action-items.md
    │       ├── entities.md
    │       └── threads/
    ├── glacier/                ← Archived data by domain
    │   └── index.md            ← Glacier catalog (auto-generated)
    └── cog-meta/               ← System-level memory
        ├── hot-memory.md
        ├── self-observations.md
        ├── patterns.md         ← Universal rules distilled from self-obs
        ├── improvements.md
        └── scenarios/
```

Obsidian opens `vault/` as the vault root. User writes freeform in `workspace/`, browses the structured graph in `memory/`.

## Data Flow

### After each agent session

```
1. Agent session ends (container exits)
2. NanoClaw post-session hook fires (src/index.ts runPostSessionHooks)
3. scripts/ingest-to-memory.sh runs:
   a. Scans groups/*/conversations/ for new transcripts
   b. Scans vault/workspace/ for new/modified markdown files
   c. Classifies each into a domain (personal / work/{project})
   d. Appends a one-line observation (pointer + snippet) to that domain's
      observations.md with a [[wiki-link]] back to the source file
   e. Tracks processed files in data/ingest-memory.state
4. qmd update runs (incremental):
   a. Detects new/changed files across all collections
   b. Re-indexes workspace + memory + conversations + group-memory
5. Next session: agent has fresh data
```

### Inside a session

```
1. Session starts → Claude Code loads MEMORY.md into system prompt (auto-memory)
2. Agent has container skills: knowledge-search (QMD) + memory-* (Cog skills)
3. User asks about past work:
   a. Agent runs QMD query first (best for fuzzy multi-word queries)
   b. Falls back to grep over vault/memory/ for exact matches
   c. For chronological reconstruction, invokes /memory-history skill
4. Agent learns something → writes to MEMORY.md (auto-memory)
5. User asks "reflect on last week" → agent invokes /memory-reflect skill
6. Session ends → ingest-to-memory.sh → qmd update
```

### Maintenance (cron or on-demand)

```
Nightly:
  /memory-reflect     — mine observations, distill patterns, detect threads
  /memory-housekeeping — archive stale data, prune hot-memory, rebuild indexes

Weekly:
  /memory-evolve      — audit memory architecture, propose rule changes

On-demand:
  /memory-foresight   — one cross-domain strategic nudge
  /memory-history     — deep search across all memory files
```

## Component Details

### Auto-memory (Claude Code built-in)

- **What:** Agent writes facts and learnings to `MEMORY.md` during sessions
- **Where:** `data/sessions/{group}/.claude/projects/-workspace-group/memory/MEMORY.md`
- **Config:** `CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0'` in container settings.json
- **Loaded:** First 200 lines injected into system prompt at session start

### Auto-dream (Claude Code built-in)

- **What:** Background consolidation of memory between sessions — prunes stale entries, resolves contradictions, reorganizes files
- **Config:** `autoDreamEnabled: true` in container settings.json
- **Runs:** Automatically between sessions (no manual trigger needed)

### Cog-native memory (vault/memory/)

- **What:** Three-tier structured memory (hot / warm / glacier) + Zettelkasten threads + L0/L1/L2 tiered loading. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).
- **Conventions:** `vault/memory/CONVENTIONS.md` — the canonical rulebook, read at session start
- **Config:** `COG_MEMORY_PATH` in `.env` (defaults to `vault/memory/` at project root)
- **Container mount:** `/workspace/extra/memory` (read-write)
- **Container skills:** `container/skills/memory-{reflect,housekeeping,evolve,foresight,history}/`
- **Ingestion script:** `scripts/ingest-to-memory.sh`
- **Zero runtime:** no Python, no daemon, no pip packages. Everything is markdown + container skill prompts.

### QMD (knowledge search)

- **What:** Hybrid search engine — BM25 + vector + LLM reranking, all local
- **Repo:** [tobi/qmd](https://github.com/tobi/qmd) (npm: `@tobilu/qmd`)
- **Config:** `QMD_MCP_PORT` in `.env`
- **Container skill:** `container/skills/knowledge-search/SKILL.md`
- **Setup skill:** `.claude/skills/add-knowledge-search/SKILL.md`
- **Integration:** Host-side HTTP MCP server, containers connect via bridge network
- **Collections:** `workspace` (Obsidian), `memory` (Cog), `conversations` (session archives), `group-memory` (per-group CLAUDE.md)

### Ingestion pipeline

- **Script:** `scripts/ingest-to-memory.sh`
- **Sources:** conversation archives + workspace files
- **State:** `data/ingest-memory.state` (tracks processed files)
- **Trigger:** Automatic after each agent session (post-session hook in `src/index.ts`)
- **Domain routing:** Workspace files under `work/{project}/` go to `memory/work/{project}/`; everything else lands in `memory/personal/`
- **Flags:** `--dry-run`, `--conversations`, `--workspace`, `--reset`

## Key Files

| File | Purpose |
|------|---------|
| `vault/memory/CONVENTIONS.md` | The memory rules (L0, SSOT, threads, glacier) |
| `src/index.ts` | Post-session hook: runs ingestion + QMD re-index |
| `src/container-runner.ts` | Injects QMD MCP + mounts `vault/memory/` at `/workspace/extra/memory` |
| `src/config.ts` | Reads `COG_MEMORY_PATH` and `QMD_MCP_PORT` from `.env` |
| `scripts/ingest-to-memory.sh` | Appends new conversations + workspace files to domain observations |
| `container/skills/memory-reflect/SKILL.md` | Mine observations, distill patterns |
| `container/skills/memory-housekeeping/SKILL.md` | Archive, prune, rebuild indexes |
| `container/skills/memory-evolve/SKILL.md` | Audit memory architecture, propose rules |
| `container/skills/memory-foresight/SKILL.md` | Cross-domain nudge |
| `container/skills/memory-history/SKILL.md` | Deep multi-file search |
| `container/skills/knowledge-search/SKILL.md` | Teaches agent to use QMD MCP tools |
| `vault/workspace/` | User's Obsidian freeform workspace |
| `vault/memory/` | Cog-native structured memory |
| `data/ingest-memory.state` | Tracks which files have been ingested |

## Debugging

### Post-session hook not running

```bash
grep -E "Memory ingestion|QMD.*update" logs/nanoclaw.log
```

### Ingestion not finding files

```bash
./scripts/ingest-to-memory.sh --dry-run    # shows what would be ingested
./scripts/ingest-to-memory.sh --reset      # clear state, re-process everything
```

### QMD not reachable from container

```bash
curl http://localhost:8181/mcp
cat data/sessions/discord_main/.claude/settings.json | grep -A2 qmd
grep QMD_MCP_PORT .env
```

### Memory skills not available in container

```bash
ls container/skills/memory-*/SKILL.md
# Then rebuild container:
./container/build.sh
# And check per-group skills are synced:
ls data/sessions/discord_main/.claude/skills/memory-*/
```

### Agent can't find knowledge

1. Check QMD index: `qmd status` — all collections should show counts
2. Check QMD search: `qmd search "test" -c memory`
3. Check memory vault: `find vault/memory -name "*.md" | head`
4. Check ingestion state: `cat data/ingest-memory.state`
5. Check L0 headers: `grep -l "<!-- L0:" vault/memory/**/*.md`

## Design Decisions

### Why four layers (not one big thing)

Each layer solves a different problem:
- **Auto-memory** handles in-session recall ("what did the user just tell me")
- **Auto-dream** handles between-session consolidation ("which of yesterday's facts are still relevant")
- **Cog memory** handles across-session persistent structured knowledge ("what decisions, tasks, entities accumulate over weeks/months")
- **QMD** handles retrieval across all of the above plus raw workspace notes ("given a query, find the relevant files")

No single layer can do all four jobs well.

### Why Cog-native (and not Alfred)

NanoClaw used to integrate [Alfred](https://github.com/ssdavidai/alfred) as its structured-memory layer. Alfred is a Python daemon with typed record types (22 categories) maintained by background workers (Curator/Janitor/Distiller/Surveyor).

We replaced it with Cog-style conventions in April 2026 because:

1. **Zero runtime.** Cog is pure markdown + slash-command prompts. No Python, no pip package, no version pinning, no daemon lifecycle. The entire maintenance surface is a single CONVENTIONS.md file and five container skill prompts.
2. **Debuggability.** You can `cat` any memory file and see exactly what's in it. No opaque state files, no daemon-running-on-broken-config failure modes.
3. **Maintainability compounds.** Every future rule change is a markdown edit, not a Python+pip+test+deploy cycle.
4. **Native alignment.** NanoClaw's existing memory (per-group `CLAUDE.md`, session archives, workspace directory) was already Cog-shaped. Dropping Alfred let the native structure breathe.
5. **Self-modifying by design.** Cog's `/memory-evolve` skill audits the rules themselves — customization is the intended use case, not a risk.

The tradeoff: we lost Alfred's typed programmatic queries (`alfred vault list task --status=open`). For a personal assistant where NanoClaw's TypeScript code doesn't query the memory programmatically — only the agent does, via grep + QMD — this was an acceptable loss.

See [COG-MEMORY.md](COG-MEMORY.md) for the architecture deep-dive.

### Why vault/ inside the project (not external)

- Keeps everything together — one `git clone` gets the full system
- gitignored so vault data doesn't bloat the repo
- Survives NanoClaw updates (gitignore protects it from merges)
- Backup is a directory copy

### Why post-session hook (not cron)

- Tied to the natural workflow: session ends → new knowledge available
- No configuration needed — works immediately after setup
- No stale window — knowledge is indexed before the next session starts
- Idempotent — safe to run on every session even with no new content

### Why auto-dream enabled

Claude Code's auto-dream consolidates auto-memory between sessions — reviewing, pruning, and reorganizing entries. Without it, `MEMORY.md` grows unbounded and fills with stale or contradictory entries. Auto-dream keeps the flat session memory clean while Cog's `/memory-reflect` handles the structured persistent memory.
