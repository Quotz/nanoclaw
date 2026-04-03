#!/usr/bin/env python3
"""
Sync Alfred vault schema into the NanoClaw container skill.

Imports alfred.vault.schema from the installed alfred-vault package and
regenerates container/skills/vault-alfred/SKILL.md with current record types,
statuses, and field definitions. This keeps the container skill accurate as
Alfred evolves.

Usage:
    python3 scripts/sync-alfred-schema.py          # uses system alfred-vault
    /opt/alfred/bin/python scripts/sync-alfred-schema.py  # uses container venv

The script is idempotent — safe to run repeatedly.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Import Alfred schema (fail fast with a clear message if not installed)
# ---------------------------------------------------------------------------
try:
    from importlib.metadata import version as pkg_version
    alfred_version = pkg_version("alfred-vault")
except Exception:
    alfred_version = "unknown"

try:
    from alfred.vault.schema import (
        KNOWN_TYPES,
        LEARN_TYPES,
        LIST_FIELDS,
        NAME_FIELD_BY_TYPE,
        REQUIRED_FIELDS,
        STATUS_BY_TYPE,
        TYPE_DIRECTORY,
    )
except ImportError:
    print(
        "ERROR: alfred-vault is not installed. Install it first:\n"
        "  pip install alfred-vault\n"
        "Then re-run this script.",
        file=sys.stderr,
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# Locate output path
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SKILL_PATH = PROJECT_ROOT / "container" / "skills" / "vault-alfred" / "SKILL.md"

# ---------------------------------------------------------------------------
# Build the record type table from live schema
# ---------------------------------------------------------------------------
def build_type_table() -> str:
    rows = []
    for t in sorted(KNOWN_TYPES):
        directory = TYPE_DIRECTORY.get(t, t) + "/"
        statuses = STATUS_BY_TYPE.get(t)
        status_str = ", ".join(sorted(statuses)) if statuses else "(no constraint)"
        rows.append(f"| {t} | `{directory}` | {status_str} |")
    return "\n".join(rows)


def build_list_fields() -> str:
    return ", ".join(f"`{f}`" for f in sorted(LIST_FIELDS))


def build_learn_types() -> str:
    return ", ".join(f"`{t}`" for t in sorted(LEARN_TYPES))


def build_name_overrides() -> str:
    if not NAME_FIELD_BY_TYPE:
        return "All types use `name` as the title field."
    lines = []
    for t, field in sorted(NAME_FIELD_BY_TYPE.items()):
        lines.append(f"- `{t}` uses `{field}` instead of `name`")
    lines.append("- All other types use `name`")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Generate the SKILL.md content
# ---------------------------------------------------------------------------
now = datetime.now(timezone.utc).strftime("%Y-%m-%d")

SKILL_CONTENT = f"""\
---
name: vault-alfred
description: Read, write, and search an Obsidian vault knowledge graph via the Alfred CLI. Use when the user asks about people, projects, decisions, notes, tasks, or anything that might be stored in their vault. Also use when the user wants to save information for later.
---

# Alfred Vault — Knowledge Graph Access

You have access to an Obsidian vault via the `alfred vault` CLI. The vault is a structured knowledge graph of Markdown files with YAML frontmatter and `[[wikilinks]]` between records.

**Vault location:** `$ALFRED_VAULT_PATH` (mounted at `/workspace/extra/vault`)
**Schema synced from:** alfred-vault {alfred_version} on {now}

## Quick check

Before using vault commands, verify the vault is mounted:

```bash
test -d /workspace/extra/vault && echo "Vault mounted" || echo "No vault"
```

If not mounted, tell the user the vault isn't available for this group.

## Commands

All commands output JSON. Set `ALFRED_VAULT_PATH` before use:

```bash
export ALFRED_VAULT_PATH=/workspace/extra/vault
```

### Read a record

```bash
alfred vault read "person/Alice Smith.md"
```

Returns `{{path, frontmatter, body}}`.

