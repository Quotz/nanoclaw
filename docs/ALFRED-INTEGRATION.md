# Alfred Vault Integration

Architecture and build documentation for the Alfred Obsidian vault integration (`skill/alfred` branch).

## Overview

[Alfred](https://github.com/ssdavidai/alfred) is a Python-based AI butler that maintains an Obsidian vault as a structured knowledge graph. This integration gives NanoClaw container agents read/write access to the vault via Alfred's CLI, while Alfred's background workers autonomously maintain and enrich it.

The two systems are loosely coupled by design — they share only a filesystem directory (the vault) and communicate only via Alfred's CLI (JSON output). This survives Alfred updates without NanoClaw changes.

## Architecture

```
HOST
├── NanoClaw (Node.js)
│   ├── Message loop ← receives chat messages
│   ├── Container spawner ← mounts vault into containers
│   └── Task scheduler ← can trigger vault operations on cron
│
├── Alfred daemon (Python, separate process)
│   ├── Curator ← watches inbox/, processes new files into records
│   ├── Janitor ← fixes broken wikilinks, invalid frontmatter, orphans
│   ├── Distiller ← extracts decisions, assumptions, contradictions
│   └── Surveyor ← embeds, clusters, discovers relationships
│
└── Obsidian Vault (filesystem, shared)
    ├── person/        project/       task/         note/
    ├── decision/      session/       conversation/ event/
    ├── assumption/    constraint/    contradiction/ synthesis/
    ├── org/           location/      account/      asset/
    ├── process/       run/           input/
    ├── inbox/         ← drop zone for Curator
    └── _templates/    ← record templates

CONTAINER (ephemeral, per-request)
├── /workspace/extra/vault  ← vault mounted RW via additionalMounts
├── /usr/local/bin/alfred   ← symlink to /opt/alfred/bin/alfred
├── /opt/alfred/             ← isolated Python venv with alfred-vault
└── /home/node/.claude/skills/vault-alfred/  ← container skill
```

## Data Flow

### Chat message → vault operation

```
User sends "Create a task to review the Q3 report"
  → NanoClaw receives message via channel (WhatsApp/Telegram/Slack)
  → NanoClaw spawns container with vault mounted at /workspace/extra/vault
  → Container agent reads vault-alfred skill, learns CLI commands
  → Agent runs: alfred vault create task "Review Q3 report" --set status=todo
  → Alfred CLI writes person/Review Q3 report.md to vault filesystem
  → Agent responds with confirmation
```

### Content forwarded to Alfred's inbox

```
User sends "Save this for later: meeting notes about the API redesign"
  → Agent writes file to /workspace/extra/vault/inbox/meeting-notes-20260403.md
  → Alfred's Curator (watching inbox/) detects new file
  → Curator invokes AI agent to process the file
  → Agent creates structured records: note, person entities, project links
  → Curator moves original to inbox/processed/
```

### Alfred background maintenance

```
Alfred runs continuously on the host:
  Curator:   filesystem watch on inbox/ → processes raw content into records
  Janitor:   hourly/daily sweep → fixes broken wikilinks, orphans, stubs
  Distiller: daily sweep → extracts assumptions, decisions, contradictions
  Surveyor:  filesystem watch → embeds, clusters, labels, discovers relationships
```

## File Inventory

### On `skill/alfred` branch (merged into user's repo)

| File | Type | Purpose |
|------|------|---------|
| `container/Dockerfile` | Modified | Adds python3, pip, venv + `alfred-vault` in isolated venv at `/opt/alfred` |
| `container/skills/vault-alfred/SKILL.md` | New | Container skill: teaches agents the 8 vault CLI commands, record types, field schemas, runtime introspection |
| `.claude/skills/add-alfred/SKILL.md` | New | Feature skill: 5-phase interactive installer (pre-flight, merge, configure, verify, enhancements) |
| `src/config.ts` | Modified | Reads `ALFRED_VAULT_PATH` from `.env` and exports it |
| `src/container-runner.ts` | Modified | Passes `ALFRED_VAULT_PATH=/workspace/extra/vault` to containers when configured |
| `.env.example` | Modified | Adds `ALFRED_VAULT_PATH=` placeholder |
| `scripts/sync-alfred-schema.py` | New | Imports Alfred's schema module, regenerates container skill with current types/statuses |
| `scripts/update-alfred.sh` | New | Full update flow: version check, pip upgrade, schema sync, container rebuild, group refresh |

### On user's host (created during /add-alfred setup)

| File | Purpose |
|------|---------|
| `~/.config/nanoclaw/mount-allowlist.json` | Declares vault path as allowed mount root |
| `~/Library/LaunchAgents/com.alfred-vault.plist` | macOS: Alfred daemon lifecycle |
| `~/.config/systemd/user/alfred-vault.service` | Linux: Alfred daemon lifecycle |
| `$VAULT_PATH/config.yaml` | Alfred's own configuration |

### Inside container (at runtime)

| Path | Purpose |
|------|---------|
| `/workspace/extra/vault` | Vault filesystem (mounted RW from host) |
| `/opt/alfred/` | Python venv with `alfred-vault` installed |
| `/opt/alfred/bin/alfred` | Alfred CLI binary |
| `/opt/alfred/bin/python3` | Python interpreter (for runtime introspection) |
| `/usr/local/bin/alfred` | Symlink to `/opt/alfred/bin/alfred` |
| `/home/node/.claude/skills/vault-alfred/SKILL.md` | Container skill (synced from `container/skills/` at container startup) |

## Integration Boundary

The integration is designed around Alfred's stable public API surface. Here's what we depend on and what we don't:

### Stable (safe to depend on)

- **`alfred vault` CLI** — 8 subcommands: `read`, `search`, `list`, `context`, `create`, `edit`, `move`, `delete`. All output JSON. This is how Alfred's own agents interact with the vault — it's a deliberate contract.
- **Environment variables** — `ALFRED_VAULT_PATH`, `ALFRED_VAULT_SCOPE`, `ALFRED_VAULT_SESSION`. Set by `alfred exec`, read by `alfred vault`.
- **Record format** — Markdown files with YAML frontmatter, wikilinks `[[type/Name]]`, stored in `{type}/` directories.
- **Schema constants** — `KNOWN_TYPES`, `STATUS_BY_TYPE`, `LIST_FIELDS`, `REQUIRED_FIELDS` in `alfred.vault.schema`. Importable from the installed package.
- **`pip install alfred-vault`** — PyPI package with `alfred` entry point.
- **`alfred up/down/status`** — daemon lifecycle.

### Unstable (do NOT depend on)

- Python module internals, function signatures, class names
- Backend implementations (Claude/Zo/OpenClaw invocation)
- State file formats (`data/*_state.json`)
- Template system internals
- Orchestrator/daemon process management
- Surveyor pipeline details (HDBSCAN, Milvus schema)
- Temporal workflow internals

## Update Mechanism

Three layers ensure the skill stays compatible as Alfred evolves:

### Layer 1: Schema sync script

`scripts/sync-alfred-schema.py` imports `alfred.vault.schema` from the installed pip package and regenerates `container/skills/vault-alfred/SKILL.md` with current data:

```bash
python3 scripts/sync-alfred-schema.py
```

It extracts: `KNOWN_TYPES`, `STATUS_BY_TYPE`, `LIST_FIELDS`, `REQUIRED_FIELDS`, `LEARN_TYPES`, `NAME_FIELD_BY_TYPE`, `TYPE_DIRECTORY`, plus the installed package version.

Output is the complete SKILL.md with an auto-generated record type table, field lists, and a timestamp showing when it was last synced.

### Layer 2: Update script

`scripts/update-alfred.sh` handles the full upgrade flow:

```bash
./scripts/update-alfred.sh           # interactive
./scripts/update-alfred.sh --check   # version check only
./scripts/update-alfred.sh --yes     # non-interactive
```

Steps:
1. Reads installed version via `pip show alfred-vault`
2. Queries PyPI JSON API for latest version
3. Runs `pip install --upgrade alfred-vault`
4. Runs `sync-alfred-schema.py` to regenerate the container skill
5. Runs `./container/build.sh` to bake new Alfred into the container image
6. Copies updated skill to all per-group directories under `data/sessions/`
7. Prints summary with version diff

### Layer 3: Runtime introspection

Even without updating, container agents can query Alfred's live schema at runtime:

```bash
# Get all record types and valid statuses
/opt/alfred/bin/python3 -c "
from alfred.vault.schema import KNOWN_TYPES, STATUS_BY_TYPE
import json
print(json.dumps({
  'types': sorted(KNOWN_TYPES),
  'statuses': {k: sorted(v) for k, v in STATUS_BY_TYPE.items()}
}, indent=2))
"

# Check installed version
/opt/alfred/bin/python3 -c "from importlib.metadata import version; print(version('alfred-vault'))"

# Discover CLI commands
alfred --help
alfred vault --help
```

This is documented in the container skill so agents know to use it as a fallback.

### What survives updates without action

| Alfred changes | Impact |
|---|---|
| New record types | Agent discovers via runtime introspection; sync script updates static reference |
| New CLI subcommands | `alfred --help` always current inside container |
| Internal refactoring | Zero — we only use CLI |
| New workers | Zero — Alfred manages its own workers |
| Config format changes | Alfred's own quickstart handles migration |
| Schema field changes | Sync script regenerates from live module |

### What requires action

| Change | Action |
|---|---|
| New pip version | Run `./scripts/update-alfred.sh` |
| New system deps | Rebuild container: `./container/build.sh` |
| Breaking CLI changes | Update container skill (unlikely — would break Alfred's own agents) |

## Mount Security

The vault is mounted into containers via NanoClaw's existing `additionalMounts` system, validated by `src/mount-security.ts`.

**Allowlist** (`~/.config/nanoclaw/mount-allowlist.json`):
```json
{
  "allowedRoots": [
    {
      "path": "~/Documents/Vault",
      "allowReadWrite": true,
      "description": "Obsidian vault for Alfred"
    }
  ],
  "blockedPatterns": [".obsidian/plugins"],
  "nonMainReadOnly": false
}
```

**Security properties:**
- Allowlist stored outside project root — containers can't modify it
- Path traversal prevention (no `..`, symlinks resolved)
- Blocked patterns merged with defaults (`.ssh`, `.env`, credentials, etc.)
- Non-main groups can be forced read-only via `nonMainReadOnly`
- Each group's mount is validated at container spawn time

**Group config** (in SQLite `registered_groups` table):
```json
{
  "additionalMounts": [
    {
      "hostPath": "~/Documents/Vault",
      "containerPath": "vault",
      "readonly": false
    }
  ]
}
```

The mount appears at `/workspace/extra/vault` inside the container (all additional mounts are prefixed with `/workspace/extra/`).

## Debugging

### Container agent can't find vault

```bash
# Check env var is set
grep ALFRED_VAULT_PATH .env

# Check allowlist exists and has the vault path
cat ~/.config/nanoclaw/mount-allowlist.json

# Check vault directory exists
ls -la $ALFRED_VAULT_PATH

# Check NanoClaw logs for mount validation
grep -E "Mount validated|REJECTED" logs/nanoclaw.log

# Check container logs for mount config
cat groups/*/logs/container-*.log | grep -A5 "Mounts"
```

### Alfred CLI not working in container

```bash
# Verify alfred is in the container image
container run --rm nanoclaw-agent:latest which alfred
# Expected: /usr/local/bin/alfred

# Verify the venv
container run --rm nanoclaw-agent:latest /opt/alfred/bin/python3 -c "import alfred; print('ok')"

# If missing, rebuild the container
./container/build.sh
```

### Alfred daemon not running

```bash
# Check status
alfred status

# Check daemon process
ps aux | grep alfred

# Check logs
tail -f $ALFRED_VAULT_PATH/data/alfred-stderr.log

# Restart
# macOS:
launchctl kickstart -k gui/$(id -u)/com.alfred-vault
# Linux:
systemctl --user restart alfred-vault
```

### Schema out of sync

```bash
# Check installed version
pip show alfred-vault | grep Version

# Check container version
container run --rm nanoclaw-agent:latest /opt/alfred/bin/python3 -c \
  "from importlib.metadata import version; print(version('alfred-vault'))"

# If they differ, run the update
./scripts/update-alfred.sh

# Or just re-sync the skill
python3 scripts/sync-alfred-schema.py
```

### Vault operations failing

```bash
# Test CLI directly on host
export ALFRED_VAULT_PATH=/path/to/vault
alfred vault context     # should return JSON summary
alfred vault list task   # should list tasks

# Test inside a container
container run --rm \
  -v /path/to/vault:/workspace/extra/vault \
  -e ALFRED_VAULT_PATH=/workspace/extra/vault \
  nanoclaw-agent:latest \
  alfred vault context
```

## Design Decisions

### Why a separate daemon (not embedded)

Alfred is a Python application with its own process model (4 workers using `multiprocessing`). Embedding it in NanoClaw's Node.js process would require either:
- A Python subprocess manager in Node.js (complexity)
- Rewriting Alfred's workers in TypeScript (impractical, breaks upstream compat)

Running as a separate daemon means:
- Alfred updates are independent (`pip install --upgrade`)
- Alfred's process lifecycle doesn't affect NanoClaw
- No Python runtime needed in the NanoClaw host process
- Users who already run Alfred can just point NanoClaw at their vault

### Why CLI as the integration boundary (not Python imports)

Alfred's CLI (`alfred vault *`) is its deliberate public contract — it's how Alfred's own AI agents interact with the vault. Breaking CLI changes would break Alfred itself, making them extremely unlikely.

Python imports would couple to internal module structure, function signatures, and class hierarchies that can change between versions without notice.

### Why an isolated venv (not system Python)

The container base image is `node:22-slim`. Installing Alfred with system pip would risk dependency conflicts and pollute the global namespace. An isolated venv at `/opt/alfred`:
- Avoids conflicts with any system Python packages
- Can be upgraded independently
- Has its own `python3` for runtime introspection
- Symlink at `/usr/local/bin/alfred` makes the CLI available on PATH

### Why filesystem coupling (not RPC/HTTP)

Both systems already interact with the vault as a filesystem. Alfred watches directories. NanoClaw containers mount directories. The vault IS the integration point — no additional protocol needed.

This means:
- No network port to configure or firewall
- No API server to run or health-check
- No serialization format to agree on
- Works identically on macOS, Linux, and in CI

### Why the sync script (not pure runtime introspection)

Runtime introspection (`/opt/alfred/bin/python3 -c "from alfred.vault.schema import ..."`) works but costs agent context window tokens every time. The sync script pre-generates a static reference that agents can read immediately, with runtime introspection as a fallback for when the reference is stale.

## Surviving NanoClaw Updates

When users run `/update-nanoclaw` (merging `upstream/main`), our changes need to survive without conflicts. The `skill/alfred` branch is registered in the [skill branch table](skills-as-branches.md) so CI merge-forward keeps it compatible with latest main.

### Conflict-resistance strategy

Every modified file uses the `[skill/alfred]` tag in comments to clearly identify our additions. Changes are structured to minimize merge conflicts:

| File | Strategy | Risk |
|------|----------|------|
| `Dockerfile` | **Separate RUN layer** — our Python install is a standalone `RUN` block after the existing `apt-get`. We don't touch the upstream package list. | Low — only conflicts if upstream adds a block at the same insertion point |
| `config.ts` | **End-of-array + isolated export** — `ALFRED_VAULT_PATH` is appended as the last item in `readEnvFile`. The export is in its own section between `TRIGGER_PATTERN` and timezone, not adjacent to `OLLAMA_ADMIN_TOOLS`. | Low — other skills adding env vars go elsewhere in the array |
| `container-runner.ts` | **Separate import line + tagged block** — `ALFRED_VAULT_PATH` is imported on its own line (not mixed into the main import block). The env forwarding is a self-contained block with a `[skill/alfred]` comment. | Low — separate import line survives upstream import changes |
| `.env.example` | **Appended line** — added at the end | Minimal |
| New files | `container/skills/vault-alfred/`, `.claude/skills/add-alfred/`, `scripts/sync-alfred-schema.py`, `scripts/update-alfred.sh`, `docs/ALFRED-INTEGRATION.md` | None — new files never conflict |

### What happens during `git merge upstream/main`

1. **New files** (container skill, feature skill, scripts, docs) — always merge cleanly, they don't exist on main
2. **Dockerfile** — our `RUN` layer is a separate block; upstream changes to the existing `apt-get` block don't touch our lines
3. **config.ts** — our additions are at array boundaries and in isolated sections; upstream adding new env vars typically goes in the middle of the array
4. **container-runner.ts** — our import is on its own line after the main import block; our env forwarding block is self-contained with clear markers

### If a conflict does occur

The `[skill/alfred]` tags in comments help Claude (or a human) identify which lines belong to this skill during conflict resolution. The intent is always: keep the tagged lines and integrate them with whatever upstream changed.

### CI merge-forward

The GitHub Action that runs on every push to `main` will:
1. Merge `main` into `skill/alfred`
2. Run build and tests
3. Push the updated branch (or open an issue if it fails)

This ensures new users always get a `skill/alfred` branch that's compatible with latest main.
