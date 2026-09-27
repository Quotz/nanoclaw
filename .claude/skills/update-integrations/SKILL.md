---
name: update-integrations
description: Apply updates to the VPS integrations (Twenty, Taskosaur, OneCLI, Hindsight, Hermes, MCP bridges, floating docker images, Ubuntu) one at a time with backup, verify and rollback. Use after the Sunday "Weekly update check" Matrix DM, or on "update integrations", "update twenty", "update taskosaur".
---

# Update integrations

The VPS updates itself every Sunday 03:00 Europe/Belgrade (`/usr/local/bin/auto-update`, see `bin/ops/README.md`) and DMs a report. Use this skill for what it leaves to a human (NanoClaw, OneCLI major versions), for a failed auto-update, or to update by hand. `check-integration-updates --no-send` lists what is behind.

VPS: `root@46.225.98.16`. **Local rtk hook rewrites inline ssh commands** (`docker` → `rtk docker`): for anything beyond a one-liner, write a script to the scratchpad, `scp` it, run it with `ssh root@46.225.98.16 'bash /root/<script>.sh'`.

## 1. Read the report

```bash
ssh root@46.225.98.16 '/usr/local/bin/check-integration-updates --no-send'
```

Show the user the list. Ask which items to do this session (AskUserQuestion, multiSelect). Do **one component at a time**, low risk first, and confirm each high-risk one individually. Never batch Twenty, Taskosaur or OneCLI with anything else.

## 2. Per-component runbooks

Every runbook is: **backup → change → verify → (rollback on failure)**. Backups go under `/root/backups/<component>-pre-<version>-<date>/`. Stop and report to the user if verify fails after one rollback attempt.

### MCP bridge deps (twenty-mcp, taskosaur-mcp) — low
Repos are the user's own (`Quotz/twenty-mcp`, `Quotz/taskosaur-mcp`), owned by the service user.
1. `cp package-lock.json package-lock.json.bak` in `/opt/<bridge>`.
2. If `git` has new commits: `sudo -u <bridge> git -C /opt/<bridge> pull --ff-only`.
3. `sudo -u <bridge> npm update` (stays within the `^` ranges; do **not** jump express 4→5).
4. `systemctl restart <bridge>`; verify `curl -s http://172.17.0.1:<port>/health` (twenty 8890, taskosaur 8889) returns healthy with the expected `toolCount`.
5. Rollback: restore the lockfile, `npm ci`, restart.

### Hindsight — low
`sudo -iu hindsight uv tool upgrade hindsight-api`, then `systemctl restart hindsight-api`. Backup first: `sudo -u postgres pg_dump -Fc <hindsight db> > /root/backups/...dump` (see `/root/.hermes/scripts/hindsight-backup.sh` for the DB name). Verify `curl -s http://127.0.0.1:8888/health` and one recall via MCP. Keep `/etc/hindsight/api.env` reranker caps (30/60/120) — they fix the slow recall. Rollback: `uv tool install hindsight-api==<old>`.

### Hermes (trial bot) — low
`sudo -iu hermes hermes update`, then `sudo -iu hermes systemctl --user restart hermes-gateway`. Verify it answers a DM. Hermes is a trial: if it breaks, tell the user rather than spend time on it.

### Floating docker images (caddy, postgres, redis patch builds) — low
Same tag, newer build. Per compose project (`/opt/caddy`, `/opt/matrix`, `/opt/taskosaur`, `/home/nanoclaw/.onecli`): `docker compose pull <service> && docker compose up -d <service>`. Postgres minor builds are safe in-place; **never change a postgres major tag** (16→17) this way. Caddy: verify `https://twenty.815431624.xyz` and the Matrix URL still load. Dendrite `:latest` has not moved since 2025-08 (project is in maintenance); if it ever moves, back up `matrix-postgres` first.

### Ubuntu packages / reboot — low but disruptive
`apt-get update && apt-get upgrade -y` (security updates already auto-apply). A reboot restarts every container and NanoClaw: do it **last**, only with the user's go-ahead, and afterwards check `systemctl is-active nanoclaw hindsight-api twenty-mcp taskosaur-mcp`, `docker ps`, and that Pero answers a Matrix DM.

