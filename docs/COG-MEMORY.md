# Cog-Native Memory — Architecture Deep-Dive

NanoClaw's structured memory layer is adapted from [marciopuga/cog](https://github.com/marciopuga/cog). This document explains how Cog's conventions map onto NanoClaw's filesystem, how each maintenance skill works, and how to customize the rules.

## What Cog Is (and Isn't)

**Cog is a set of conventions, not code.** The original project ships:
- A `CLAUDE.md` file defining how memory is structured and maintained
- A `.claude/commands/` directory of slash-command prompts that tell Claude what to do during each maintenance phase
- A seed `memory/` directory that grows from conversations

That's the whole thing. No Python, no daemon, no pip package. The "workers" are prompts Claude reads when you type a slash command.

NanoClaw adapts this model by:
1. Putting the conventions in `vault/memory/CONVENTIONS.md`
2. Putting the slash-command prompts in `container/skills/memory-*/SKILL.md`
3. Creating the seed `vault/memory/` directory during `/add-cog-memory`
4. Adding a post-session hook that runs `scripts/ingest-to-memory.sh` to append new observations automatically

## Three-Tier Memory Model

```
Hot                  — Loaded every conversation, <50 lines each, rewrite freely
Warm (domain files)  — Loaded when a domain skill activates, per-file size limits
Glacier              — YAML-frontmattered archives, indexed via glacier/index.md
```

Each tier has a rule for when content moves:

| Rule | Trigger | Result |
|---|---|---|
| Pattern heating up | 3+ observations on same theme | Distill into `patterns.md` (via `/memory-reflect`) |
| Pattern cooling off | No references in 2+ weeks | Remove from `hot-memory.md` (via `/memory-reflect`) |
| File getting bloated | `observations.md` >50 entries | Archive oldest by tag (via `/memory-housekeeping`) |
| Entity going dormant | `last:` date >6 months ago | Move to `entities-inactive.md` glacier |
| Topic recurring | Topic in 3+ observations across 2+ weeks | Suggest raising a thread (via `/memory-reflect`) |

## Directory Map

```
vault/memory/
├── CONVENTIONS.md            # Rules (read at session start)
├── hot-memory.md             # Cross-domain top-level, <50 lines
├── link-index.md             # Auto-generated backlink index
├── personal/                 # Default domain
│   ├── hot-memory.md
│   ├── observations.md       # Append-only event log
│   ├── action-items.md
│   ├── entities.md
│   └── threads/              # Raised topics
├── work/
│   └── {project}/            # One per active project
│       ├── hot-memory.md
│       ├── observations.md
│       ├── action-items.md
│       ├── entities.md
│       └── threads/
├── glacier/                  # Archived data by domain
│   ├── index.md              # Auto-generated catalog
│   └── {domain}/
│       └── {archive-files}.md
└── cog-meta/                 # System-level memory
    ├── hot-memory.md
    ├── self-observations.md  # What worked/didn't (agent's self-log)
    ├── patterns.md           # Universal rules distilled from self-obs
    ├── improvements.md
    └── scenarios/
```

## L0 / L1 / L2 Progressive Loading

Every memory file starts with an L0 summary on line 1:

```markdown
<!-- L0: one-line summary, max 80 chars -->
# File Title
```

When deciding whether to read a file, the agent runs three passes in order:

1. **L0** — grep for `<!-- L0:` across a domain, get all summaries in one call, decide which files matter
2. **L1** — for files that matter but are >80 lines, scan section headers (`## ...`) first
3. **L2** — read the full file or section only when needed

This protocol is cheap to implement, keeps context window usage small, and scales with vault size. Hot-memory files skip L0/L1 because they're always small by design.

## The Five Memory Skills

Each container skill is a SKILL.md prompt Claude reads and executes. They're wired into the agent via `container/skills/` and synced into per-group `.claude/skills/` by `src/container-runner.ts` at container startup.

### `/memory-reflect`

**When:** User says "reflect", "what have you learned", or on nightly cron.

