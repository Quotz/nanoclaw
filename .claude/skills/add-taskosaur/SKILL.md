---
name: add-taskosaur
description: Wire a NanoClaw agent group to a self-hosted Taskosaur instance via the taskosaur-mcp HTTP bridge, so the agent can manage projects, tasks, sprints, and comments through MCP tools.
---

# Add Taskosaur — Project Management Tools

Wires a NanoClaw agent container to a [Taskosaur](https://taskosaur.com) instance via the `taskosaur-mcp` HTTP bridge running on the host. The agent gains MCP tools (`mcp__taskosaur__*`) for the full PM surface: list/search/create/update/delete tasks, set status/priority/due dates/assignees, comment, manage projects/sprints/workspaces.

This skill does NOT install Taskosaur or build the bridge. It assumes:
- Taskosaur is running and reachable at `${TASKOSAUR_BASE_URL}` (e.g. `https://taskosaur.815431624.xyz`).
- The bridge service `taskosaur-mcp` is installed at `/opt/taskosaur-mcp/` and running as a systemd unit, bound to `0.0.0.0:8889` (loopback + docker bridge).
- A Taskosaur user account exists for the agent ("Pero") with appropriate org/workspace/project membership. Bridge holds those credentials; agent does NOT.

## Provider Compatibility

**Only works with `AGENT_PROVIDER=claude` (Claude Code).** OpenCode containers don't load NanoClaw's `mcpServers` config the same way.

```bash
grep AGENT_PROVIDER .env groups/*/container.json 2>/dev/null
```

## Phase 1: Pre-flight

### 1a. Bridge reachable from the host

```bash
# Loopback (always):
curl -fsS http://127.0.0.1:8889/health | python3 -m json.tool

# Docker bridge (what the agent container will hit):
curl -fsS http://172.17.0.1:8889/health | python3 -m json.tool
```

Both should return `{"status":"healthy","service":"taskosaur-mcp",...}`. If loopback works but docker bridge fails, the bridge is bound to `127.0.0.1` only — fix `BIND_HOST=0.0.0.0` in `/etc/taskosaur-mcp/api.env` and restart.

### 1b. Bridge has Pero's creds and defaults

```bash
curl -s http://127.0.0.1:8889/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print("baseUrl:", d["baseUrl"]); print("defaults:", d["defaults"]); print("tools:", d["toolCount"])'
```

`defaults.orgId`, `workspaceId`, `projectId` should all be UUIDs. If any are empty, the agent will need to pass IDs on every call — not fatal, but worth fixing in `/etc/taskosaur-mcp/api.env`.

### 1c. Capture the agent group ID

```bash
sudo -iu nanoclaw ncl groups list
```

Note the `id` (e.g. `ag-1779795604508-4csp44`).

## Phase 2: Apply

### 2a. NanoClaw's source of truth is the DB, not container.json

NanoClaw stores `mcpServers` in the `container_configs` SQLite table at `/opt/nanoclaw/data/v2.db`. The `groups/<folder>/container.json` file is **materialized FROM the DB at every container spawn** (see `src/container-runner.ts`). **Editing container.json directly is ineffective.**

Patch the DB row:

```bash
sudo -iu nanoclaw python3 <<'PYEOF'
import sqlite3, json
AG = "<AGENT_GROUP_ID>"
conn = sqlite3.connect("/opt/nanoclaw/data/v2.db")
row = conn.execute(
    "SELECT mcp_servers FROM container_configs WHERE agent_group_id = ?",
    (AG,)
).fetchone()
servers = json.loads(row[0]) if row and row[0] else {}
servers["taskosaur"] = {
    "type": "http",
    "url": "http://host.docker.internal:8889/mcp",
    "instructions": (
        "Taskosaur is your project management tool. Use `mcp__taskosaur__whoami` once "
        "at the start of any PM-related task to see your default org/workspace/project. "
        "Use `list_tasks`/`get_task`/`list_today_tasks` to inspect; `create_task`/"
        "`update_task`/`set_task_status`/`add_task_comment` to act. For status changes "
        "you need a statusId — call `list_task_statuses` first to discover the available "
        "ones. Treat the existing FanGrabs project tasks as real PM data; don't create "
        "throwaway tasks, and don't archive/delete unless explicitly asked."
    ),
}
conn.execute(
    "UPDATE container_configs SET mcp_servers = ?, updated_at = datetime('now') "
    "WHERE agent_group_id = ?",
    (json.dumps(servers), AG),
)
conn.commit()
print("updated:", conn.total_changes)
PYEOF
```

Notes:
- `type: "http"` — Claude Code SDK supports HTTP MCP. NanoClaw's TypeScript types are stdio-narrowed but pass shapes through at runtime.
- `host.docker.internal` resolves to the host gateway (the fork patch in `container-runner.ts` adds `--add-host=host.docker.internal:host-gateway` and `NO_PROXY=host.docker.internal,...` so SDK fetches bypass OneCLI).
- No `/mcp/<bank>/` segment here (unlike hindsight) — the bridge serves a single tenant; the URL is just `/mcp`.

### 2b. Kill any running container so the next message spawns fresh

```bash
docker kill $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) 2>/dev/null || true
```

## Phase 3: Restart and Verify

### 3a. Restart the container

```bash
sudo -iu nanoclaw ncl groups restart --id <AGENT_GROUP_ID>
```

### 3b. Check container picked up the MCP server

After ~10 seconds:

```bash
docker logs $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) 2>&1 | grep -i "Additional MCP server" | head -5
```

Expect a line containing `Additional MCP server: taskosaur`. The trailing `(undefined)` is cosmetic — same as hindsight; NanoClaw reads `.command` which is absent for HTTP MCP.

### 3c. Check the CLAUDE.md fragment

```bash
sudo -iu nanoclaw cat /opt/nanoclaw/groups/<group>/.claude-fragments/mcp-taskosaur.md
```

Should contain the `instructions` text from the DB row.

### 3d. Functional test (via the agent's normal channel)

```
Round 1 (DM): "What's on the FanGrabs project right now?"
   Expect: agent calls list_tasks, returns the 13 FanGrabs tasks.

Round 2 (DM): "Create a task titled 'Try out Taskosaur integration' with priority LOW."
   Expect: create_task call returns; verify in Taskosaur UI.

Round 3 (DM): "Mark fangrabs-1 as in progress."
   Expect: agent calls list_task_statuses, then set_task_status.
```

### 3e. Verify writes landed

```bash
docker exec taskosaur-postgres psql -U taskosaur -d taskosaur -c "
SELECT t.slug, t.title, ts.name AS status, t.created_at::timestamptz(0)
FROM tasks t LEFT JOIN task_statuses ts ON ts.id = t.status_id
ORDER BY t.created_at DESC LIMIT 5;"
```

## Tool Surface

The bridge exposes ~28 curated tools. See `/opt/taskosaur-mcp/tools.mjs` for the canonical list. Categories:

- **Tasks**: list_tasks, search_tasks, get_task, create_task, update_task, set_task_status, set_task_priority, set_task_due_date, set_task_assignees, unassign_task, delete_task, add_task_comment, list_today_tasks
- **Projects**: list_projects, get_project, search_projects, create_project, update_project, archive_project, unarchive_project
- **Workspaces**: list_workspaces, create_workspace, update_workspace
- **Sprints**: list_sprints, create_sprint
- **Helpers**: whoami, list_task_statuses, list_labels, list_org_members

## Troubleshooting

### MCP server not appearing in container logs
- Check the DB row: `sudo -iu nanoclaw sqlite3 /opt/nanoclaw/data/v2.db "SELECT mcp_servers FROM container_configs WHERE agent_group_id='<id>'" | python3 -m json.tool`
- Make sure `taskosaur` key exists with `type: "http"`.

### Tools not available in agent
- NanoClaw auto-allows pattern `mcp__<server>__*`. If you renamed the MCP server key in the DB, restart.

### Connection refused from container
- From host: `curl http://172.17.0.1:8889/health`. If refused, bridge is loopback-only — set `BIND_HOST=0.0.0.0` in `/etc/taskosaur-mcp/api.env`.
- Container must have `NO_PROXY` set (forked container-runner does this) — verify with `docker inspect <container> | grep NO_PROXY`.

### Taskosaur 401 / login failed
- Bridge logs: `journalctl -u taskosaur-mcp -n 50`
- Check `/etc/taskosaur-mcp/api.env` has the right `TASKOSAUR_PERO_PASSWORD` (matches `/root/secrets/taskosaur-pero.env`).
- Reset Pero's password directly in DB if needed (bcrypt $2b$12, see SKILL backstory in `reference-taskosaur-setup`).

### Tool returns "Scope id missing"
- Some Taskosaur endpoints (e.g. `/tasks/today`) require an `organizationId`. The bridge passes `TASKOSAUR_DEFAULT_ORG_ID` automatically. If that env is empty, the request will fail — fix the env file.

## Migration / Update Notes

When you upgrade Taskosaur, this skill does not need re-running as long as:
- The OpenAPI endpoints used by the bridge are unchanged.
- JWT auth contract is unchanged.

When you upgrade the bridge (`cd /opt/taskosaur-mcp && git pull && systemctl restart taskosaur-mcp`):
- No skill re-run needed.
- New tools become available automatically (the agent's MCP server lists them on next call).

If Taskosaur ever changes URL or transport, edit the DB row's URL field and respawn the container.

## See also

- Skill `add-hindsight` — same architectural pattern (host HTTP MCP service, DB-row config).
- `reference-taskosaur-setup` memory (host docs) — Taskosaur install + bridge details.
- `feedback-integrations-as-skills` memory — why these are skills, not patches.
