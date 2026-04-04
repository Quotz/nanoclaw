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

## Belief Metadata Format

Every belief is a `##` heading followed by a backtick-delimited metadata line:

```markdown
## Belief Name
`conf:0.75 | first:2026-03-10 | confirmed:2026-03-25 | challenged:--- | perm:durable`

Prose description of the belief.
```

**Fields:**
- **conf** (0.0--1.0) — how much weight to give this belief. Bayesian priors, not thermometer readings.
- **first** — date first recorded
- **confirmed** — last session where behavior was consistent (or `---`)
- **challenged** — last session where something contradicted it (or `---`)
- **perm** — permanence class (see below)

## Confidence Scale

| Range | Label | Meaning |
|-------|-------|---------|
| 0.9--1.0 | Factual | Verified facts only (name, location, role). Almost nothing interpretive belongs here. |
| 0.7--0.8 | Established | Consistent across many sessions. Still revisable. |
| 0.5--0.6 | Developing | Pattern forming. Multiple observations but could be situational. |
| 0.3--0.4 | Tentative | Observed once or twice. Might be mood, moment, or misread. |
| 0.0--0.2 | Speculative | Inferred, not observed. Flag clearly. |

**Hard cap:** Interpretive beliefs max out at 0.90. You never fully know another person's inner state.

**Bias check:** Confidence is *earned*, not assigned by how insightful the belief sounds. A pithy character insight observed once is 0.3, not 0.7.

## Permanence Classes

| Class | Timescale | Examples |
|-------|-----------|---------|
| **stable** | Decade | Heritage, deep values, cognitive architecture |
| **durable** | Year | Working patterns, preferences, relationship dynamics |
| **situational** | Month/week | Current feelings about job, project motivations, emotional states |
| **unknown** | — | Not enough data to classify. Default for new beliefs. |

A belief can be high-confidence and situational (certain about something that will change), or low-confidence and stable (uncertain about something that won't).

## Dormancy Decay

When sessions have been dormant, confidence attenuates:

```
effective_conf = conf * e^(-lambda * days_since_confirmed)
```

Floor at 0.20. If `confirmed` is `---`, use `first` date.

| Permanence | Lambda | Half-life |
|------------|--------|-----------|
| stable | ~0.001 | ~2 years |
| durable | ~0.005 | ~5 months |
| situational | ~0.015 | ~6 weeks |
| unknown | ~0.010 | ~2.5 months |

On return from 30+ day dormancy, apply decay to all beliefs before relying on them.

## Update Rules

### When to increment confidence (+0.05 per confirming session, cap 0.90 interpretive)
- Behavior *independently* consistent with the belief (not just the user repeating it)
- Both explicit statements and silent behavioral consistency count
- Update `confirmed` date

### Self-report vs. behavior
- User statements get weight — they know themselves better than you do
- But self-narration has blind spots. When stated belief and observed behavior diverge, log a tension. Don't default to whichever came last. Hold both.

### When to log a challenge (in tensions.md)
- User says or does something that contradicts the belief
- Something expected based on the belief doesn't happen
- User explicitly corrects you
- Update `challenged` date on the belief
- Do NOT automatically lower confidence — a single challenge is data, not a verdict

### When to lower confidence (-0.1 to -0.2)
- Multiple challenges without intervening confirmations
- User explicitly says "that's not me anymore"
- Interpretive belief not confirmed in 5+ sessions

### When to reclassify permanence
- Stable challenged twice -> consider durable
- Situational persists 10+ sessions -> consider durable
- Life circumstances change -> audit all situational beliefs

## Session Counter

At conversation start, read `/workspace/group/memory/epistemic/session-counter.json`:

```json
{
  "count": 0,
  "last_session": null,
  "last_review": null,
  "next_review_at": 10
}
```

1. Increment `count`
2. Update `last_session` to today's date
3. If `count >= next_review_at`, trigger a periodic review (see below)
4. Write back

## Periodic Review (every 10 sessions)

When triggered by session counter:
- Apply dormancy decay to beliefs with stale `confirmed` dates
- Beliefs with conf > 0.7 not confirmed in 10+ sessions? Soften them.
- Beliefs with conf < 0.4 confirmed multiple times? Raise them.
- Unresolved tensions? Do they point to something the profile is missing?
- Is the profile too coherent? Real people have genuine contradictions.
- **Gut-check:** Present the 3 highest and 3 lowest confidence beliefs. "Do these still ring true?"
- Update `last_review` and set `next_review_at` to `count + 10`

## Maintenance Cost Bound

Only update beliefs relevant to the current session. If a session was purely task execution with no profile-relevant signal, touch nothing. The periodic sweep handles passive patterns.

## Tensions Log Format

File: `/workspace/group/memory/epistemic/tensions.md`

```markdown
## YYYY-MM-DD — Short description

**Belief affected:** [which belief]
**What happened:** [what was observed or said]
**Status:** unresolved
**What this suggests:** [optional interpretation, held lightly]
```

Default status is **unresolved**. Resist premature resolution. Statuses: `unresolved`, `watching`, `resolved`.

## Initialization

If `/workspace/group/memory/epistemic/` doesn't exist or is empty, create:
- `profile.md` — empty profile with frontmatter
- `tensions.md` — empty tensions log with template
- `session-counter.json` — zeroed counter
- `INDEX.md` — index pointing to the above

Start beliefs at low confidence (0.3--0.4) and unknown permanence. Let them earn their way up.

## The Epistemology Evolves

This framework improves over time. Decay rates can be tuned per user. New permanence classes can emerge. The rules for weighting evidence can change. Component 10 of the protocol: treating the epistemology as fixed would be ironic.

---

*Synced from [rodspeed/epistemic-memory](https://github.com/rodspeed/epistemic-memory) @ c4cf88c*
