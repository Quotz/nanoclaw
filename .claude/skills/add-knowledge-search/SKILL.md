---
name: add-knowledge-search
description: Add QMD knowledge search to NanoClaw — indexes Obsidian work logs, conversations, and structured knowledge for hybrid retrieval by agents.
---

# Add Knowledge Search (QMD)

This skill sets up [QMD](https://github.com/tobi/qmd) as a search engine for NanoClaw agents. QMD indexes your markdown files (Obsidian vault, conversation archives, group memory) and provides hybrid search (keyword + semantic + LLM reranking) via MCP.

## Phase 1: Pre-flight

### Check if already applied

Check if `container/skills/knowledge-search/SKILL.md` exists. If it does, skip to Phase 3 (Setup). The code changes are already in place.

### Merge the skill branch

```bash
git fetch origin skill/qmd
git merge origin/skill/qmd
```

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Build

```bash
npm install
npm run build
```

## Phase 2: Install QMD on Host

### Check if QMD is installed

```bash
qmd --version 2>/dev/null || echo "NOT INSTALLED"
```

### Install if needed

```bash
npm install -g @tobilu/qmd
```

Verify:

```bash
qmd --version
```

## Phase 3: Setup

### Ask for Obsidian vault path

AskUserQuestion: Where is your Obsidian vault located?

Example paths:
- `~/Documents/Obsidian`
- `~/Obsidian/MyVault`
- `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/MyVault`

### Create QMD configuration

Write `~/.config/qmd/index.yml` with the user's paths:

```yaml
collections:
  obsidian:
    path: <user's obsidian vault path>
    glob: "**/*.md"
  conversations:
    path: <nanoclaw project>/data/sessions
    glob: "**/conversations/**/*.md"
  group-memory:
    path: <nanoclaw project>/groups
    glob: "**/*.md"

contexts:
  - path: "qmd://obsidian"
    description: "Work logs and notes written by the user in Obsidian"
  - path: "qmd://conversations"
    description: "Archived conversation transcripts from NanoClaw agent sessions"
  - path: "qmd://group-memory"
    description: "Per-group memory files maintained by the NanoClaw agent"
```

Replace `<nanoclaw project>` with the actual project root path.

### Build initial index

```bash
qmd update
```

This downloads ~2GB of GGUF models on first run and indexes all collections. It may take a few minutes.

### Verify index

```bash
qmd status
```

Should show all collections with document counts.

### Test search

```bash
qmd search "test query"
```

Should return results from the indexed collections.

## Phase 4: Start QMD MCP Service

### Create launchd plist (macOS)

Write `~/Library/LaunchAgents/com.qmd.mcp.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.qmd.mcp</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/qmd</string>
        <string>mcp</string>
        <string>--http</string>
        <string>--port</string>
        <string>8181</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/qmd-mcp.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/qmd-mcp.err</string>
</dict>
</plist>
```

Find the actual qmd binary path:

```bash
which qmd
```

Update the plist `ProgramArguments` with the correct path.

Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.qmd.mcp.plist
```

### For Linux (systemd)

Create `~/.config/systemd/user/qmd-mcp.service`:

```ini
[Unit]
Description=QMD MCP Server
After=network.target

[Service]
ExecStart=/usr/local/bin/qmd mcp --http --port 8181
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now qmd-mcp
```

### Verify the MCP server

```bash
curl -s http://localhost:8181/mcp 2>/dev/null && echo "QMD MCP running" || echo "NOT RUNNING"
```

## Phase 5: Configure NanoClaw

### Add QMD port to environment

Add to `.env`:

```bash
QMD_MCP_PORT=8181
```

Sync to container environment:

```bash
mkdir -p data/env && cp .env data/env/env
```

### Rebuild and restart NanoClaw

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

On restart, NanoClaw will inject the QMD MCP server config into each group's container settings.

## Phase 6: Set Up Periodic Re-indexing

QMD needs to re-index when new files are created.

### Create a cron job

```bash
crontab -l 2>/dev/null > /tmp/crontab.bak
echo "*/30 * * * * $(which qmd) update 2>/dev/null" >> /tmp/crontab.bak
crontab /tmp/crontab.bak
```

This re-indexes every 30 minutes. Adjust frequency as needed.

## Phase 7: Verify End-to-End

### Test from a container

Send a message to NanoClaw in Discord and ask it to search for something:

> Search my work logs for [topic]

The agent should use the QMD `query` MCP tool and return results.

### Check agent has QMD tools

In the agent container, the QMD MCP tools (`query`, `get`, `multi_get`, `status`) should be available. Check the agent's tool list or run `/status`.

## Troubleshooting

### QMD MCP not reachable from container

1. Check QMD MCP is running: `curl http://localhost:8181/mcp`
2. Check `QMD_MCP_PORT=8181` is in `.env`
3. Check settings.json has QMD config: `cat data/sessions/discord_main/.claude/settings.json`
4. Check bridge network: the container needs to reach the host via the bridge IP (same as credential proxy)

### No search results

1. Check index: `qmd status` — all collections should show document counts
2. Re-index: `qmd update`
3. Check collection paths in `~/.config/qmd/index.yml` are correct

### Models not downloaded

First `qmd update` downloads ~2GB of GGUF models. Ensure you have disk space and a stable internet connection. Models are cached at `~/.cache/qmd/models/`.
