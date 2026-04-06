# Knowledge Stack

Architecture documentation for NanoClaw's knowledge and memory systems. This covers how all memory components work together to make the agent smarter over time.

## Overview

Five layers, each solving a different problem:

| Layer | Component | Purpose | Runs |
|-------|-----------|---------|------|
| **Capture** | Auto-memory | Agent writes learnings to MEMORY.md during sessions | During sessions |
| **Consolidate** | Auto-dream | Background review/prune/reorganize of memory | Between sessions |
| **Process** | Alfred | Converts raw inputs into structured knowledge records | Daemon (continuous) |
| **Search** | QMD | Hybrid retrieval across all knowledge (BM25 + vector + LLM reranking) | Host MCP service |
| **Believe** | Epistemic memory | Weighted, decaying beliefs about the user specifically | During sessions |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUTS                                                             │
│                                                                     │
│  User work logs (Obsidian) ───┐                                     │
│  Conversation transcripts ────┤──→ vault/knowledge/inbox/           │
│  Meeting notes ───────────────┘         │                           │
│                                         ▼                           │
│                              ┌─────────────────────┐                │
│                              │  ALFRED DAEMON       │                │
│                              │                      │                │
│                              │  Curator ─→ extract  │                │
│                              │  Distiller ─→ reason │                │
│                              │  Janitor ─→ clean    │                │
│                              │  Surveyor ─→ cluster │                │
│                              └──────────┬──────────┘                │
│                                         │                           │
│                                         ▼                           │
│                    vault/knowledge/ (structured records)             │
│                    vault/workspace/ (user's raw notes)               │
│                                         │                           │
│                              ┌──────────┴──────────┐                │
│                              ▼                      ▼                │
│                       ┌──────────┐          ┌──────────────┐        │
│                       │   QMD    │          │  Container   │        │
│                       │  Search  │◀─ query ─│  Agent       │        │
│                       │  (MCP)   │          │  (Claude)    │        │
│                       └──────────┘          │              │        │
│                                             │  auto-memory │        │
│                                             │  auto-dream  │        │
│                                             │  epistemic   │        │
│                                             └──────────────┘        │
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
├── knowledge/                  ← ALFRED's space (ALFRED_VAULT_PATH)
│   ├── inbox/                  ← All inputs land here for processing
│   ├── person/                 ← People (contacts, team members)
│   ├── project/                ← Projects (startup, side projects)
│   ├── task/                   ← Tasks with statuses
│   ├── decision/               ← Architectural/business decisions
│   ├── assumption/             ← Hypotheses and beliefs
│   ├── constraint/             ← Rules and boundaries
│   ├── contradiction/          ← Conflicting information
│   ├── synthesis/              ← Cross-cutting insights
│   ├── note/                   ← Processed notes
│   ├── conversation/           ← Conversation records
│   ├── session/                ← Session records
│   ├── event/                  ← Events and meetings
│   ├── org/                    ← Organizations
│   ├── process/                ← Procedures and workflows
│   ├── run/                    ← Process executions
│   ├── account/                ← Accounts and services
│   ├── asset/                  ← Assets and resources
│   ├── location/               ← Locations
│   └── input/                  ← Unprocessed items
```

Obsidian opens `vault/` as the vault root. User writes in `workspace/`, browses `knowledge/` for Alfred's structured records.

## Data Flow

### After each agent session

```
1. Agent session ends (container exits)
2. NanoClaw post-session hook fires (src/index.ts)
3. scripts/ingest-to-alfred.sh runs:
   a. Scans groups/*/conversations/ for new transcripts
   b. Scans vault/workspace/ for new/modified markdown files
   c. Copies new items to vault/knowledge/inbox/ with source frontmatter
   d. Tracks processed files in data/ingest-alfred.state
4. Alfred's Curator picks up inbox files (daemon, continuous):
   a. Reads content, invokes AI to extract entities
   b. Creates structured records (person, project, task, decision, etc.)
   c. Interlinks records with wikilinks
5. qmd update runs (incremental):
   a. Detects new/changed files across all collections
   b. Re-indexes with FTS5 + embeddings
6. Next session: agent has fresh knowledge via QMD search + Alfred vault access
```

### Inside a session

```
1. Session starts → auto-memory loaded from MEMORY.md (Claude Code)
2. Agent has container skills: knowledge-search (QMD) + vault-alfred
3. User asks about past work → agent uses QMD query tool → gets results
4. Agent needs structured data → uses alfred vault search/list/read
5. Agent learns something → writes to MEMORY.md (auto-memory)
6. Agent forms belief about user → writes to epistemic memory
7. Session ends → auto-dream consolidates memory (between sessions)
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

### Alfred (knowledge processing)

- **What:** Processes raw inputs into 20+ structured record types
- **Repo:** [ssdavidai/alfred](https://github.com/ssdavidai/alfred) (pip: `alfred-vault`)
- **Config:** `ALFRED_VAULT_PATH` in `.env`
- **Container skill:** `container/skills/vault-alfred/SKILL.md`
- **Setup skill:** `.claude/skills/add-alfred/SKILL.md`
- **Docs:** [ALFRED-INTEGRATION.md](ALFRED-INTEGRATION.md)

### QMD (knowledge search)

- **What:** Hybrid search engine — BM25 + vector + LLM reranking, all local
- **Repo:** [tobi/qmd](https://github.com/tobi/qmd) (npm: `@tobilu/qmd`)
- **Config:** `QMD_MCP_PORT` in `.env`
- **Container skill:** `container/skills/knowledge-search/SKILL.md`
- **Setup skill:** `.claude/skills/add-knowledge-search/SKILL.md`
- **Integration:** Host-side HTTP MCP server, containers connect via bridge network (same pattern as credential proxy)
- **Collections:** Obsidian vault, conversation archives, group memory, Alfred vault

### Epistemic memory (user beliefs)

- **What:** Weighted, decaying beliefs about the user (confidence scores, permanence classes)
- **Container skill:** `container/skills/epistemic-memory/SKILL.md`
- **Storage:** `groups/{name}/memory/epistemic/`
- **Docs:** [EPISTEMIC-MEMORY-INTEGRATION.md](EPISTEMIC-MEMORY-INTEGRATION.md)

### Ingestion pipeline

- **Script:** `scripts/ingest-to-alfred.sh`
- **Sources:** conversation archives + workspace files
- **State:** `data/ingest-alfred.state` (tracks processed files)
- **Trigger:** Automatic after each agent session (post-session hook in `src/index.ts`)
- **Flags:** `--dry-run`, `--conversations`, `--workspace`, `--reset`

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Post-session hook: runs ingestion + QMD re-index after each session |
| `src/container-runner.ts` | Injects QMD MCP + auto-dream config into container settings |
| `src/config.ts` | Reads `ALFRED_VAULT_PATH` and `QMD_MCP_PORT` from `.env` |
| `scripts/ingest-to-alfred.sh` | Feeds conversations + workspace files to Alfred inbox |
| `container/skills/knowledge-search/SKILL.md` | Teaches agent to use QMD MCP tools |
| `container/skills/vault-alfred/SKILL.md` | Teaches agent to use Alfred vault CLI |
| `container/skills/epistemic-memory/SKILL.md` | Epistemic memory protocol |
| `vault/workspace/` | User's Obsidian workspace |
| `vault/knowledge/` | Alfred's structured records (ALFRED_VAULT_PATH) |
| `data/ingest-alfred.state` | Tracks which files have been ingested |

## Updating Components

### Alfred

```bash
./scripts/update-alfred.sh           # interactive upgrade
./scripts/update-alfred.sh --check   # check for new version only
```

### QMD

```bash
npm update -g @tobilu/qmd
```

### Epistemic memory

```bash
./scripts/sync-epistemic-memory.sh   # pull upstream changes
```

### Container image (after any update)

```bash
./container/build.sh
```

## Debugging

### Post-session hook not running

Check NanoClaw logs for ingestion output:
```bash
grep -E "Alfred ingestion|QMD.*update" logs/nanoclaw.log
```

### Ingestion not finding files

```bash
./scripts/ingest-to-alfred.sh --dry-run    # shows what would be ingested
./scripts/ingest-to-alfred.sh --reset      # clear state, re-process everything
```

### QMD not reachable from container

```bash
# Check MCP server
curl http://localhost:8181/mcp

# Check container settings
cat data/sessions/discord_main/.claude/settings.json | grep -A2 qmd

# Check .env
grep QMD_MCP_PORT .env
```

### Alfred not processing inbox

```bash
alfred status                              # check daemon workers
ls vault/knowledge/inbox/                  # check files are landing
tail -f vault/knowledge/data/alfred-stderr.log  # daemon logs
```

### Agent can't find knowledge

1. Check QMD index: `qmd status`
2. Check QMD search: `qmd search "test"`
3. Check Alfred vault: `alfred vault context`
4. Check ingestion state: `cat data/ingest-alfred.state`

## Design Decisions

### Why two systems (Alfred + QMD) instead of one

Alfred and QMD solve different problems:
- **Alfred** = write layer. Processes raw text into structured records with types, statuses, and relationships. Background workers maintain the vault autonomously.
- **QMD** = read layer. Searches across ALL files (structured + raw) with production-grade hybrid retrieval (BM25 + vector + LLM reranking).

Alfred's built-in search is adequate for structured queries (`alfred vault list task`), but QMD's hybrid search is far better for fuzzy natural language queries ("what did we decide about pricing?").

### Why vault/ inside the project (not external)

- Keeps everything together — one `git clone` gets the full system
- gitignored so vault data doesn't bloat the repo
- Survives NanoClaw updates (gitignore protects it from merges)
- Backup is a directory copy

### Why post-session hook (not cron)

- Tied to the natural workflow: session ends → new knowledge available
- No configuration needed — works immediately after merge
- No stale window — knowledge is indexed before the next session starts
- Idempotent — safe to run on every session even with no new content

### Why auto-dream enabled

Claude Code's auto-dream consolidates auto-memory between sessions — reviewing, pruning, and reorganizing entries. Without it, MEMORY.md grows unbounded and fills with stale or contradictory entries. Auto-dream keeps the agent's flat memory clean while Alfred handles structured knowledge.

### Why memory-kernel was not adopted

[mainion-ai/memory-kernel](https://github.com/mainion-ai/memory-kernel) was evaluated and skipped. Alfred covers all of its use cases (typed records, decay via Janitor, event tracking, search) and adds autonomous background workers. memory-kernel would have been redundant.
