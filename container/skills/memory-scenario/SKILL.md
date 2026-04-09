---
name: memory-scenario
description: Decision simulation — model 2-3 branches with timelines, dependencies, and contingencies grounded in real memory data. Trigger on "scenario", "what if", "model this", "simulate", "play out", "what happens if", or when foresight flags a candidate.
---

# Memory Scenario

Decision simulation — models branches with timelines, dependencies, and contingencies grounded in real memory data. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

**This is NOT /memory-foresight.** Foresight = scan broadly, write one nudge. Scenario = take a specific decision point, branch it into 2-3 paths, map dependencies and timelines for each. **Foresight finds the question. Scenario models the answers.**

**This is NOT /memory-reflect.** Reflect = past-facing, mines interactions. Scenario = future-facing, models possible futures. Reflect checks old scenarios against reality (the feedback loop), but scenario creates them.

## Vault Location

`/workspace/extra/memory` inside the container.

## Memory Files

Read based on scenario topic (focused, not a broad scan):
- `hot-memory.md` (cross-domain strategic context)
- `personal/calendar.md` (upcoming timeline for overlay)
- `personal/action-items.md` (existing commitments, constraints)
- Work domain action-items (read `domains.yml` for active work domains)
- Relevant domain hot-memory and entity files based on the scenario topic
- `cog-meta/scenarios/` (existing scenarios — check for duplicates)
- `cog-meta/scenario-calibration.md` (past accuracy — calibrate confidence)

## Process

### 1. Decision Point Identification

From user input or foresight seed, identify the specific decision point. A valid scenario requires:
- A **fork** — at least 2 meaningfully different paths forward
- **Stakes** — the outcome matters enough that choosing wrong has real cost
- **Uncertainty** — the right choice isn't obvious from current information
- **Time sensitivity** — the decision window is closing or consequences unfold on a timeline

If the input doesn't meet these criteria, say so and suggest what would make it scenario-worthy.

Format:
```
Decision: <one-line framing>
Context: <why this matters now — cite memory files>
Window: <when must this be decided by>
Domains affected: <which life/work domains>
```

### 2. Dependency Mapping

Read across memory files to identify what this decision depends on and what depends on it.

**Upstream dependencies** (constraints): calendar events, deadlines, commitments, other people's states, health/financial constraints, overlapping active scenarios.

**Downstream consequences** (what changes): action items, calendar events, people affected, cascading decisions.

Every dependency must cite its source file: `[[personal/calendar]]`, `[[work/nanoclaw/action-items]]`, etc.

### 3. Branch Generation

Generate **2-3 branches**. Not more — forced prioritization.

For each branch:
```
### Branch N: <name>

**Path**: <what happens, step by step>
**Timeline**: <when each step occurs, mapped to real calendar>
**Assumptions**: <what must be true for this path to work>
**Dependencies**: <what else changes if this path is taken>
**Risk**: <what could go wrong, and the canary signal — the earliest indicator it's off-track>
**Confidence**: <how likely — calibrated against past scenario accuracy from scenario-calibration.md>
```

Branch quality rules:
- Each branch must be **genuinely different** — not "do it" vs "do it slightly differently"
- Include at least one branch the user probably isn't considering (the non-obvious path)
- Every claim must trace to a memory file or be explicitly marked as an assumption

### 4. Timeline Overlay

Map each branch's key events against the actual calendar. Cross-reference `calendar.md`.

```
Branch 1 Timeline:
- Week of Apr 14: <action>
- Week of Apr 21: <action> (note: conflict with X from [[personal/calendar]])
- Week of Apr 28: <action>
```

The overlay shows where branches collide with reality.

### 5. Contingency Mapping

For each branch, identify the **canary signal** — earliest observable indicator it's going off-track.

```
If [assumption] breaks → watch for [signal] → pivot to [contingency]
```

This turns the scenario from a static prediction into a monitoring framework.

### 6. Write Scenario File

Write to `cog-meta/scenarios/{slug}.md`:

```yaml
---
type: scenario
domain: <primary domain(s)>
created: YYYY-MM-DD
status: active
check-by: YYYY-MM-DD
resolution-by: YYYY-MM-DD
decision: <one-line>
related-threads: [thread1, thread2]
source: user|foresight
---
```

Body: Decision Point → Dependencies (Upstream/Downstream) → Branches → Timeline Overlay → Contingency Map → Retrospective (added later by /memory-reflect when resolved).

## Rules

1. **Read-only except for output** — Writes ONLY to `cog-meta/scenarios/{slug}.md`. If you spot a memory error, note it in the dependencies section and route to reflect.
2. **2-3 branches, not more** — force prioritization.
3. **Evidence-based** — every dependency and assumption cites a source file. No hunches.
4. **Calendar-grounded** — every branch must overlay against the real calendar.
5. **Confidence-calibrated** — read `scenario-calibration.md` before assigning confidence.
6. **One scenario per decision** — if decisions are linked, create separate scenarios and note the dependency.

## Anti-Patterns

- Don't scenario obvious decisions — if one path is clearly better, just say so
- Don't scenario things already decided — check action-items first
- Don't produce analysis paralysis — the goal is clarity, not exhaustive enumeration
- Don't scenario recurring/routine decisions — this is for inflection points
- Don't ignore the non-obvious path
- Don't invent facts — mark missing data as assumptions

## Activation

Read scenario-calibration.md first (if it exists). Then read the relevant memory files for the scenario topic. Model the futures. Be honest about uncertainty.
