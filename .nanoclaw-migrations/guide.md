# NanoClaw Migration Guide

Base: fork of nanocoai/nanoclaw at 2.0.64, 20 custom commits. Target: upstream/main (2.3.0).
Goal: shrink the fork. Only what is listed under Keep is carried over.

## Applied Skills (reapply on the new base, idempotent)
- add-matrix (channels branch) — the only channel in use
- add-gmail-tool — gmail-mcp in the agent image, OneCLI-managed OAuth
- Custom host skills, copy verbatim from the old tree: add-taskosaur, add-twenty, add-vault, add-hindsight
- Custom container skill, copy verbatim: container/skills/taskosaur/

## Modifications to Applied Skills
### add-matrix: resolve DM room from server m.direct (commit 98f621e8)
Stops orphan-room churn. Absent from upstream channels branch. Reapply the diff of 98f621e8 onto the
freshly installed src/channels/matrix.ts, adapting to the async DbDriver API if the adapter changed.
Also keep bin/repair-matrix-dms.py.

## Customizations (core)
### Webhook binds to 127.0.0.1 (commit 3c95d9d3)
src/webhook-server.ts: upstream still listens on 0.0.0.0. Change the listen host to 127.0.0.1.

### gmail-mcp in the agent image (commit 1026f47b)
container/Dockerfile: pinned ARG + pnpm global install, only if add-gmail-tool on the new base does not
already do it. Keep building locally with ./container/build.sh (do NOT switch to the prebuilt image).

## Dropped on purpose (do not re-port)
- Hindsight auto recall/retain hook + idle-reset (f6080af2, bd00e949, 479a1b91): 7 s per turn. Hindsight stays as an on-demand MCP tool only.
- patch_bridge self-mod action (3cb3b945, 52ea3e27): 0 uses in 90 days.
- CLAUDE.local.md import in compose (9f77c011): replaced by upstream memory/ tree + /migrate-memory.
- Scheduled-task fire-time stamp (42c847c8): already upstream (formatter uses process_after).
- Per-container stdout/stderr log files (31742f35): debugging aid for the removed hook.
- slack-formatting container skill: moved to channels branch, Slack not used.
- "skill DB-truth + NO_PROXY for host-bridge" (bc10055a): re-check only if host bridges are unreachable from the container on the new base.
