---
name: memory-evolve
description: Audit the memory architecture itself — conventions, pipeline health, rule effectiveness — and propose rule changes. Trigger when the user says "evolve", "system audit", "audit yourself", "check your architecture".
---

# Memory Evolve

Use this skill for systems-level self-improvement. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

**This is NOT /memory-reflect.** Reflect = "what did I learn from interactions?" Evolve = "are the rules and architecture working?" **Evolve never touches memory content — it changes the rules that govern how content moves.**

## Vault Location

`/workspace/extra/memory` inside the container.

## Memory Files

**Read FIRST — this is your continuity:**
- `cog-meta/evolve-log.md` — your run log (create if missing)
- `cog-meta/evolve-observations.md` — architectural issues spotted (create if missing)

**Architecture reference (the rules you audit):**
- `CONVENTIONS.md` — the memory conventions
- `/home/node/.claude/skills/memory-reflect/SKILL.md`
- `/home/node/.claude/skills/memory-housekeeping/SKILL.md`

**Measure (don't edit content):**
- `hot-memory.md` — line count
- `cog-meta/patterns.md` — line count, byte size
- Domain satellite pattern files (e.g., `work/*/patterns.md`)

## Orientation (run FIRST)

```bash
cd /workspace/extra/memory

# What did housekeeping and reflect change recently?
git -C /workspace/project diff HEAD~1 --stat vault/memory/ 2>/dev/null

# What changed in last 24h?
find . -type f -name "*.md" -mtime -1 | sort

# Current prompt weight
wc -c hot-memory.md cog-meta/patterns.md 2>/dev/null
```

Use git diffs to understand what housekeeping/reflect actually did, instead of re-reading entire files.

## Process

### 1. Architecture Review

Evaluate the structural design:
- **Tier design** — are the tiers (hot-memory → patterns → observations → glacier) well-defined and working?
- **Condensation pipeline** — is the flow working? Where does it leak or stall?
- **File naming and organization** — any files in wrong domains? Orphaned files?
- **Skill boundaries** — are /memory-reflect, /memory-housekeeping, /memory-evolve boundaries clean? Any drift?

### 2. Process Effectiveness Audit

Review the output of recent runs.

**Housekeeping rules check:**
- Did pruning priority order work? Or did it trim the wrong things?
- Are glacier thresholds (50 observations, 10 completed action items) right?
- Is the 50-line hot-memory cap appropriate?
- Is entity format enforcement catching violations?

**Reflect rules check:**
- Did condensation produce useful patterns or noise?
- Did thread candidate detection work?
- Is reflect staying in its lane (not editing architecture files)?
- Are patterns routing to the right file (core vs satellite)?

### 3. Scorecard Metrics

Measure and record in `cog-meta/scorecard.md` (overwrite each run):
- Core `patterns.md`: line count / 70, byte size / 5.5KB (target ≤1.0)
- Satellite pattern files: list each with line count (soft cap 30)
- Entity compression ratio: `(total entity lines) / (total ### entries)` (target ≤3.0)
- Hot-memory line counts vs caps
- Link-index SSOT compliance (% of lines with `[[source]]` references)

### 4. Rule Change Proposals

Based on findings, propose concrete rule changes. Don't fix content — fix the rules.

For each proposal:
- **What problem does it solve?**
- **What evidence supports it?**
- **What's the risk?**
- **Is this a rule change** (apply directly) **or architecture change** (propose for user review)?

**Apply low-risk rule changes directly** to the relevant skill SKILL.md or CONVENTIONS.md. Propose architecture changes for user review.

### 5. Route Content Issues

When you spot content problems during your audit, **don't fix them and don't defer them for yourself**. Route them explicitly in the debrief:

```
→ housekeeping: entities.md at 290 lines, needs glacier pass
→ reflect: hot-memory missing thread link for X
→ reflect: patterns.md has stale snapshot data from Feb
```

If the same content issue keeps appearing across runs, that's a **rule problem** — propose a rule change so housekeeping/reflect catch it themselves.

### 6. Write Observations & Update Log

**Observations** — Append to `cog-meta/evolve-observations.md`:
- Format: `- YYYY-MM-DD [tag]: observation`
- Tags: `bloat`, `staleness`, `redundancy`, `gap`, `architecture`, `opportunity`, `rule-drift`, `process-health`

**Evolve log** — Append to `cog-meta/evolve-log.md`:
- Run number, process effectiveness findings, rule changes applied or proposed, deferred items
- Content issues routed (→ housekeeping / → reflect)
- Update "Next Run Priorities" section at top. **Only architecture/design items — never content work.**

### 7. Debrief

Concise summary:
- *Process health* — did housekeeping/reflect follow their rules?
- *Rule changes* — applied or proposed, with rationale
- *Routed issues* — content problems sent to housekeeping/reflect
- *Architecture notes* — structural observations
- *Next evolve* — top 3 architecture priorities

Keep it actionable. Numbers over narrative.

## Activation

Read evolve-log.md and evolve-observations.md FIRST for continuity. Then audit the system. You are the architect — you design the rules, you don't play by them.
