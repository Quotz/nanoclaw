---
name: add-vault
description: Bridge a laptop Obsidian vault to a NanoClaw agent group via git-sync, so the agent can read the user's notes and write briefings/reflections back. Triggers on "add vault", "obsidian bridge", "sync vault to pero".
---

# Add Vault — Obsidian ↔ Agent git bridge

Gives a NanoClaw agent a **shared, read-write Obsidian vault** as its durable knowledge base with the user. The user's laptop holds the vault; the agent runs in a container on the VPS. They sync through a **bare git repo on the VPS** (the user's candid notes never touch a third party). The agent reads the user's daily logs and writes briefings/reflections back; everything round-trips within the sync interval.

Model: **Matrix = conversation · vault = system of record · Taskosaur = execution.**

## Architecture

```
 LAPTOP                         VPS (bare hub)                 AGENT CONTAINER
 ~/work-vault  --ssh push-->   /home/<svc>/work-vault.git
   (launchd, 15m)  <--pull--           |  (local clone)
                                /home/<svc>/work-vault  --mount(rw)-->  /workspace/extra/vault
                                   (cron sync, 15m)
```

Key facts learned wiring this for Pero (2026-06-01):
- Agent container runs with `--user <svcUid>:<svcGid>` (`container-runner.ts` ~447 sets `--user` when host uid ∉ {0,1000}). So the agent writes **as the service user**, which owns the vault clone → writes succeed.
- Additional mounts are forced to **`/workspace/extra/<name>`** (`mount-security/index.ts`). You cannot pick an arbitrary container path.
- RW requires BOTH `mount.readonly === false` (in `container_configs.additional_mounts`) AND the allowlist root's `allowReadWrite: true`. The `nonMainReadOnly` field some allowlists carry is **vestigial** — runtime ignores it.
- The mount allowlist is **cached in the host process** → `systemctl restart nanoclaw` after editing it. (`container_configs` is re-read per spawn, so that needs no host restart, just a fresh container.)
- Blocked-pattern check runs on the mount root path (substring match against `.ssh`, `.env`, `id_ed25519`, `credentials`, …). Keep the vault path clear of those tokens.

## VPS wiring (run as root; service user is `nanoclaw` here)

1. **Bare repo + git-only key** (laptop pubkey, restricted to git-shell):
   ```bash
   sudo -u nanoclaw git init --bare /home/nanoclaw/work-vault.git
   # authorized_keys line (forced command locks the key to git):
   #   restrict,command="git-shell -c \"$SSH_ORIGINAL_COMMAND\"" <laptop pubkey>
   install -d -m700 -o nanoclaw -g nanoclaw /home/nanoclaw/.ssh
   # append the line to /home/nanoclaw/.ssh/authorized_keys (mode 600, owner nanoclaw)
   ```
2. **Working clone** (mounted into the container):
   ```bash
   sudo -u nanoclaw git clone /home/nanoclaw/work-vault.git /home/nanoclaw/work-vault
   sudo -u nanoclaw git -C /home/nanoclaw/work-vault config user.name  "Pero"
   sudo -u nanoclaw git -C /home/nanoclaw/work-vault config user.email "pero@<host>"
   ```
3. **Sync cron** — `/etc/cron.d/work-vault-sync` (matches this box's cron.d convention):
   ```
   */15 * * * * nanoclaw /home/nanoclaw/work-vault-sync.sh >> /home/nanoclaw/work-vault-sync.log 2>&1
   ```
   `work-vault-sync.sh` commits the agent's outputs (everything EXCEPT the user-owned `Work Logs/`+`Templates/`), then `pull --rebase --autostash`, then `push`.
4. **Mount** — add the clone to the allowlist (`~nanoclaw/.config/nanoclaw/mount-allowlist.json`):
   ```json
   {"allowedRoots":[{"path":"/home/nanoclaw/work-vault","allowReadWrite":true}],"blockedPatterns":[]}
   ```
   and to the group's `container_configs.additional_mounts` (DB at `/opt/nanoclaw/data/v2.db`):
   ```json
   [{"hostPath":"/home/nanoclaw/work-vault","containerPath":"vault","readonly":false}]
   ```
   Then `systemctl restart nanoclaw` (reload the cached allowlist).

## Laptop side

- Make the vault a git repo; `origin = ssh://nanoclaw@<vps>/home/nanoclaw/work-vault.git`.
- Auto-sync via a launchd agent (`com.pero.vault-sync`, `StartInterval` 900) running a script that commits user-owned changes (everything EXCEPT `Pero/`), pulls, pushes.
- **macOS TCC gotcha:** background launchd/cron CANNOT read `~/Desktop`, `~/Documents`, `~/Downloads` ("Operation not permitted"). Keep the vault in a non-protected path (e.g. `~/work-vault`), or grant Full Disk Access, or use the Obsidian Git plugin (runs inside Obsidian, which already has access — but only syncs while Obsidian is open).

## Agent instructions

Append a "Shared Obsidian Vault" section to the group's `CLAUDE.local.md` describing the layout (`Work Logs/` read-only to the agent; `Pero/Daily`, `Pero/Weekly` agent-owned; `Goals.md` + `Doctrine.md` top-level shared; `Plans/` shared) and the two laws: never edit the user's logs in place; vault holds human-meaningful notes only (machine state stays in `/workspace/agent/`).

## Verify

`docker run --rm --user <uid>:<gid> --entrypoint sh -v /home/nanoclaw/work-vault:/workspace/extra/vault:rw <image> -c 'ls "/workspace/extra/vault/Work Logs"; echo hi > /workspace/extra/vault/Pero/Daily/_t && echo OK'` then run the sync and `git pull` on the laptop to confirm the round-trip.

## See also
- `add-hindsight`, `add-taskosaur` — sibling host-bridge integrations.
- Single-writer rule keeps git conflict-free: laptop owns `Work Logs/`+`Templates/`, agent owns `Pero/`; shared files (`Goals.md`, `Doctrine.md`, `Plans/`) are edited rarely by both.
