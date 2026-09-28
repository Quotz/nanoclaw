# VPS ops: health, backups, auto-update, Claude on-call

Everything here is deployed to the VPS (`root@46.225.98.16`) by hand with `scp` (see "Deploy").
Nothing in NanoClaw's source depends on it.

| What | Where on the VPS | When |
|------|------------------|------|
| `health-check` | `/usr/local/bin` | every 10 min. DMs on state change only; after ~30 min of failure it calls `ops-claude` |
| `backup-all` | `/usr/local/bin` → `/root/backups/nightly/<ts>/` (14 days) | daily 04:00 Belgrade + before every auto-update |
| `auto-update` | `/usr/local/bin` | Sundays 03:00 Belgrade. Backup → update → verify → roll back → reboot if needed. DMs only on failure/rollback; full report in `/var/lib/ops/last-update-report.txt` |
| `ops-claude` + `ops-claude-prompt.md` | `/usr/local/bin`, `/usr/local/lib` | headless Claude Code as root with a restricted tool list, runbook = `.claude/skills/update-integrations/SKILL.md` |
| `check-integration-updates` (`../`) | `/usr/local/bin` | report only; used by auto-update for the "still needs you" list |
| `matrix-dm` | `/usr/local/bin` | sends a DM to the owner as @pero |
| `issue-watch` | `/usr/local/bin`, list in `/etc/ops/watched-issues` | daily 09:00. DMs when a watched GitHub issue (`owner/repo#num` per line) is closed/reopened or gets a comment |
| `mcp-smoke.mjs` | `/usr/local/lib` | read-only MCP bridge smoke test |
| `vps-ops.cron`, `logrotate.conf` | `/etc/cron.d/vps-ops`, `/etc/logrotate.d/vps-ops` | |

Auto-updated: Claude Code, MCP bridges (in-range deps + their git repos), Hindsight, Hermes,
floating image tags, Taskosaur, Twenty, OneCLI within its current major, Ubuntu packages.
Reported but not automatic: NanoClaw itself (`/migrate-nanoclaw`) and OneCLI major versions
(2.x is a redeploy: see the update-integrations skill). A Twenty digest that failed and was rolled back
is recorded in `/var/lib/ops/twenty-failed-digest` and skipped until upstream publishes a new one (delete it to retry).

After any `git pull` (and build) of NanoClaw on the VPS, stamp the upgrade marker before restarting:
`cd /opt/nanoclaw && sudo -u nanoclaw pnpm exec tsx scripts/upgrade-state.ts set`. Otherwise the upgrade tripwire
exits on every start and the circuit breaker crash-loops it while systemd still says active (`nanoclaw:crashloop`).

Off-site copy: the Mac runs `laptop-pull-backups.sh` (installed as `~/.local/bin/vps-pull-backups`,
launchd `com.nanoclaw.vps-backup-pull`, daily 12:00 and at login) into `~/VPS-backups`.
`health-check` alerts if no pull has happened for 3 days. The backups contain every secret
(OneCLI DB + encryption key, .env files, Matrix signing key), so keep `~/VPS-backups` out of
iCloud unless Advanced Data Protection is on.

## Claude on-call token

`ops-claude` needs a long-lived subscription token (the interactive logins on the VPS expire):

```bash
ssh -t root@46.225.98.16 '/root/.local/bin/claude setup-token'      # follow the browser link, copy the token
ssh root@46.225.98.16 'umask 077; cat > /root/.config/ops-claude/token'   # paste, Enter, Ctrl-D
```

Without it, incidents are DMed to you instead.

## Deploy

```bash
scp bin/ops/{matrix-dm,backup-all,health-check,auto-update,ops-claude,issue-watch} bin/check-integration-updates root@46.225.98.16:/usr/local/bin/
scp bin/ops/{ops-claude-prompt.md,mcp-smoke.mjs} root@46.225.98.16:/usr/local/lib/
scp bin/ops/vps-ops.cron root@46.225.98.16:/etc/cron.d/vps-ops
scp bin/ops/logrotate.conf root@46.225.98.16:/etc/logrotate.d/vps-ops
ssh root@46.225.98.16 'mkdir -p /etc/ops; grep -qx "twentyhq/twenty#26798" /etc/ops/watched-issues 2>/dev/null || echo "twentyhq/twenty#26798" >> /etc/ops/watched-issues'
```
