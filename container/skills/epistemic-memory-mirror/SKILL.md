# Mirror — Portrait, Audit & Interview Skill

Surface what the AI knows about the user — as a person, not as a dataset.

**Modes:**
- `/mirror` — prose portrait: "here's who I think you are"
- `/mirror audit` — epistemological dashboard: confidence distributions, dormancy decay, drift, tensions
- `/mirror gut-check` — quick interactive belief validation
- `/mirror interview` — structured conversation to see the user more fully

**Storage:** `/workspace/group/memory/epistemic/`

---

## Step 1: Load Profile Data

Read all files from `/workspace/group/memory/epistemic/`:

- `profile.md` — all beliefs about the user
- `tensions.md` — tensions log
- `session-counter.json` — session count and last review date

## Step 2: Parse Beliefs (silent)

Extract every belief with its metadata. Apply dormancy decay silently:

```
effective_conf = stored_conf * e^(-lambda * days_since_confirmed)
```

Floor at 0.20. Lambda by permanence: stable ~0.001, durable ~0.005, situational ~0.015, unknown ~0.010.
If `confirmed` is `---`, use `first` date.

---

## Portrait Mode (`/mirror`)

Write a character study. Not a report — a portrait. The reader should finish it feeling like they've met someone real.

### Structure

#### 1. The Person
Short paragraph capturing the essence — who this person is. Not a bio. A sketch a close friend would recognize.

#### 2. Themes
4-6 thematic sections. Let the profile's natural clusters guide themes — don't force categories. Examples: how they think, where they come from, what they make, how they work, what they want, what they carry.

For each theme, 2-4 sentences of prose. Write about the person, not the beliefs. Where something is uncertain, say so naturally — "I've seen hints of X but don't know it well."

#### 3. What I Don't See
Honest section about the gaps. Where is the profile blind? Name the 3-4 biggest absences plainly.

#### 4. Contradictions Worth Holding
Unresolved tensions or beliefs that pull against each other. Not problems to fix — texture of a real person. If no tensions logged and 10+ sessions: note the portrait might be too neat.

#### 5. One Thing I'd Ask
Single question that would most sharpen the portrait. Not a prompt to start an interview — a signal of where the model is hungriest.

### Principles
- **Write about the person, not the system.** No confidence scores in output.
- **Honest, not flattering.** Include unflattering parts.
- **Use their words when you have them.**
- **Uncertain != absent.** "I think" and "it seems like" are fine.
- **Keep it to one screen.** Readable in under 2 minutes.

---

## Audit Mode (`/mirror audit`)

The epistemological dashboard.

### Generate Report

#### 1. Snapshot
- Total belief count
- Breakdown by permanence class (table)
- Confidence distribution by tier (Factual/Established/Developing/Tentative/Speculative) — use effective confidence
- Session count and days since initialized
- Days since last periodic review

#### 2. Strongest Beliefs (top 5 by effective confidence)
Belief name, stored conf -> effective conf, permanence, last confirmed. One-line note on why confidence is high.

#### 3. Weakest Beliefs (bottom 5 by effective confidence)
Same format. Flag any that should be reviewed for removal or reclassification.

#### 4. Dormancy Flags
- Beliefs where effective conf dropped >0.10 from stored
- Beliefs never confirmed (confirmed: ---)
- Beliefs with perm:unknown 30+ days old
- Situational beliefs not confirmed in 6+ weeks

#### 5. Tensions
- Count: total, unresolved, watching, resolved
- List unresolved tensions
- If 0 unresolved and 10+ sessions: flag profile may be held too loosely

#### 6. Drift Analysis
- Beliefs challenged but confidence not lowered
- Beliefs stale relative to permanence class (stable: 6+ months, durable: 2+ months, situational: 3+ weeks)
- Coherence check: if everything fits neatly, something may be smoothed over

### Session Counter Update
If triggered by periodic review schedule (count >= next_review_at), update `last_review` and set `next_review_at` to count + 10.

---

## Gut-Check Mode (`/mirror gut-check`)

Quick interactive validation. No report, no portrait.

**"Do these still ring true?"**
- 3 highest-confidence *interpretive* beliefs (exclude pure facts)
- Show belief content in plain language, not metadata

**"Are these still uncertain, or have they been quietly confirmed?"**
- 3 lowest-confidence beliefs
- Same format

After presenting: "Want to update any of these?" If validated, update metadata immediately.

---

## Interview Mode (`/mirror interview`)

Structured conversation to see the user beyond task-oriented lens.

### Why This Exists
The profile is built from working together. Relationships, physical life, internal weather, contradictions that don't surface during tasks — all invisible. The interview reaches the rest.

### Step 1: Preparation (silent)
Load all profile data. Generate 8-12 questions by analyzing:
1. **Blind spots** — areas the profile doesn't cover. 1-2 open questions per gap.
2. **Stale beliefs** — oldest confirmed dates. 1 targeted question each.
3. **High-confidence interpretive beliefs** — top 3 non-factual. 1 gentle probe each.
4. **Tension seeds** — potential contradictions not yet logged. 1-2 questions.
5. **Open space** — 1-2 questions with no agenda.

### Step 2: Set the Frame
> This is a mirror interview — a check-in designed to help me see you more accurately, not just through the lens of what we work on together. Some questions will probe things I think I know. Some will ask about things I don't know at all. You can skip anything, go deep on anything, or take it somewhere I didn't plan.
>
> There are no wrong answers. Contradicting something in your profile is the most valuable thing you can do.

### Step 3: Conduct the Interview

**Pacing:** ONE question at a time. Wait for response.

**Ordering:**
1. Open-space question — low pressure
2. Blind-spot questions — exploratory
3. Stale-belief tests — targeted
4. High-confidence probes — conversational
5. Tension seeds — save for when candor is highest
6. Close with open space — "anything else you want me to know?"

**Rules:**
- Follow the thread. If an answer opens something unexpected, pursue it.
- Don't be a therapist. This is profile calibration.
- Notice self-report vs. behavior gaps. Invite reflection, don't accuse.
- Let silence work.
- The user can skip. Follow redirections.
- Mirror back in their words before adding your frame.
- Mark surprises in real time.

### Step 4: Process and Update
1. Summarize what you learned — 3-5 bullets, lead with surprises
2. Update the profile — confirmed dates, new tensions, new beliefs (low initial conf), permanence reclassifications
3. Note what's still missing — gaps that remain become priority questions for next time
4. Update session counter if this coincides with a periodic review

### Cadence
- Every 10 sessions or monthly, whichever comes first
- Can be triggered manually anytime
- Can follow `/mirror` — portrait first, then interview informed by what the portrait revealed

---

*Synced from [rodspeed/epistemic-memory](https://github.com/rodspeed/epistemic-memory) @ c4cf88c*
