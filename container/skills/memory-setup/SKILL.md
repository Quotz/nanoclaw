---
name: memory-setup
description: Conversational domain setup — ask about the user's life and work, then generate domains.yml, scaffold directories, and create per-domain files. Trigger on "setup memory", "add a domain", "configure domains", "bootstrap memory".
---

# Memory Setup

Bootstrap or reconfigure memory domains. This skill is **conversational** — ask the user about their life and work, then generate `domains.yml` and everything that flows from it. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

## Vault Location

`/workspace/extra/memory` inside the container.

## Phase 1: Discovery (Conversational)

Have a natural conversation to understand the user's domains. Ask about:

1. **Work** — "What do you do for work? Company name, role?" Each job becomes a `work` domain.
   - Follow-up: "Do you track career growth or reviews separately?"
2. **Side projects** — "Any side projects or ventures?" Each becomes a `work` domain with type `side-project`.
3. **Personal** — The `personal` domain always exists. Ask: "Anything specific you want to track? Health conditions, hobbies, habits, kids' school stuff?"
   - Customize the `files` list based on answers (if they mention kids → add `school.md`, etc.)
4. **Anything else** — "Any other areas of your life you want to help with?"

## Phase 2: Generate domains.yml

Write `domains.yml` with the discovered domains:

```yaml
# Domain Registry — Single Source of Truth
# Run /memory-setup to add or modify domains conversationally.

domains:
  personal:
    label: "Personal — family, health, calendar, day-to-day"
    type: personal
    path: personal
    triggers:
      - Family, friends, personal relationships
      - Health, fitness, diet, sleep
      - Calendar, appointments, errands
      - Emotions, mood, reflections
      - Home, pets, hobbies, travel
    files:
      - hot-memory.md
      - observations.md
      - action-items.md
      - entities.md
      - calendar.md
      - health.md
      - habits.md
      - philosophy.md
      - home.md
    skill: memory-personal

  <work-domain-id>:
    label: "<Company/Project> — <brief description>"
    type: work
    path: work/<id>
    triggers:
      - <trigger descriptions from conversation>
    files:
      - hot-memory.md
      - observations.md
      - action-items.md
      - entities.md
      - dev-log.md
      - projects.md
    skill: null
```

**Rules:**
- `personal` is always present
- Each work domain gets an ID based on company/project name (lowercase, hyphenated)
- `path` is relative to `vault/memory/`
- `triggers` describe when to route conversations to this domain
- `files` lists the warm-tier files for this domain
- `skill` points to a custom skill name, or null for generic routing

## Phase 3: Scaffold Directories

For each domain in the new `domains.yml`:

1. Create the directory if it doesn't exist: `mkdir -p {path}/threads`
2. Create each file listed in `files` if it doesn't exist, with an L0 header:
   ```markdown
   <!-- L0: <domain> <file-type> — <brief description> -->
   # <Domain> <Title>
   ```
3. Create `patterns.md` satellite file with L0 header (soft cap: 30 lines)

## Phase 4: Verify

After scaffolding:
1. Read back `domains.yml` and confirm it looks right
2. List all created files
3. Verify each has an L0 header: `grep -l "<!-- L0:" {path}/*.md`

## Phase 5: Summary

Tell the user:
- What domains were created
- What files exist per domain
- How domain routing works (conversations about X go to domain Y)
- How to add more domains later: "just ask me to add a domain" or invoke `/memory-setup` again
- How maintenance skills work: `/memory-reflect`, `/memory-housekeeping`, `/memory-evolve`

## Adding a Domain Later

If `domains.yml` already exists and the user wants to add a domain:
1. Read the existing `domains.yml`
2. Ask about the new domain (same conversation as Phase 1, but focused)
3. Append the new domain to `domains.yml`
4. Scaffold its directory and files
5. Confirm

## Activation

Check if `domains.yml` exists. If yes, read it and ask what to change. If no, start the Phase 1 discovery conversation.
