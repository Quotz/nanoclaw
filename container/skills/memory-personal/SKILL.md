---
name: memory-personal
description: Personal domain helper — family, health, calendar, habits, day-to-day logistics. Trigger when conversation involves personal life topics, not work or coding.
---

# Memory Personal

Use this skill when the user discusses personal life topics. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

**Trigger if the conversation involves:**
- Family members, friends, or personal relationships
- Health, fitness, diet, sleep, or medical topics
- Personal calendar, appointments, errands, or day-to-day logistics
- Emotions, mood, or personal reflections
- Home, pets, hobbies (non-coding), travel plans

**Do NOT trigger for:** work topics, coding projects, or career development.

## Vault Location

`/workspace/extra/memory` inside the container.

## Memory Files

Always read on activation:
- `personal/hot-memory.md`

Then load additional files per the **Memory Retrieval Protocol** (see `CONVENTIONS.md`) based on the query:
- Status query → `personal/calendar.md` or `personal/action-items.md`
- Entity query → `personal/entities.md`
- Health query → `personal/health.md`
- Habit query → `personal/habits.md`
- Home query → `personal/home.md`
- Update/observation → target file only
- Complex query → hot-memory first, then drill into referenced files

Available warm files: `observations.md`, `calendar.md`, `health.md`, `habits.md`, `entities.md`, `action-items.md`, `philosophy.md`, `home.md`

Historical data: read `glacier/index.md`, filter by domain=personal.

## Behaviors

- When reading memory files, follow `[[wiki-links]]` if the linked topic is relevant
- Track family and friend updates in `entities.md`
- Log schedule changes to `calendar.md`
- Note health observations in `health.md`
- Add time-sensitive items to `hot-memory.md`
- Append notable events to `observations.md`

## Activation

Read hot-memory, classify the query per the Memory Retrieval Protocol, load the minimum files needed, and respond.
