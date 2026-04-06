# Taskosaur Skill — Architecture

## Overview

Container skill that gives NanoClaw agents full control over a self-hosted [Taskosaur](https://taskosaur.com) project management instance. The agent runs CLI commands inside the container to create, read, update, and delete tasks, projects, sprints, labels, and more.

## File layout

```
container/skills/taskosaur/
  SKILL.md           # Agent-facing instructions (loaded by Claude Code)
  taskosaur.mjs      # CLI tool (Node.js ESM, 70+ actions)
  ARCHITECTURE.md    # This file
```

## How it works

```
 .env                          src/config.ts                src/container-runner.ts
 ┌──────────────┐    read     ┌──────────────┐   inject   ┌─────────────────────┐
 │ TASKOSAUR_URL│───────────> │ TASKOSAUR_URL│──────────> │ -e TASKOSAUR_URL=…  │
 │ TASKOSAUR_   │             │ TASKOSAUR_   │            │ -e TASKOSAUR_EMAIL  │
 │   EMAIL      │             │   EMAIL      │            │ -e TASKOSAUR_PASS…  │
 │ TASKOSAUR_   │             │ TASKOSAUR_   │            │                     │
 │   PASSWORD   │             │   PASSWORD   │            │ container run …     │
 └──────────────┘             └──────────────┘            └────────┬────────────┘
                                                                   │
                              ┌────────────────────────────────────┘
                              ▼
                   Apple Container VM
                   ┌──────────────────────────────────┐
                   │ /home/node/.claude/skills/        │
                   │   taskosaur/                      │
                   │     SKILL.md  ← Claude reads this │
                   │     taskosaur.mjs ← Claude runs   │
                   │                                    │
                   │ env: TASKOSAUR_URL, EMAIL, PASS    │
                   │ token cache: /tmp/.taskosaur-*.json│
                   └──────────┬───────────────────────-┘
                              │ HTTPS
                              ▼
                   Taskosaur VPS (taskosaur.815431624.xyz)
                   ┌──────────────────────────────────┐
                   │ Caddy → Taskosaur app → PostgreSQL│
                   │ Bot account: nanoclaw (SUPER_ADMIN)│
                   └──────────────────────────────────┘
```

## Credential flow

1. Credentials stored in `.env` (gitignored)
2. `src/config.ts` reads them via `readEnvFile()`
3. `src/container-runner.ts` injects them as `-e` flags when spawning containers
4. `taskosaur.mjs` reads from `process.env` — no hardcoded defaults
5. JWT tokens cached in `/tmp/.taskosaur-token.json` (per-container session)

Migration path to OneCLI: move values from `.env` to vault — the `.mjs` reads the same env vars either way.

## How to update

### Adding a new API endpoint

1. Add the function in `taskosaur.mjs` (follow existing patterns — one-liner for simple CRUD)
2. Add it to the `ACTIONS` map at the bottom of the file
3. Add it to the action table in `SKILL.md`
4. Test: `TASKOSAUR_URL=… node container/skills/taskosaur/taskosaur.mjs <new-action> '{…}'`

### Changing the Taskosaur instance URL or credentials

Edit `.env` — no code changes needed. Restart NanoClaw to pick up new values.

### Taskosaur API changed or broke

1. Check `SKILL.md` "Known limitations" section — it may already be documented
2. Test from host: `TASKOSAUR_URL=… node container/skills/taskosaur/taskosaur.mjs <action> '{…}'`
3. Error messages include the HTTP method, endpoint, status code, and request body
4. If an endpoint was removed, move the action from the main table to "Known limitations"
5. If a new endpoint was added, follow "Adding a new API endpoint" above

### Testing inside the container

```bash
container run --name taskosaur-test \
  --mount "type=bind,source=$(pwd)/container/skills/taskosaur,target=/tmp/taskosaur,ro" \
  --entrypoint node \
  -e TASKOSAUR_URL=https://taskosaur.815431624.xyz/api \
  -e TASKOSAUR_EMAIL=nanoclaw@815431624.xyz \
  -e TASKOSAUR_PASSWORD=nc-ts-k9xP2mQvR7wZ \
  nanoclaw-agent:latest \
  -- /tmp/taskosaur/taskosaur.mjs <action> '<json>'

# Cleanup
container delete taskosaur-test
```

## Host-side touchpoints

These are all the files outside `container/skills/taskosaur/` that reference the skill:

| File | What it does |
|------|-------------|
| `.env` | Stores `TASKOSAUR_URL`, `TASKOSAUR_EMAIL`, `TASKOSAUR_PASSWORD` |
| `src/config.ts` | Reads env vars via `readEnvFile()`, exports them |
| `src/container-runner.ts` | Injects env vars into container with `-e` flags |

## Verified capabilities (2026-04-06)

18/18 E2E tests pass inside Apple Container:

- task-create, task-get, task-update, task-set-priority, task-set-status (x3 states), task-set-due-date, task-delete
- label-create, label-assign, label-delete
- search, task-list, task-by-status
- sprint-list, org-stats, notif-list

Not working (server-side): comments, activity-logs.
