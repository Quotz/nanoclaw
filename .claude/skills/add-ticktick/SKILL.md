---
name: add-ticktick
description: Add TickTick hosted MCP server integration to NanoClaw. Gives the container agent access to the user's TickTick tasks, lists, and projects via https://mcp.ticktick.com. Use when the user mentions TickTick, wants to connect their task manager, or asks to integrate todos. Triggers on "ticktick", "add ticktick", "connect ticktick".
---

# Add TickTick Integration

This skill wires the **hosted** TickTick MCP server at `https://mcp.ticktick.com` into NanoClaw so the container agent can read and manage the user's TickTick tasks, lists, and projects via natural language.

Because TickTick runs the MCP server themselves, there is no local software to install, no Dockerfile to modify, and no container rebuild. The integration is just a URL + a Bearer token.

Tool categories (discovered at runtime):
- **Task Queries** — fetch tasks by list, due date, priority, status, search term
- **List Queries** — enumerate lists/projects and their contents
- **Task Management** — create, update, complete, delete, move tasks

Docs: https://help.ticktick.com/articles/7438129581631995904

## Phase 1: Pre-flight

### Check if already applied

```bash
grep -q 'TICKTICK_BEARER_TOKEN' src/config.ts && echo "code applied" || echo "code not applied"
grep -q '^TICKTICK_BEARER_TOKEN=.\+' .env && echo "token set" || echo "token not set"
```

If both report "applied" / "set", skip to Phase 6 (Verify). If the code is applied but the token is missing, skip to Phase 4 (Configure).

### Check prerequisites

Verify the user has a TickTick account at https://ticktick.com. If not, direct them to sign up — free accounts work.

## Phase 2: Get a Bearer Token

Container agents are headless, so TickTick's OAuth flow (which requires a browser) isn't viable. Use a long-lived Bearer token from the TickTick API Token page instead.

Walk the user through:

1. Open https://ticktick.com in a browser and log in.
2. Click the **avatar** in the top-left corner.
3. Go to **Settings → Account**.
4. Scroll to the **API Token** section.
5. Click **Create token** (or copy an existing one).
6. Copy the token to your clipboard.

Reference: https://help.ticktick.com/articles/7438129581631995904

**Important:** keep the token secret. Treat it like a password.

Collect the token from the user and hold it for Phase 4.

## Phase 3: Apply Code Changes

### Ensure upstream remote

```bash
git remote -v
```

If `upstream` is missing, add it:

```bash
git remote add upstream https://github.com/qwibitai/nanoclaw.git
```

### Merge the skill branch

```bash
git fetch upstream skill/ticktick
git merge upstream/skill/ticktick
```

This brings in:
- `src/config.ts` — `TICKTICK_BEARER_TOKEN` export
- `src/container-runner.ts` — per-group `settings.json` injection block
- `src/container-runner.test.ts` — mock entry (keeps tests passing)
- `.env.example` — new variable
- `container/skills/ticktick/SKILL.md` — runtime skill teaching the agent how to use TickTick tools

If the merge reports conflicts, resolve them by reading the conflicted files and honouring both sides.

### Validate

```bash
npm run build
npx vitest run src/container-runner.test.ts
```

Both must be clean before proceeding.

## Phase 4: Configure

Write the Bearer token to `.env`:

```bash
# If .env does not exist yet, create it from the example
[ -f .env ] || cp .env.example .env

# Append the token (replace <token> with the real value)
echo "TICKTICK_BEARER_TOKEN=<token>" >> .env
```

If `TICKTICK_BEARER_TOKEN=` already exists in `.env` (blank), update the existing line instead of appending a duplicate.

Verify (shows only the first 8 characters so the terminal doesn't leak the full token):

```bash
grep TICKTICK_BEARER_TOKEN .env | cut -c1-30
```

## Phase 5: Restart

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

On restart, the new `container-runner` code injects the `ticktick` entry into every group's `data/sessions/<group>/.claude/settings.json` on the next container spawn.

## Phase 6: Verify

### Check the settings.json was updated

After sending any message to a group (which spawns a container), inspect the settings file:

```bash
cat data/sessions/main/.claude/settings.json | grep -A5 ticktick
```

Expected: a `ticktick` entry with `"type": "http"`, `"url": "https://mcp.ticktick.com"`, and an `Authorization: Bearer ...` header.

### Test with the agent

Send a message to your main group:

> @Andy list my TickTick tasks

or:

> @Andy what's on my TickTick today?

The agent should call `mcp__ticktick__*` tools and return a formatted list of tasks.

### Check logs

```bash
tail -f logs/nanoclaw.log | grep -i ticktick
```

Look for successful MCP connection. `401 Unauthorized` means the token is wrong or has been revoked.

## Troubleshooting

### "401 Unauthorized" from TickTick

The Bearer token is invalid or has been revoked. Regenerate it at https://ticktick.com → avatar → Settings → Account → API Token, update `.env`, and restart NanoClaw.

### Agent doesn't reach for TickTick tools

The container runtime skill at `container/skills/ticktick/` may not have been synced into the group. Check:

```bash
ls data/sessions/main/.claude/skills/ticktick/
```

If the directory is missing, `container-runner` should re-sync on next container spawn. If it persists, `rm -rf data/sessions/main/.claude/skills` and restart — the runner rebuilds the skills tree on every spawn.

### `settings.json` doesn't contain the ticktick entry

Check:
1. `grep TICKTICK_BEARER_TOKEN .env` shows a non-empty value.
2. `npm run build` has been run since the merge (compiled `dist/` must be up to date).
3. NanoClaw was restarted after both of the above.
4. At least one container has spawned since the restart — the injection happens at spawn time.

If the `ticktick` entry is still missing, `rm data/sessions/main/.claude/settings.json` and restart — the runner will regenerate it.

### Stale per-group agent-runner source

```bash
rm -rf data/sessions/*/agent-runner-src
```

The runner re-copies on next spawn.

### TickTick only supports "basic" operations

Per TickTick's docs, the MCP server currently exposes task/list/project CRUD but not habits, Pomodoro sessions, or the Eisenhower matrix. This is a TickTick-side limitation, not a bug in the integration.

## Removal

1. Unset the token in `.env`:
   ```bash
   sed -i.bak '/^TICKTICK_BEARER_TOKEN=/d' .env
   ```
2. Restart NanoClaw. New container spawns will no longer inject the entry.
3. Clean up existing settings files:
   ```bash
   for f in data/sessions/*/.claude/settings.json; do
     [ -f "$f" ] && node -e "
       const fs=require('fs');
       const s=JSON.parse(fs.readFileSync('$f'));
       if(s.mcpServers?.ticktick){delete s.mcpServers.ticktick;fs.writeFileSync('$f',JSON.stringify(s,null,2)+'\n');}
     "
   done
   ```
4. Optional full revert of the skill branch (removes the code too):
   ```bash
   git revert -m 1 <merge-commit-sha>
   ```