**Does:**
1. Reads recent session transcripts and recently-modified memory files
2. Looks for unresolved threads, broken promises, friction patterns, missed cues, memory gaps
3. Runs a consistency sweep (hot-memory vs canonical sources, cross-file fact checks, temporal validity)
4. Distills observation clusters (3+ on same theme) into `patterns.md`
5. Reviews hot-memory relevance (promote/demote)
6. Detects thread candidates (3+ observations across 2+ weeks)
7. Writes self-observations (cap: 5 per run)
8. Outputs a debrief listing every concrete action taken

**Doesn't:** touch `cog-meta/evolve-log.md` (that's `/memory-evolve`'s file).

### `/memory-housekeeping`

**When:** User says "housekeeping", "clean up memory", or on nightly cron.

**Does:**
1. Archives bloated files (observations >50, completed action items >10, improvements >10)
2. Prunes hot-memory files (target <50 lines) by rule priority: resolved → past → SSOT violations → stale → low-signal
3. Surfaces accountability (stale action items, dormant domains, health escalation)
4. Rebuilds `glacier/index.md` from YAML frontmatter in glacier files
5. Rebuilds `link-index.md` from `[[wiki-links]]` across all non-glacier files
6. Adds missing `<!-- L0: ... -->` headers
7. Enforces entity registry format (3-line max per entry)
8. Adds ~~strikethrough~~ to `(until YYYY-MM)` markers with past dates

**Doesn't:** edit content meaning. Only structural rules.

### `/memory-evolve`

**When:** User says "evolve", "audit yourself", or on weekly cron.

**Does:**
1. Reads `cog-meta/evolve-log.md` for continuity
2. Runs `git diff` to see what housekeeping and reflect actually did in recent runs
3. Audits tier design, condensation pipeline, file organization, skill boundaries
4. Measures scorecard metrics (patterns.md line count vs 70-line cap, entity compression ratio, etc.)
5. Proposes rule changes — applies low-risk directly, routes high-risk to user review
6. Routes content issues back to `/memory-reflect` or `/memory-housekeeping`
7. Updates `evolve-log.md` with run number, findings, and next-run priorities

**Doesn't:** touch memory content. Only the rules that govern content movement.

### `/memory-foresight`

**When:** User says "foresight", "what should I be thinking about", or on daily morning cron.

**Does:**
1. Reads broadly across all domain hot-memories, action items, entities, calendar, threads
2. Scans for cross-domain convergence (topics/people appearing in 2+ domains)
3. Classifies action items by velocity (accelerating/cruising/stalling/dormant)
4. Projects patterns forward 2-4 weeks
5. Writes **one** nudge to `cog-meta/foresight-nudge.md`: Signal / Insight / Suggested Action, citing ≥2 sources

**Doesn't:** write anywhere except `foresight-nudge.md`. One nudge per run. Never a list.

### `/memory-history`

**When:** User says "what did I say about...", "when did we discuss...", or asks for a chronological recall.

**Does:**
1. Tries QMD query first (hybrid search is usually better)
2. Falls back to grep for exact matches
3. Extracts relevant passages from top 3-5 files
4. Synthesizes a chronological answer with dates and citations

**Doesn't:** write to memory. Read-only recall.

## Thread Framework (Zettelkasten Layer)

Threads are **read-optimized synthesis files**. While observations capture raw events (write-optimized), threads pull related fragments into a coherent narrative. One file per topic, consistent spine:

- **Current State** — what's true right now (rewrite freely, always current)
- **Timeline** — dated entries, append-only, full detail preserved
- **Insights** — learnings, patterns, what's different this time

A thread gets raised when:
- A topic appears in 3+ observations across 2+ weeks, OR
- The user explicitly says "raise X" or "thread X"

Threads live in `{domain}/threads/{topic-slug}.md`. Example: `personal/threads/running.md`, `work/nanoclaw/threads/memory-architecture.md`.

Rules:
- **One file forever.** Threads grow long; they don't split or condense.
- **Texture is the value.** Every timeline entry keeps its full detail, quotes, and dates.
- **Fragments never move.** The observations that seeded the thread stay in place; the thread references them via `[[wiki-links]]`.
- **Current State is always current.** Rewrite it freely as things change.

## How Maintenance Runs

### Synchronous (after each session)

`src/index.ts:471 runPostSessionHooks()` fires after every successful session:

```
ingest-to-memory.sh (appends observations)
      ↓
qmd update (re-indexes all collections)
```

