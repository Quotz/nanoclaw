#!/bin/bash
# Runs on Andrey's Mac (launchd com.nanoclaw.vps-backup-pull, daily + on wake):
# copies the VPS backups off the box into ~/VPS-backups (nightly folders kept 60 days).
# Not --delete: if the VPS is wiped or compromised, the laptop copy survives.
set -uo pipefail
DEST="$HOME/VPS-backups"
mkdir -p "$DEST/root-backups" "$DEST/hindsight"
rsync -az -e "ssh -o BatchMode=yes -o ConnectTimeout=20" root@46.225.98.16:/root/backups/ "$DEST/root-backups/" &&
rsync -az -e "ssh -o BatchMode=yes -o ConnectTimeout=20" root@46.225.98.16:/root/.hermes/hindsight-backups/ "$DEST/hindsight/" || exit 1
# Only the big nightly folders are pruned; per-app dumps and one-off pre-upgrade backups are small, keep them all.
find "$DEST/root-backups/nightly" -mindepth 1 -maxdepth 1 -type d -mtime +60 -exec rm -rf {} +
date -u +%FT%TZ > "$DEST/.last-pull"
# Tell the VPS the off-site copy is fresh (health-check alerts if this goes stale).
ssh -o BatchMode=yes root@46.225.98.16 'touch /var/lib/ops/offsite-pulled'