### OneCLI gateway — medium
All agent credentials go through it; an outage breaks every API call Pero makes.
1. Within 1.x auto-update handles it (1.45.0 is the last single-image release). **2.x is a redeploy, not a bump**: the single `ghcr.io/onecli/onecli` image is split into migrations/api/web/gateway images (`onecli:2.x` does not exist), the `/data/secret-encryption-key` must move into `.env` as `SECRET_ENCRYPTION_KEY` or every secret becomes unreadable, `NEXTAUTH_SECRET` → `BETTER_AUTH_SECRET`, a new `GATEWAY_INTERNAL_SECRET`, an account must be registered right after first boot (first registrant owns the data), `ONECLI_API_KEY` becomes mandatory and the API moves to `:10256` `/v1`. Follow `docs/self-hosting.md` ("Upgrading from a pre-login release") in the onecli repo, and do the NanoClaw upgrade first so the host's `@onecli-sh/sdk` speaks `/v1`. The schema migration is one-way: the DB dump + app-data volume tarball are the only rollback.
2. Backup: `docker exec onecli-postgres-1 pg_dumpall -U postgres | gzip > /root/backups/onecli-pre-<v>-<date>/db.sql.gz` and copy `~nanoclaw/.onecli/.env` + `docker-compose.yml`.
3. Set `ONECLI_VERSION=<v>` in `~nanoclaw/.onecli/.env` (keep `ONECLI_BIND_HOST=172.17.0.1`), `docker compose pull && docker compose up -d` in `~nanoclaw/.onecli` as `nanoclaw`.
4. Verify: `onecli agents list` works; the gateway CA is unchanged (`cmp` the volume's `gateway/ca.pem` against `~hermes/.onecli-ca.pem`, re-copy if it changed); Pero can read Gmail; Hermes Gmail still works.
5. Rollback: previous `ONECLI_VERSION`, `up -d`; restore the DB dump only if a migration ran.

### Taskosaur — high
The runbook lives in the comment above `image:` in `/opt/taskosaur/docker-compose.yml`. In short:
1. `docker pull taskosaur/taskosaur:latest`, extract the backend DTOs from the new image and diff `backend/src/modules/{sprints,tasks,comments,projects,workspaces}/dto/` against what `/opt/taskosaur-mcp/tools.mjs` sends. Patch the bridge first if fields were renamed (commit + push to `Quotz/taskosaur-mcp`).
2. Backup: `docker exec taskosaur-postgres pg_dump -U taskosaur taskosaur | gzip > /root/backups/taskosaur/postgres-pre-upgrade-<ts>.sql.gz`.
3. Pause Pero (`systemctl stop nanoclaw`), replace the digest in the compose file with the new `:latest` manifest-list digest (Docker Hub `tags/latest` → `digest`), update the comment (date + commit), `docker compose up -d app`; Prisma migrations run on start. Watch `docker logs -f taskosaur-app` until healthy.
4. Verify via the bridge: list projects, create+delete a test task, list sprints. Start NanoClaw again.
5. Rollback: old digest back in compose + `up -d`; restore the dump if migrations ran.

### Twenty CRM — high
Twenty ships several releases a week and its REST shapes shift across minors. The pinned digest and version label are in `/opt/twenty/docker-compose.yml` (`# vX.Y.Z` comment).
1. Since v1.23 Twenty supports jumping straight to the latest version, and the server runs upgrade migrations on start (no manual upgrade command; `yarn command:prod upgrade:status` only reports). v2.34+ needs Postgres ≥ 15 (twenty-db is 16). Checked against the v2.12–v2.43 release notes (2026-09-27): no REST record-shape changes; API-key calls are now subject to row-level permissions.
2. Backup: `docker exec twenty-db pg_dump -U postgres default | gzip > /root/backups/twenty/pre-<v>-<ts>.sql.gz` (the nightly `/usr/local/bin/twenty-backup` exists too, but take a fresh one).
3. Replace both `twentycrm/twenty@sha256:…` lines (server + worker) with the target tag's digest and update the `# vX.Y.Z` comments; `docker compose pull && docker compose up -d`. Watch `docker logs -f twenty-server`; migrations can take many minutes across dozens of minors.
4. Verify the bridge read-only: `cd /opt/twenty-mcp && node /usr/local/lib/mcp-smoke.mjs http://127.0.0.1:8890/mcp twenty_whoami twenty_list_people twenty_list_companies twenty_list_notes`. (`verify-shapes.mjs` also checks write shapes but leaves "Verify Co"/"Verify Person" records behind; delete them afterwards.) Fix `tools.mjs` if shapes moved (commit + push to `Quotz/twenty-mcp`), `systemctl restart twenty-mcp`.
5. Rollback: old digest + restore the dump (Twenty migrations are not reversible, so the dump is the rollback).

### NanoClaw itself — medium
Not handled here. Use `/migrate-nanoclaw` (the install is a migration branch, `migrate-2.3.0`, with `.nanoclaw-migrations/guide.md`), not a merge.

## 3. Close out

Re-run the check with `--no-send` and show what's left. If something was pinned to a new version, the compose comment and this skill's notes should say so — edit them rather than leaving the knowledge in chat.
