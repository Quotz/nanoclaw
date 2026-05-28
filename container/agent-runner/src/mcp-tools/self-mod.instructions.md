## Installing packages & tools

To install packages that persist, use the self-modification tools:

**`install_packages`** — request system (apt) or global npm packages. Requires admin approval.

Example flow:
```
install_packages({ apt: ["ffmpeg"], npm: ["@xenova/transformers"], reason: "Audio transcription" })
# → Admin gets an approval card → approves
```

**When to use this vs workspace `pnpm install`:**
- `pnpm install` if you only need it temporarily to do one task. Will not be available in subsequent truns.
- `install_packages` persists for all future turns. Use especially if the user specifically asks you to add a capability

### MCP servers (`add_mcp_server`)

Use **`add_mcp_server`** to add an MCP server to your configuration. Browse available servers at https://mcp.so — it's a curated directory of high-quality MCP servers. Most Node.js servers run via `pnpm dlx`, e.g.:

```
add_mcp_server({ name: "memory", command: "pnpm", args: ["dlx", "@modelcontextprotocol/server-memory"] })
```

Do not ask the user to give you credentials or tell them how to create credentials (OAuth, API keys, etc.) — NEVER fabricate credential setup instructions. Credentials are handled by the OneCLI gateway. Use `"onecli-managed"` as the placeholder value for any credential env vars or config fields. After the MCP server is installed and the container restarts, load `/onecli-gateway` for the full credential-handling flow (connect URLs, stubs, error recovery).

### Patching a host-side MCP bridge (`patch_bridge`)

For agents wired to a host-side MCP bridge whose source lives in a known location (currently only `taskosaur-mcp` at `/opt/taskosaur-mcp/`), use **`patch_bridge`** to propose source-code fixes or additions to the bridge itself — e.g. fix a tool returning the wrong field, add a new tool that wraps a REST endpoint you noticed was missing.

```
patch_bridge({
  description: "Add update_label tool — PATCHes /api/labels/{id}",
  diff: `--- a/tools.mjs\n+++ b/tools.mjs\n@@ -100,6 +100,15 @@ ...`
})
```

Constraints:
- Diff must be a unified-format patch (standard `git diff` output)
- Only modifications to existing `.mjs` files (no new files, no deletions, no non-.mjs touches)
- Max 20KB diff, max 1000-char description
- Admin approval required. On approve: diff is applied, bridge restarted, health-checked. If healthy → commit + push to GitHub + your container is bounced so your MCP SDK re-lists the new tool surface. If the new bridge fails the health check → the patch is reverted, the bridge is restarted on the previous code, and you're told what failed.

When to use this:
- You hit a clear bug in a bridge tool (wrong field, missing param) — fix it
- You see an upstream REST endpoint that would let you do something useful and there's no wrapping tool yet — add one
- DON'T use it for speculative refactors or aesthetic changes — only material bug fixes / new capabilities
