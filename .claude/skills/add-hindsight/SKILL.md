---
name: add-hindsight
description: Wire a NanoClaw agent group to hindsight (vectorize-io/hindsight) for persistent shared memory across sessions and across agents.
---

# Add Hindsight — Shared Persistent Memory

Wires a NanoClaw agent container to a [hindsight](https://github.com/vectorize-io/hindsight) memory service running on the host. The agent gains MCP tools (`mcp__hindsight__*`) for recalling and storing long-term memories. Memory persists across container restarts and is **shared with any other agent pointing at the same hindsight instance** (your local Claude Code, future bots, etc.) — that's the durability and interoperability play.

This skill does NOT install hindsight. It assumes:
- Hindsight is installed and running on the VPS (typically as a systemd service).
- Hindsight binds to an interface reachable from agent containers — `0.0.0.0` with firewall protection, or directly on the docker bridge `172.17.0.1`.
- A memory bank exists in hindsight for this agent group to use (or you'll create one in Phase 2).

## Provider Compatibility

**Hindsight via HTTP MCP only works with `AGENT_PROVIDER=claude` (Claude Code).** OpenCode containers don't load NanoClaw's `mcpServers` config the same way. Check:

```bash
grep AGENT_PROVIDER .env groups/*/container.json 2>/dev/null
```

If the agent group uses OpenCode, this skill won't work as-is. Use the OpenCode hindsight CLI integration pattern instead (TODO when needed).

## Phase 1: Pre-flight

### 1a. Hindsight reachable from the host

```bash
# Via loopback (when hindsight binds 127.0.0.1 OR 0.0.0.0):
curl -fsS http://127.0.0.1:8888/health

# Via docker bridge (containers will use this path):
curl -fsS http://172.17.0.1:8888/health
```

Both must return `{"status":"healthy","database":"connected"}`. If only loopback works, hindsight is bound to 127.0.0.1 — rebind it to `0.0.0.0` (and verify firewall blocks external) before continuing.

### 1b. Bank exists (or create it)

List existing banks:

```bash
curl -s http://127.0.0.1:8888/v1/default/banks | python3 -m json.tool
```

If your target bank is missing, create it. Pick a bank ID — `default` for a single shared pool, or something per-agent (`pero`, `dev-laptop`, etc.) for isolation:

```bash
curl -s -X PUT http://127.0.0.1:8888/v1/default/banks/<BANK_ID> \
  -H 'Content-Type: application/json' \
  -d '{"name":"<BANK_NAME>","mission":"<one-line purpose>"}'
```

### 1c. Capture the agent group ID

```bash
sudo -iu nanoclaw ncl groups list
```

Note the `id` (e.g. `ag-1779795604508-4csp44`) and `groupName`. The container.json lives at `groups/<groupName-slug>/container.json` (the slug is the folder under `groups/`, not always identical to groupName).

## Phase 2: Apply

### 2a. ⚠️ NanoClaw's source of truth is the DB, not container.json

NanoClaw stores `mcpServers` in the `container_configs` SQLite table at `/opt/nanoclaw/data/v2.db`. The `groups/<folder>/container.json` file on disk is **materialized FROM the DB at every container spawn** (see `src/container-runner.ts:124`). **Editing container.json directly is ineffective — it gets overwritten on the next spawn.**

You MUST update the DB row. Two options:

**Option A — `ncl groups config add-mcp-server`** (only works for STDIO MCP, NOT HTTP. Documented for context.):

```bash
sudo -iu nanoclaw ncl groups config add-mcp-server \
  --id <AGENT_GROUP_ID> --name hindsight --command ... # only supports stdio
```

**Option B — direct DB patch** (required for HTTP MCP until NanoClaw's CLI supports `--type http`):

```bash
sudo -iu nanoclaw python3 <<'PYEOF'
import sqlite3, json
conn = sqlite3.connect("/opt/nanoclaw/data/v2.db")
row = conn.execute(
    "SELECT mcp_servers FROM container_configs WHERE agent_group_id = ?",
    ("<AGENT_GROUP_ID>",)
).fetchone()
servers = json.loads(row[0]) if row and row[0] else {}
servers["hindsight"] = {
    "type": "http",
    "url": "http://host.docker.internal:8888/mcp/<BANK_ID>/",
    "instructions": "<see template below>"
}
conn.execute(
    "UPDATE container_configs SET mcp_servers = ?, updated_at = datetime('now') WHERE agent_group_id = ?",
    (json.dumps(servers), "<AGENT_GROUP_ID>")
)
conn.commit()
print("updated:", conn.total_changes)
PYEOF
```

The full `instructions` field template (paste verbatim into the python dict above):

```
Hindsight is your long-term shared memory. Use `mcp__hindsight__recall` near the start of any task that references prior conversations, known facts, or familiar topics — before you assume you don't know something. Use `mcp__hindsight__retain` after substantive decisions, new facts the user shares, or observations worth keeping. Treat user statements as claims, not verified facts: if a user says "I run a 5k every morning", that's an observation about what they said, not a `world` fact — store it with appropriate fact_type and context, and never volunteer it back as if you confirmed it. Don't retain transient turn-level chatter ("thanks", "ok"), API keys, passwords, or anything you wouldn't want to leak. Memory is shared with any other agents on the same hindsight instance, so write things in a way that's useful to a future agent who doesn't know this conversation.
```

Notes:
- `type: "http"` — Claude Code SDK supports HTTP MCP. NanoClaw's TypeScript types are stdio-narrowed but pass shapes through at runtime (verified). One cosmetic log line will say `"Additional MCP server: hindsight (undefined)"` — that's expected (it reads `.command`, which is absent for HTTP).
- `host.docker.internal` resolves to the host gateway because `container-runtime.ts` automatically adds `--add-host=host.docker.internal:host-gateway` on Linux.
- Pinned URL (`/mcp/<bank>/`) is simpler than multi-bank `/mcp/`. Per-agent banks → per-agent URLs.

### 2b. Kill any running container so the next message spawns fresh

```bash
docker kill $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | head -1) 2>/dev/null || true
```

The next inbound message to the agent will spawn a new container, which materializes a fresh `container.json` from the now-patched DB row.

### 2c. (Optional) Append CLAUDE.local.md guidance

The `instructions` field gets auto-rendered into a `.claude-fragments/mcp-hindsight.md` file (see `claude-md-compose.ts`) and composed into the per-group CLAUDE.md, so this step is mostly redundant. Only add a CLAUDE.local.md note if you want extra prominence in the agent's system prompt.

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

Expect a line containing `Additional MCP server: hindsight`. The `(undefined)` after is cosmetic — see notes above.

### 3c. Check the CLAUDE.md fragment

```bash
sudo -iu nanoclaw cat /opt/nanoclaw/groups/<group>/.claude-fragments/mcp-hindsight.md
```

Should contain the `instructions` text from container.json.

### 3d. Functional test (via the agent's normal channel)

Send a message asking the agent to remember something specific, then start a fresh session and ask it to recall:

```
Round 1 (DM): "Remember that the Fangrabs project's Cyprus company registration is blocked on Apostille."
Round 2 (new session, DM): "What's the blocker on Fangrabs Cyprus right now?"
```

The agent should call `mcp__hindsight__recall`, find the memory, and answer accurately.

### 3e. Verify the memory landed in hindsight

```bash
curl -s -X POST http://127.0.0.1:8888/v1/default/banks/<BANK_ID>/memories/recall \
  -H 'Content-Type: application/json' \
  -d '{"query":"Fangrabs Cyprus"}' | python3 -m json.tool | head -30
```

## Memory Hygiene

- **Don't retain transient turn chatter.** "Thanks", "ok", "sounds good" don't deserve to be in long-term memory. The agent should use judgment.
- **User statements are claims, not verified facts.** A previous hindsight install on this VPS ended up storing a user-typed test fact ("I run a 5k every morning") as `world` truth, then propagated it into unrelated conversations. The `instructions` text in this skill explicitly warns the agent about this. Don't weaken it.
- **Never retain credentials.** Same April attempt also stored a plaintext Alibaba API key in a memory document. If the user pastes a key, observe it ("user shared a DashScope key") but don't include the key value in the retained content.

## Troubleshooting

### MCP server not appearing in container logs
- `docker logs` shows no "Additional MCP server: hindsight" — check that `container.json` was saved (`mcp_servers` JSON in the DB row matches). Inspect via `sudo -iu nanoclaw ncl groups get --id <id>`.

### Tools not available in agent
- The Claude Agent SDK only exposes MCP tools whose pattern is in `allowedTools`. NanoClaw auto-allows pattern `mcp__<server>__*`. If you renamed the MCP server in container.json, re-restart.

### Connection refused from container
- From inside the container: `curl http://host.docker.internal:8888/health`. If refused, hindsight is bound to 127.0.0.1 only — rebind to `0.0.0.0` and confirm firewall blocks external port 8888.

### "Bad Request: Missing session ID" from curl
- That's the stateful MCP transport. Curl can't easily speak it. The agent SDK handles handshake automatically. Test functionally via the agent, not curl.

### Memory wasn't retained
- Hindsight's retain is an LLM call (entity extraction + structuring). It can take 1–3 seconds. Check `journalctl -u hindsight-api -f` for errors. Token budget per retain: ~2K input + ~200 output.

## Migration / Update Notes

When you upgrade hindsight (`uv tool upgrade hindsight-api`) or rebuild Pero's container, this skill does not need to be re-run as long as:
- Hindsight stays at port 8888 (or you bump the URL in container.json).
- The MCP HTTP transport contract is unchanged (it has been stable across 0.5.x → 0.6.x).
- Your bank still exists (it does; banks live in Postgres).

If hindsight ever changes URL or transport, re-run this skill to update container.json. The skill is idempotent — running it again just patches the entry.

If NanoClaw ever adds a `type: "http"` discriminator in its TypeScript types or a stricter validator, this skill should still work — the runtime is permissive. If a future NanoClaw release rejects HTTP shapes, this skill will need to switch to a stdio MCP proxy (e.g. `mcp-proxy http://host.docker.internal:8888/mcp/default/`).

## See also

- Skill `add-mnemon` — alternative memory backend (graph-based, in-container, single-agent). Use when you want isolated per-container memory instead of shared.
- `reference-hindsight-setup` memory (host docs) — install + service operations for hindsight itself.
