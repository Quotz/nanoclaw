# NanoClaw Migration Guide

Base: fork of nanocoai/nanoclaw at 2.0.64, 20 custom commits. Target: upstream/main (2.3.0), then v2.4.0
(branch migrate-2.4 = migrate-2.3.0 merged with tag v2.4.0; the merge was conflict-free).
Goal: shrink the fork. Only what is listed under Keep is carried over.

## Applied Skills (reapply on the new base, idempotent)
- add-onecli (2.4.0+: the OneCLI gateway is no longer built in; the host refuses to start without a registered
  gateway). A manual merge must materialize it: `installGateway('onecli', root, {mode:'refresh', stamp:false})`
  from setup/gateways/install.ts (what /update-nanoclaw does) -> payload files, `import './onecli.js'` in
  src/gateway-providers/installed.ts, `@onecli-sh/sdk` dep.
- add-matrix (channels branch) — the only channel in use
- add-gmail-tool — gmail-mcp in the agent image, OneCLI-managed OAuth
- Custom host skills, copy verbatim from the old tree: add-taskosaur, add-twenty, add-vault, add-hindsight
- Custom container skill, copy verbatim: container/skills/taskosaur/

## Modifications to Applied Skills
### add-matrix: resolve DM room from server m.direct (commits 98f621e8 + 9eb9d0f3)
Stops orphan-room churn. Absent from upstream channels branch. Reapply the diffs of 98f621e8 and 9eb9d0f3
onto the freshly installed src/channels/matrix.ts, adapting to the async DbDriver API if the adapter changed.
9eb9d0f3 matters: matrix-js-sdk `getAccountDataFromServer()` returns the local store after initial sync, so
m.direct must be fetched with a raw `client.http.authedRequest` or a duplicate DM room gets minted.
Also keep bin/repair-matrix-dms.py and its systemd hook on the VPS:
`/etc/systemd/system/nanoclaw.service.d/repair-dms.conf` = `ExecStartPre=-/usr/bin/python3 /opt/nanoclaw/bin/repair-matrix-dms.py`.

## Customizations (core)
### Webhook binds to 127.0.0.1 (commit 3c95d9d3)
src/webhook-server.ts: upstream still listens on 0.0.0.0. Change the listen host to 127.0.0.1.

### gmail-mcp in the agent image (commit 1026f47b)
container/Dockerfile: pinned ARG + pnpm global install, only if add-gmail-tool on the new base does not
already do it. Keep building locally with ./container/build.sh (do NOT switch to the prebuilt image).

### NO_PROXY for host-side MCP bridges (commit bc10055a, re-ported as 389afdff)
src/container-runner.ts `composeSessionSpec`: append `host.docker.internal,172.17.0.1,localhost,127.0.0.1`
to NO_PROXY/no_proxy in `contributedEnv`. Without it hindsight/taskosaur/twenty fail with ECONNRESET
(verified on 2.3.0). Existing containers must be killed to pick it up.

### VPS ops (host scripts, not NanoClaw code)
`bin/ops/` + `bin/check-integration-updates`: health check every 10 min, nightly backups, Sunday
auto-update with rollback, headless Claude on-call. Deployed by scp, see `bin/ops/README.md`.
Runbook skill: `/update-integrations`. Replaced the old Monday twenty/taskosaur checks (2026-09-27).

## Deploy notes (2.0.64 -> 2.3.0, done 2026-09-19)
- OneCLI gateway must be >= the versions.json pin; `~/.onecli/.env` needs `ONECLI_BIND_HOST=172.17.0.1` on this VPS.
- Group folder `_ping-test` renamed to `pero` (2.3.0 folder grammar). Group skills live in
  `data/v2-sessions/<group-id>/.claude-shared/skills/`. Legacy instruction files are in `groups/pero/.legacy/`.
- Backups: `/root/backups/nanoclaw-pre-2.3.0-2026-09-19/` on the VPS. Rollback tag: `pre-migrate-2.0.64`.

## Deploy notes (2.3.0 -> 2.4.0, prepared 2026-09-29, deployed 2026-09-29 @ 898a9728; rollback: /root/backups/nanoclaw-pre-2.4.0-2026-09-29/rollback.sh)
- VPS was on upstream main 7902716b (post-2.3.0), so only 30 upstream commits are new; no schema migrations.
- Agent image changes (Claude Code 2.1.280, Agent SDK 0.3.280): rebuild with ./container/build.sh.
  Groups with no model now default to Opus 5.5 (Claude Code default); pin with NANOCLAW_DEFAULT_MODEL if unwanted.
- Add `NANOCLAW_GATEWAY_PROVIDER=onecli` to the VPS .env (optional with one gateway, recommended).
- Stamp the upgrade marker before restart (bin/ops/README.md).

## Dropped on purpose (do not re-port)
- Old Hindsight auto recall/retain hook + idle-reset (f6080af2, bd00e949, 479a1b91): env-var config, 7 s per turn.
  Superseded by the zero-config patch under "Hindsight auto-memory" below; do not re-port the old one.
- patch_bridge self-mod action (3cb3b945, 52ea3e27): 0 uses in 90 days.
- CLAUDE.local.md import in compose (9f77c011): replaced by upstream memory/ tree + /migrate-memory.
- Scheduled-task fire-time stamp (42c847c8): already upstream (formatter uses process_after).
- Per-container stdout/stderr log files (31742f35): debugging aid for the removed hook.
- slack-formatting container skill: moved to channels branch, Slack not used.

## Hindsight auto-memory (Claude provider, 2.4)
Commit "feat(agent-runner): Hindsight auto recall/retain derived from the hindsight MCP server".
New file container/agent-runner/src/providers/claude-hindsight.ts (+ .test.ts); claude.ts only imports it and,
inside `query()`, spreads `UserPromptSubmit` + `Stop` hooks into `hooks:` when a target resolves.
- On only when the group's MCP servers have `hindsight` = `{type:'http', url:'http://<host>:<port>/mcp/<bank>/'}`;
  base URL and bank come from that URL. `HINDSIGHT_AUTO=0` in the container env turns it off.
- Recall (UserPromptSubmit, prompt >= 15 chars, last 2000 chars, 5 s timeout):
  POST `<base>/v1/default/banks/<bank>/memories/recall` `{query, budget:'mid', max_tokens:1500}` ->
  `results[].text` + date (`occurred_start` or `mentioned_at`) as additionalContext in `<memory-context source="hindsight">`.
- Retain (Stop, fire-and-forget, 10 s timeout, skipped when user+assistant < 40 chars):
  POST `<base>/v1/default/banks/<bank>/memories` `{items:[{content:'User: ...\n\nAssistant: ...', context,
  document_id:'nanoclaw-<SDK session_id>', update_mode:'append'}], async:true}` (field names checked against
  Hindsight v0.10.1 `RetainRequest`/`MemoryItem`). The container has no NanoClaw session id, so the document
  follows the Claude session and starts a new document when the transcript rotates.
- Text is taken from the `<message>` bodies. Soft-fail everywhere; logs carry status codes only, never memory text.
- Needs the NO_PROXY fork patch in src/container-runner.ts (same host list), or the gateway proxy resets these calls.