### Search the vault

By filename glob:

```bash
alfred vault search --glob "person/*.md"
```

By content regex:

```bash
alfred vault search --grep "quarterly review"
```

Returns `[{{path, name, type, status}}, ...]`.

### List records by type

```bash
alfred vault list person
alfred vault list task
alfred vault list project
```

Returns `[{{path, name, status}}, ...]`.

### Get vault overview

```bash
alfred vault context
```

Returns `{{records_by_type: {{type: [{{path, name, status}}]}}, total: int}}` — a full inventory grouped by record type.

### Create a record

```bash
alfred vault create task "Review Q3 report" --set status=todo --set priority=high --set assigned=alfred
```

Create with body text:

```bash
echo "Meeting notes from standup..." | alfred vault create note "Standup 2026-04-03" --set status=active --body-stdin
```

### Edit a record

Set or change fields:

```bash
alfred vault edit "task/Review Q3 report.md" --set status=done
```

Append to list fields:

```bash
alfred vault edit "person/Alice Smith.md" --append related="[[project/Alpha]]"
```

Append to body:

```bash
alfred vault edit "note/Standup.md" --body-append "Action item: follow up with Bob"
```

### Move a record

```bash
alfred vault move "note/Old Name.md" "note/New Name.md"
```

Updates wikilinks across the vault if Obsidian CLI is available.

### Delete a record

```bash
alfred vault delete "note/Scratch.md"
```

## Record types

{len(KNOWN_TYPES)} types, each stored in its own directory:

| Type | Directory | Valid statuses |
|------|-----------|---------------|
{build_type_table()}

### Learning types (created by Distiller)

{build_learn_types()}

### Title field overrides

{build_name_overrides()}

## Key fields

Required fields: {", ".join(f"`{f}`" for f in sorted(REQUIRED_FIELDS))}

List fields (always arrays): {build_list_fields()}

All records also commonly have:
- `status` — type-specific enum (see table above)
- `tags` — list of tags
- `related` — list of wikilinks to other records
- `relationships` — list of wikilinks with semantic meaning

## Dropping files into the inbox

Alfred's Curator worker watches `inbox/` for new files and automatically processes them into structured vault records. To save content for later processing:

```bash
cat > /workspace/extra/vault/inbox/meeting-notes-$(date +%Y%m%d).md << 'CONTENT'
---
source: nanoclaw
created: $(date -Iseconds)
---

# Meeting Notes

(content here)
CONTENT
```

The Curator will pick it up, extract entities (people, projects, decisions), create records, and interlink them.

## Runtime schema introspection

If the above reference seems outdated, you can query Alfred's live schema from inside the container:

```bash
/opt/alfred/bin/python3 -c "
from alfred.vault.schema import KNOWN_TYPES, STATUS_BY_TYPE
import json
print(json.dumps({{
  'types': sorted(KNOWN_TYPES),
  'statuses': {{k: sorted(v) for k, v in STATUS_BY_TYPE.items()}}
}}, indent=2))
"
```

This always reflects the installed version of Alfred, regardless of when the skill was last synced.

To check the installed Alfred version:

```bash
/opt/alfred/bin/python3 -c "from importlib.metadata import version; print(version('alfred-vault'))"
```

## Tips

- Use `alfred vault context` first to understand what's in the vault before searching
- Use `alfred vault search --grep` for fuzzy content search
- Wikilinks use the format `[[type/Record Name]]` (e.g., `[[person/Alice Smith]]`)
- When creating records, always set `status` — it's validated per type
- The vault is a shared resource — Alfred's background workers (Curator, Janitor, Distiller, Surveyor) also maintain it
"""

# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
SKILL_PATH.parent.mkdir(parents=True, exist_ok=True)
SKILL_PATH.write_text(SKILL_CONTENT)

print(f"Synced container skill from alfred-vault {alfred_version}")
print(f"  Types: {len(KNOWN_TYPES)}")
print(f"  Output: {SKILL_PATH}")
