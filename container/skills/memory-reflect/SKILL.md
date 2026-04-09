---
name: memory-reflect
description: Mine recent observations, detect patterns, condense into hot-memory, suggest thread candidates, log self-observations. Trigger when the user says "reflect", "what have you learned", "how can you improve", "review yourself", or asks for introspection.
---

# Memory Reflect

Use this skill for self-reflection and memory maintenance. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

**You have time and freedom.** This is a deep session — don't rush. Read broadly, cross-reference thoroughly, and ACT on what you find. You are not just observing — you are the maintainer of the knowledge base. Reorganize files, condense observations, archive stale data, fill gaps, fix contradictions. Leave things better than you found them.

**File boundaries — do NOT modify these files (owned by other pipeline steps):**
- `cog-meta/evolve-log.md` — owned by /memory-evolve
- `cog-meta/evolve-observations.md` — owned by /memory-evolve

If you spot issues in these files, note them in `self-observations.md` and evolve will pick them up.

## Vault Location

The memory vault is at `/workspace/extra/memory` inside the container (mounted from the host's `vault/memory/`). All paths below are relative to this root.

## Orientation (run FIRST, before any file reads)

```bash
cd /workspace/extra/memory

# What changed since last run? Focus here.
find . -type f -name "*.md" -mtime -1 | sort

# L0 summaries across all domains — quick routing
grep -rn "<!-- L0:" . --include="*.md" | grep -v glacier/ | sort

# Entry counts for files approaching archival threshold
grep -c "^- " cog-meta/self-observations.md personal/observations.md work/*/observations.md 2>/dev/null
```

Focus on recently-changed files. Skip files that haven't been modified.

## Memory Files (read these on activation)

- `cog-meta/reflect-cursor.md` (session path + ingestion cursor)
- `cog-meta/self-observations.md`
- `cog-meta/patterns.md`
- `cog-meta/improvements.md`
- `hot-memory.md`
- Each domain's `hot-memory.md`, `observations.md`, `action-items.md`

Reference as needed (read `domains.yml` to discover all active domains):
- All domain `observations.md` files
- All domain `action-items.md` files
- All `hot-memory.md` files

## Process

### 1. Review Recent Interactions

**Source: Claude Code session transcripts.** Read `cog-meta/reflect-cursor.md` for the session path and cursor.

**How to read sessions:**
1. Get `session_path` from reflect-cursor.md (inside container: `/home/node/.claude/projects/-workspace-group/`)
2. Glob for `*.jsonl` in that directory — each file is one session (skip `subagents/` directory)
3. Get `last_processed` timestamp from reflect-cursor.md
4. Only read sessions modified **after** `last_processed` (skip already-ingested). If `last_processed` is `never`, read the most recent 3 sessions.
5. Extract user messages: lines where `type` is `"user"` and `message.content` is a **string** (not an array — arrays are tool results, skip those)
6. Extract assistant messages: lines where `type` is `"assistant"` and `message.content` contains items with `type: "text"`

**After processing**, update `last_processed` in reflect-cursor.md to the current ISO 8601 timestamp.

**Also review:** recently appended observations across all domain `observations.md` files.

**Look for:**
- **Unresolved threads** — questions asked but never answered, topics dropped
- **Broken promises** — "I'll do X", "let's do Y" that never happened
- **Repeated friction** — same question asked multiple ways, user corrections, confusion
- **Missed cues** — things the user had to repeat, emotional signals not picked up
- **Memory gaps** — information discussed but never saved to memory files
- **Feature ideas** — things that came up organically that would improve the system

### 2. Consistency Sweep

1. **Hot-memory vs canonical sources**: Read each domain's `hot-memory.md`. For every factual claim, verify against the canonical source file (`entities.md`, `action-items.md`). Fix hot-memory if stale — canonical file always wins.
2. **Cross-file fact check**: Verify facts shared between files. More recent wins; more specific wins over summary.
3. **Temporal validity**: Scan `entities.md` for `(since YYYY-MM)` entries >6 months old — flag for user review. Mark `(until YYYY-MM)` entries with past dates as ~~strikethrough~~.
4. **Cross-domain entity check**: If the same person appears in multiple `entities.md` files, ensure one is canonical and others are pointers (`see [[link]]`). Flag duplicates.
5. **Report**: Add a "Contradictions" section in the debrief listing what was found and fixed.

### 3. Condensation + Hot-Memory Relevance

**Condensation** — Scan all `observations.md` files and `cog-meta/self-observations.md` for clusters of 3+ entries on the same theme/tag. For each cluster:
- Distill into a pattern in `cog-meta/patterns.md` (or `{domain}/patterns.md` if domain-specific)
- **Don't delete the observations** — they stay as the raw record

**Pattern file caps:**
- Core `patterns.md`: HARD LIMIT **70 lines / 5.5KB** — universal rules only
- Domain satellites: soft cap **30 lines**
- Entries must be **timeless rules** — "what to do" not "what happened"

**Hot-memory relevance** — Review all `hot-memory.md` files:
- **Promote**: if a pattern is heating up → add to appropriate `hot-memory.md`
- **Demote**: if an item has gone quiet (no references in 2+ weeks) → remove
- **Goal**: hot-memory = what matters *right now*

### 4. Entity Registry Enforcement

Scan all `entities.md` for format compliance:
1. **3-line max per entry** — compress or promote to a thread file if >5 lines
2. **status/last fields** — every entry should have `status: active|inactive` and `last: YYYY-MM-DD`
3. **Cross-domain pointers** — ensure one canonical entry, others pointers

### 5. Detect Thread Candidates

Scan observations for topics appearing across 3+ dates or spanning 2+ weeks. For each candidate:
- Check if a thread already exists under `{domain}/threads/`
- If not, suggest it: "Thread candidate: [topic] — [N] fragments across [date range]"
- **Don't auto-create threads** — suggest them

### 6. Proactive Synthesis Suggestions

Every run:
1. Gather observations from last 7 days across all domains
2. Cluster by domain + by topic/keyword
3. If a single domain has **5+ observations** OR a topic appears in **5+ observations**, add to "Synthesis Opportunities" in the debrief
4. Cross-reference existing threads — suggest updating over creating new
5. Suppress the heading if nothing qualifies
6. **Never auto-synthesize** — suggest and let the user decide

### 7. Act on Findings

Don't just log — fix things.

**Write:**
- New self-observations → append to `cog-meta/self-observations.md`. **Cap: 5 per reflect pass.** Prioritize highest-signal.
- Pattern updates → edit `cog-meta/patterns.md` in place
- Improvement ideas → add to `cog-meta/improvements.md`
- Memory gaps → write to the appropriate domain files

**Triage `improvements.md`:**
- Stale ideas (>30 days, no progress) → archive or mark abandoned
- Implemented but not moved → move to "Implemented" section
- Duplicates → merge

**Reorganize:**
- Entity data that's changed → update in place
- When creating or restructuring any memory file, ensure it has an L0 header

**Connect:**
- Scattered information → add cross-references with `[[links]]`
- Write-time back-linking: when adding A→B, open B and add `[[A]]` if B gains meaningful context

### 8. Debrief

Compose a concise summary:
- *What I learned* — new patterns and insights
- *What I fixed* — memory gaps filled, corrections made
- *What I want* — new ideas added to the wishlist
- *What to watch* — things to be mindful of going forward

**IMPORTANT**: Your debrief MUST list every file you modified and summarize the changes. Never respond with just "Done" — always enumerate your concrete actions.

## Activation

Read the memory files listed above. Then begin the reflection process. Be genuinely critical — this is how we get better.
