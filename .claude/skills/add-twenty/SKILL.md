---
name: add-twenty
description: Wire a NanoClaw agent group to a self-hosted Twenty CRM instance via the twenty-mcp HTTP bridge, so the agent can manage people, companies, opportunities, notes, and tasks through MCP tools.
---

# Add Twenty — CRM Tools

Wires a NanoClaw agent container to a [Twenty](https://twenty.com) instance via the `twenty-mcp` HTTP bridge running on the host. The agent gains MCP tools (`mcp__twenty__*`) over Twenty's REST API: list/search/get/create/update/delete for **people, companies, opportunities, notes, tasks**, plus convenience tools to log notes/tasks against a contact.

This skill does NOT install Twenty or build the bridge. It assumes:
- Twenty is running and reachable at `${TWENTY_BASE_URL}` (e.g. `https://twenty.815431624.xyz`) — see the `reference-twenty-setup` memory for the install (docker-compose at `/opt/twenty/`, behind the shared edge/Caddy proxy).
- The bridge service `twenty-mcp` is installed at `/opt/twenty-mcp/` and running as a systemd unit, bound to `0.0.0.0:8890` (loopback + docker bridge).
- A Twenty **API key** exists for the agent (created in the Twenty UI → Settings → APIs & Webhooks). The bridge holds it in `/etc/twenty-mcp/api.env`; the agent does NOT.

## Provider Compatibility

**Only works with `AGENT_PROVIDER=claude` (Claude Code).** OpenCode containers don't load NanoClaw's `mcpServers` config the same way.

```bash
grep AGENT_PROVIDER .env groups/*/container.json 2>/dev/null
```

## Phase 1: Pre-flight

### 1a. Bridge reachable from the host

```bash
# Loopback (always):
curl -fsS http://127.0.0.1:8890/health | python3 -m json.tool

# Docker bridge (what the agent container will hit):
curl -fsS http://172.17.0.1:8890/health | python3 -m json.tool
```

Both should return `{"status":"healthy","service":"twenty-mcp","hasKey":true,"workspaceId":"…","toolCount":30}`. If loopback works but the docker bridge fails, the bridge is bound to `127.0.0.1` only — set `BIND_HOST=0.0.0.0` in `/etc/twenty-mcp/api.env` and `systemctl restart twenty-mcp`. If `hasKey` is `false`, the API key is missing from `/etc/twenty-mcp/api.env`.

### 1b. Capture the agent group ID

```bash
sudo -iu nanoclaw ncl groups list
```

Note the `id` (e.g. `ag-1779795604508-4csp44`).

## Phase 2: Apply

### 2a. NanoClaw's source of truth is the DB, not container.json

NanoClaw stores `mcpServers` in the `container_configs` SQLite table at `/opt/nanoclaw/data/v2.db`. The `groups/<folder>/container.json` file is **materialized FROM the DB at every container spawn**. **Editing container.json directly is ineffective.**

Patch the DB row (pass the agent-group id as an argv so nothing is shell-expanded — the instructions text must stay literal):

```bash
sudo -iu nanoclaw python3 - "<AGENT_GROUP_ID>" <<'PYEOF'
import sqlite3, json, sys
AG = sys.argv[1]
conn = sqlite3.connect("/opt/nanoclaw/data/v2.db")
row = conn.execute("SELECT mcp_servers FROM container_configs WHERE agent_group_id=?", (AG,)).fetchone()
servers = json.loads(row[0]) if row and row[0] else {}
servers["twenty"] = {
    "type": "http",
    "url": "http://host.docker.internal:8890/mcp",
    "instructions": (
        "Twenty is your CRM: people (contacts), companies, opportunities (deals), notes, tasks. "
        "Call mcp__twenty__twenty_whoami once to see available objects. "
        "Find records with twenty_list_people / twenty_list_companies using a filter such as "
        "name.firstName[ilike]:%kai% or emails.primaryEmail[ilike]:%acme.com%. "
        "Create/update with twenty_create_person / twenty_update_company etc., passing a fields "
        "object; the exact field shapes are documented in each tool's description (composites such as "
        "name {firstName,lastName}, emails {primaryEmail}, amounts as {amountMicros,currencyCode}). "
        "Log notes/tasks against a contact with twenty_log_note / twenty_log_task (pass "
        "personId/companyId/opportunityId to link). This is real CRM data: do not create throwaway "
        "records and do not delete unless explicitly asked."
    ),
}
conn.execute("UPDATE container_configs SET mcp_servers=?, updated_at=datetime('now') WHERE agent_group_id=?",
             (json.dumps(servers), AG))
conn.commit()
print("mcp servers now:", list(servers.keys()))
PYEOF
```

Notes:
- `type: "http"` — Claude Code SDK supports HTTP MCP. NanoClaw's TypeScript types are stdio-narrowed but pass HTTP shapes through at runtime.
- `host.docker.internal` resolves to the host gateway (the fork patch in `container-runner.ts` adds `--add-host=host.docker.internal:host-gateway` and `NO_PROXY=host.docker.internal,…` so SDK fetches bypass the OneCLI proxy).
- The URL is just `/mcp` (single tenant; no path segment).

### 2b. Kill any running container so the next message spawns fresh

```bash
docker kill $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) 2>/dev/null || true
```

## Phase 3: Restart and Verify

### 3a. Spawn a fresh container

`ncl groups restart` only respawns a *running* container. If none is running, just send the agent a normal message on its channel — that spawns it with the new config.

```bash
sudo -iu nanoclaw ncl groups restart --id <AGENT_GROUP_ID>   # if one is running
```

### 3b. Check the container picked up the MCP server

After ~10 seconds:

```bash
docker logs $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) 2>&1 | grep -i "Additional MCP server" | head
```

Expect a line containing `Additional MCP server: twenty`. The trailing `(undefined)` is cosmetic (NanoClaw reads `.command`, absent for HTTP MCP).

### 3c. Functional test (via the agent's normal channel)

```
"Use your Twenty CRM tools: create a Person named 'Bridge Verify' (email bridge-verify@example.com) and reply with its Twenty id."
```

### 3d. Un-fabricatable verification — confirm the write actually landed

A tool-call returning 200 is not proof. Read the record back independently from Twenty's Postgres:

```bash
docker exec twenty-db psql -U postgres -d default -c \
  "SELECT id, \"nameFirstName\", \"nameLastName\", \"emailsPrimaryEmail\", \"createdAt\"
   FROM workspace_<WORKSPACE_SCHEMA>.person ORDER BY \"createdAt\" DESC LIMIT 3;"
```

(Twenty stores each workspace's records in a `workspace_<id>` schema. Find it with `\dn` in psql, or just confirm via the bridge: `twenty_get_person {id}`.) Then delete the test record: ask the agent, or `twenty_delete_person`.

## Tool Surface (30 tools)

For each of **people, companies, opportunities, notes, tasks**:
`twenty_list_*`, `twenty_get_*`, `twenty_create_*`, `twenty_update_*`, `twenty_delete_*`.

Plus: `twenty_log_note`, `twenty_log_task` (create + link to a record in one call), `twenty_add_note_target`, `twenty_add_task_target` (link existing note/task), `twenty_whoami`.

See `/opt/twenty-mcp/tools.mjs` for the canonical list. Field shapes are documented in each tool's description and were verified live against `/rest/open-api/core`.

### Query conventions (REST, verified)

- **filter** = `field[operator]:value` — e.g. `name.firstName[eq]:Ivan`, `emails.primaryEmail[ilike]:%acme.com%`. Operators: `eq neq gt gte lt lte in is ilike`. (The bracket-array form `filter[field][op]=v` is **silently ignored** — don't use it.)
- **order_by** = `field[Direction]` — Direction ∈ `AscNullsFirst|AscNullsLast|DescNullsFirst|DescNullsLast`.
- **depth** = `0|1|2` to hydrate relations. Amounts are micros (`dollars * 1_000_000`). Deletes are soft (recoverable; restore via `PATCH /rest/restore/<object>/<id>`).

## Troubleshooting

### MCP server not appearing in container logs
- Check the DB row: `sudo -iu nanoclaw python3 -c 'import sqlite3,json;print(list(json.loads(sqlite3.connect("/opt/nanoclaw/data/v2.db").execute("SELECT mcp_servers FROM container_configs WHERE agent_group_id=?",("<id>",)).fetchone()[0]).keys()))'`
- Ensure the `twenty` key exists with `type:"http"`, then respawn.

### Connection refused from container
- From host: `curl http://172.17.0.1:8890/health`. If refused, the bridge is loopback-only — set `BIND_HOST=0.0.0.0` in `/etc/twenty-mcp/api.env` and restart.
- Container must have `NO_PROXY` set (forked container-runner does this) — `docker inspect <container> | grep NO_PROXY`.

### Twenty 401 / Unauthorized
- The API key expired or was revoked. Mint a new one in the Twenty UI (Settings → APIs & Webhooks), update `TWENTY_API_KEY` in `/etc/twenty-mcp/api.env` and `/root/secrets/twenty.env`, then `systemctl restart twenty-mcp`.

### Tool returns a 400 about a field
- Twenty's field shapes shift across minor versions (e.g. notes/tasks use `bodyV2:{markdown}`, company revenue is `annualRevenue:{amountMicros,currencyCode}`). Check the live shape: `curl -s -H "Authorization: Bearer $KEY" "$BASE/rest/open-api/core"` and update `/opt/twenty-mcp/tools.mjs`.

## Migration / Update Notes

- Upgrading **Twenty** (`/opt/twenty` digest bump): the weekly `check-twenty-update` cron flags drift. Twenty's REST API can change across minors — after a bump, re-verify the bridge's tool field shapes against `/rest/open-api/core` and patch `/opt/twenty-mcp/tools.mjs` if needed. This skill does not need re-running unless the base URL or transport changes.
- Upgrading the **bridge** (`cd /opt/twenty-mcp && … && systemctl restart twenty-mcp`): no skill re-run needed; new tools appear on the agent's next MCP call.
- If Twenty's URL/transport changes, edit the DB row's URL field and respawn the container.

## See also

- Skill `add-taskosaur` — same architectural pattern (host HTTP MCP service, DB-row config).
- `reference-twenty-setup` memory — Twenty install + bridge details + gotchas.
- `feedback-integrations-as-skills` memory — why these are skills, not patches.