Fire-and-forget — doesn't block the user's reply. New observations are ready for the next session.

### Scheduled (cron, optional)

```cron
# Nightly
0 3 * * * cd /path/to/nanoclaw && claude -p "Run the /memory-reflect skill against vault/memory/" >> logs/nightly-reflect.log 2>&1
30 3 * * * cd /path/to/nanoclaw && claude -p "Run the /memory-housekeeping skill against vault/memory/" >> logs/nightly-housekeeping.log 2>&1

# Weekly (Sundays at 4am)
0 4 * * 0 cd /path/to/nanoclaw && claude -p "Run the /memory-evolve skill against vault/memory/" >> logs/weekly-evolve.log 2>&1
```

Foresight is deliberately omitted from cron — it's more valuable as an on-demand ask.

### On-Demand (in any chat)

Any memory skill can be invoked mid-conversation. The user just asks for it:

- "reflect on last week" → `/memory-reflect`
- "clean up memory" → `/memory-housekeeping`
- "audit yourself" → `/memory-evolve`
- "what should I be thinking about" → `/memory-foresight`
- "what did I say about X last month" → `/memory-history`

## Customizing the Rules

The entire memory system lives in editable files:

| File | What to edit |
|---|---|
| `vault/memory/CONVENTIONS.md` | Core rules — file edit patterns, L0/L1/L2, SSOT rules, glacier thresholds |
| `container/skills/memory-reflect/SKILL.md` | What `/memory-reflect` does, step by step |
| `container/skills/memory-housekeeping/SKILL.md` | What `/memory-housekeeping` does |
| `container/skills/memory-evolve/SKILL.md` | What `/memory-evolve` does |
| `container/skills/memory-foresight/SKILL.md` | What `/memory-foresight` does |
| `container/skills/memory-history/SKILL.md` | What `/memory-history` does |

After editing any of these, rebuild the container image:

```bash
./container/build.sh
```

The `/memory-evolve` skill is designed to propose edits to these files itself. Its job is to audit the rules, notice where they're failing, and suggest (or directly apply) rule changes. That's Cog's self-modification pattern: the system designs its own rules over time, under your review.

## Upgrade Path

Because Cog's upstream is a set of conventions (not a pip package), upgrades are a manual but simple merge:

1. Fetch the latest `marciopuga/cog` `.claude/commands/*.md` and `CLAUDE.md`
2. Diff against your current `container/skills/memory-*/SKILL.md` and `vault/memory/CONVENTIONS.md`
3. Cherry-pick new rules or behaviors you want
4. Adapt any path references from Cog's `memory/` to NanoClaw's `vault/memory/`

There is no dependency version to pin. There is no runtime to upgrade. A "new version" of Cog is just a new set of ideas about how memory should work, and you choose which ones to adopt.

## Why Cog (not Alfred)

NanoClaw used Alfred for structured memory before April 2026. Alfred is a Python daemon with 22 typed record types maintained by background workers.

We replaced it with Cog because:

1. **Zero runtime.** Alfred required a continuously-running Python daemon, a pip package to maintain, a config schema that could silently break (and did — the daemon was running on ignored defaults for an unknown amount of time), and a whole orchestration layer. Cog has none of that.
2. **Debuggability.** You can `cat` any Cog memory file and see exactly what's in it. Alfred's state was scattered across JSON files in opaque data directories.
3. **Self-modification.** Cog's `/memory-evolve` skill audits the rules themselves and proposes changes. Alfred's rules were baked into Python code — customization required forking.
4. **Native alignment.** NanoClaw's existing memory (per-group `CLAUDE.md`, session archives, workspace directory) was already Cog-shaped. Alfred added a parallel typed-graph world that didn't share anything with the rest of the system.
5. **Maintainability compounds.** Every future rule change is a markdown edit, not a Python+pip+test+deploy cycle.

The tradeoff: we lost Alfred's typed programmatic queries (`alfred vault list task --status=open`). For a personal assistant where NanoClaw's TypeScript code doesn't query the memory programmatically — only the agent does, via grep + QMD — this was an acceptable loss.

See [KNOWLEDGE-STACK.md](KNOWLEDGE-STACK.md) for the higher-level architecture view.
