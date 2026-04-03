---
name: add-alfred
description: Add Alfred Obsidian vault integration to NanoClaw. Gives container agents read/write access to a structured knowledge graph with 20 record types. Alfred runs as a separate daemon maintaining the vault (auto-processing inbox, fixing links, extracting knowledge, discovering relationships).
---

# Add Alfred Vault Integration

This skill connects NanoClaw to [Alfred](https://github.com/ssdavidai/alfred), a self-hosted AI butler that maintains an Obsidian vault as a structured knowledge graph. After setup:

- Container agents can read, write, search, and manage vault records via `alfred vault` CLI
- Alfred's background workers (Curator, Janitor, Distiller, Surveyor) maintain the vault autonomously
- Content dropped into `inbox/` is automatically processed into structured records
- The vault becomes persistent, structured memory accessible across all NanoClaw groups

## Phase 1: Pre-flight

### Check if already applied

```bash
test -f container/skills/vault-alfred/SKILL.md && echo "ALREADY_APPLIED" || echo "NOT_APPLIED"
```

If already applied, skip to Phase 3 (Configure).

### Check prerequisites

**Python 3.11+** (required for Alfred):

```bash
python3 --version
```

If Python is not installed or below 3.11, tell the user to install it first.

**Obsidian vault** — ask the user:

> Where is your Obsidian vault located? (e.g., `~/Documents/Vault`, `~/Obsidian`)
>
> If you don't have one yet, I'll create a new vault directory for you.

Store the answer as `VAULT_PATH` for later steps.

## Phase 2: Apply Code Changes

### Ensure upstream remote

```bash
git remote -v
```

If `upstream` is missing, add it:

```bash
git remote add upstream https://github.com/qwibitai/nanoclaw.git
```

### Merge the skill branch

```bash
git fetch upstream skill/alfred
git merge upstream/skill/alfred
```

This merges in:
- Python 3.11 + `alfred-vault` in `container/Dockerfile`
- `container/skills/vault-alfred/SKILL.md` (container agent vault CLI reference)
- `ALFRED_VAULT_PATH` env var in `src/config.ts` and `src/container-runner.ts`
- `ALFRED_VAULT_PATH=` in `.env.example`

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm run build
```

Build must be clean before proceeding.

### Rebuild the container image

```bash
./container/build.sh
```

This adds Python and `alfred-vault` to the container. Takes a few minutes on first build.

### Copy container skill to existing groups

```bash
for dir in data/sessions/*/.claude/skills; do
  [ -d "$dir" ] && cp -r container/skills/vault-alfred "$dir/"
done
```

## Phase 3: Configure

### Install Alfred on the host

Alfred runs as a **separate daemon** on the host (not inside containers). Install it:

```bash
pip install alfred-vault
```

Verify:

```bash
alfred --version
```

If the user already has Alfred installed, skip this step.

### Set vault path

Using the `VAULT_PATH` from Phase 1, add to `.env`:

```bash
ALFRED_VAULT_PATH=/absolute/path/to/vault
```

Replace with the actual absolute path (expand `~` to full path).

### Initialize Alfred config

If Alfred hasn't been configured yet, run the quickstart:

```bash
cd "$VAULT_PATH" && alfred quickstart
```

This creates `config.yaml` in the vault directory. If the user already has a `config.yaml`, skip this.

### Create vault inbox directory

```bash
mkdir -p "$VAULT_PATH/inbox"
```

### Set up mount allowlist

The vault needs to be declared in the mount allowlist so containers can access it.

Check if the allowlist exists:

```bash
cat ~/.config/nanoclaw/mount-allowlist.json 2>/dev/null || echo "NOT_FOUND"
```

**If not found**, create it:

```bash
mkdir -p ~/.config/nanoclaw
```

Then write:

```json
{
  "allowedRoots": [
    {
      "path": "VAULT_PATH_HERE",
      "allowReadWrite": true,
      "description": "Obsidian vault for Alfred integration"
    }
  ],
  "blockedPatterns": [".obsidian/plugins"],
  "nonMainReadOnly": false
}
```

Replace `VAULT_PATH_HERE` with the actual vault path.

**If found**, read the existing file and add the vault path to `allowedRoots` (don't overwrite existing entries).

### Configure group mounts

Ask the user which groups should have vault access:

> Which groups should have access to the vault?
>
> 1. **Main group only** — only your main chat can read/write the vault
> 2. **All groups** — every registered group gets vault access
>
> Non-main groups can optionally be read-only (controlled by `nonMainReadOnly` in the mount allowlist).

For each group that needs access, update its registration in the database. First find the groups:

```bash
sqlite3 store/messages.db "SELECT jid, name, folder FROM registered_groups"
```

For each group that needs vault access, update its `containerConfig`:

```bash
sqlite3 store/messages.db "UPDATE registered_groups SET container_config = json_set(COALESCE(container_config, '{}'), '$.additionalMounts', json('[{\"hostPath\": \"VAULT_PATH\", \"containerPath\": \"vault\", \"readonly\": false}]')) WHERE folder = 'GROUP_FOLDER'"
```

Replace `VAULT_PATH` and `GROUP_FOLDER` with actual values. Set `readonly` to `true` for groups that should only read the vault.

### Start Alfred daemon

Ask the user how they want to manage Alfred:

> How would you like to run Alfred?
>
> 1. **launchd** (macOS) — starts automatically on login, restarts on crash
> 2. **systemd** (Linux) — starts automatically on boot, restarts on crash
> 3. **Manual** — run `alfred up` yourself when needed

#### Option 1: launchd (macOS)

Create the plist:

```bash
cat > ~/Library/LaunchAgents/com.alfred-vault.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.alfred-vault</string>
  <key>ProgramArguments</key>
  <array>
    <string>ALFRED_BIN_PATH</string>
    <string>up</string>
    <string>--foreground</string>
  </array>
  <key>WorkingDirectory</key>
  <string>VAULT_PATH</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>VAULT_PATH/data/alfred-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>VAULT_PATH/data/alfred-stderr.log</string>
</dict>
</plist>
EOF
```

Replace `ALFRED_BIN_PATH` with the output of `which alfred`, and `VAULT_PATH` with the vault path.

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.alfred-vault.plist
```

Verify:

```bash
alfred status
```

#### Option 2: systemd (Linux)

Create the unit:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/alfred-vault.service << 'EOF'
[Unit]
Description=Alfred Vault Butler
After=network.target

[Service]
Type=simple
WorkingDirectory=VAULT_PATH
ExecStart=ALFRED_BIN_PATH up --foreground
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF
```

Replace `ALFRED_BIN_PATH` and `VAULT_PATH`.

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable alfred-vault
systemctl --user start alfred-vault
```

#### Option 3: Manual

Tell the user:

> Run Alfred manually with:
> ```bash
> cd /path/to/vault && alfred up
> ```
>
> Or in foreground: `alfred up --foreground`
>
> Stop with: `alfred down`

### Restart NanoClaw

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Phase 4: Verify

### Test vault access from container

Tell the user:

> Send a message to your main chat like:
>
> "List everything in my vault"
>
> The agent should run `alfred vault context` and return a summary of record types and counts.

### Test writing to the vault

> Try: "Create a note called Test Note with status active"
>
> The agent should run `alfred vault create note "Test Note" --set status=active`.

### Test vault search

> Try: "Search my vault for anything about meetings"
>
> The agent should run `alfred vault search --grep "meetings"`.

### Test inbox drop

> Try: "Save this for later processing: Today I met with the engineering team and we decided to switch from REST to GraphQL for the new API."
>
> The agent should write a file to `/workspace/extra/vault/inbox/`. Alfred's Curator will process it into structured records.

### Check Alfred daemon

```bash
alfred status
```

Should show workers running (Curator, Janitor, Distiller, and optionally Surveyor).

## Phase 5: Optional Enhancements

### Enable Surveyor (semantic clustering)

The Surveyor worker discovers relationships between records using embeddings and clustering. It requires additional dependencies. Ask:

> Would you like to enable the Surveyor? It uses vector embeddings to discover hidden relationships between vault records.
>
> Requirements:
> - **Ollama** running locally (for embeddings), OR an **OpenRouter API key**
> - ~500MB extra disk for Milvus Lite vector store

If yes:

```bash
pip install "alfred-vault[surveyor]"
```

And configure the `surveyor` section in the vault's `config.yaml`.

### Set up vault digest task

Ask:

> Would you like a daily vault digest? The agent will summarize new and changed vault records and send it to your chat.

If yes, tell the user to send this to their main chat:

> "Schedule a daily task at 9am: Check the vault for records created or modified in the last 24 hours and give me a brief digest."

## Troubleshooting

### Agent says "No vault" or vault commands fail

1. Check vault is mounted: look at container logs for mount validation
2. Verify allowlist: `cat ~/.config/nanoclaw/mount-allowlist.json`
3. Check vault path exists: `ls -la $ALFRED_VAULT_PATH`
4. Restart NanoClaw after config changes

### Alfred commands return "command not found" in container

The container needs rebuilding:

```bash
./container/build.sh
```

### Alfred daemon not processing inbox

1. Check Alfred is running: `alfred status`
2. Check logs: `tail -f $ALFRED_VAULT_PATH/data/alfred-stderr.log`
3. Restart: `alfred down && alfred up`

### Permission denied writing to vault

Check mount allowlist has `"allowReadWrite": true` for the vault root. Check `nonMainReadOnly` setting if using non-main groups.

### Vault records not appearing in Obsidian

Ensure Obsidian is pointing at the same vault directory. New files should appear immediately (Obsidian watches the filesystem). If using Obsidian 1.12+, Alfred integrates with its CLI for better wikilink management.

## Updating Alfred

### Automatic update (recommended)

Run the update script — it checks PyPI, upgrades, re-syncs the container skill schema, rebuilds the container, and refreshes per-group skills:

```bash
./scripts/update-alfred.sh
```

Flags:
- `--check` — check for updates only, don't install
- `--yes` — auto-approve (non-interactive, good for cron)

### What the update script does

1. **Version check** — compares installed `alfred-vault` against PyPI latest
2. **Pip upgrade** — installs the new version on the host
3. **Schema sync** — runs `scripts/sync-alfred-schema.py` which imports Alfred's live schema module and regenerates `container/skills/vault-alfred/SKILL.md` with current record types, statuses, and field definitions
4. **Container rebuild** — runs `./container/build.sh` to bake the new Alfred version into the container image
5. **Group refresh** — copies the updated container skill to all per-group skill directories

### Manual update

If you prefer to update step by step:

```bash
# 1. Upgrade the host package
pip install --upgrade alfred-vault

# 2. Re-sync the container skill from the new schema
python3 scripts/sync-alfred-schema.py

# 3. Rebuild the container (gets new pip version inside too)
./container/build.sh

# 4. Copy updated skill to existing groups
for dir in data/sessions/*/.claude/skills; do
  [ -d "$dir" ] && cp -r container/skills/vault-alfred "$dir/"
done

# 5. Restart the Alfred daemon
# macOS:
launchctl kickstart -k gui/$(id -u)/com.alfred-vault
# Linux:
systemctl --user restart alfred-vault

# 6. Restart NanoClaw
# macOS:
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
# Linux:
systemctl --user restart nanoclaw
```

### Runtime fallback

Even without running the update script, container agents have a runtime fallback. The container skill includes Python introspection commands that query Alfred's installed schema directly:

```bash
/opt/alfred/bin/python3 -c "
from alfred.vault.schema import KNOWN_TYPES, STATUS_BY_TYPE
import json
print(json.dumps({'types': sorted(KNOWN_TYPES), 'statuses': {k: sorted(v) for k, v in STATUS_BY_TYPE.items()}}, indent=2))
"
```

This means agents always have access to the live schema, even if the SKILL.md reference is outdated. The sync script just keeps the static reference fresh for faster agent startup.

### What survives updates without any action

| Alfred changes... | Impact |
|---|---|
| New record types | Agent discovers via runtime introspection; sync script updates static reference |
| New CLI subcommands | `alfred --help` / `alfred vault --help` always current inside container |
| Internal refactoring | Zero — we only use CLI |
| New workers | Zero — Alfred manages its own workers |
| Config format changes | Alfred's own quickstart handles migration |
| Schema field changes | Sync script regenerates from live `alfred.vault.schema` module |

### What requires action

| Change | Action needed |
|---|---|
| New pip version released | Run `./scripts/update-alfred.sh` |
| New system dependencies in Alfred | Rebuild container: `./container/build.sh` |
| Breaking CLI changes | Update container skill (unlikely — would break Alfred's own agents) |
