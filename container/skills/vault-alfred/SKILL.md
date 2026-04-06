---
name: vault-alfred
description: Read, write, and search an Obsidian vault knowledge graph via the Alfred CLI. Use when the user asks about people, projects, decisions, notes, tasks, or anything that might be stored in their vault. Also use when the user wants to save information for later.
---

# Alfred Vault — Knowledge Graph Access

You have access to an Obsidian vault via the `alfred vault` CLI. The vault is a structured knowledge graph of Markdown files with YAML frontmatter and `[[wikilinks]]` between records.

**Vault location:** `$ALFRED_VAULT_PATH` (mounted at `/workspace/extra/vault`)
**Schema version:** hand-written baseline (run `sync-alfred-schema.py` on host to auto-generate from installed version)

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

Returns `{path, frontmatter, body}`.

### Search the vault

By filename glob:

```bash
alfred vault search --glob "person/*.md"
```

By content regex:

```bash
alfred vault search --grep "quarterly review"
```

Returns `[{path, name, type, status}, ...]`.

### List records by type

```bash
alfred vault list person
alfred vault list task
alfred vault list project
```

Returns `[{path, name, status}, ...]`.

### Get vault overview

```bash
alfred vault context
```

Returns `{records_by_type: {type: [{path, name, status}]}, total: int}` — a full inventory grouped by record type.

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

20 types, each stored in its own directory:

| Type | Directory | Key statuses |
|------|-----------|-------------|
| person | `person/` | active, inactive |
| org | `org/` | active, inactive |
| project | `project/` | active, paused, completed, abandoned, proposed |
| task | `task/` | todo, active, blocked, done, cancelled |
| session | `session/` | active, completed |
| conversation | `conversation/` | active, waiting, resolved, closed, archived |
| note | `note/` | draft, active, review, final |
| decision | `decision/` | draft, final, superseded, reversed |
| event | `event/` | (no constraint) |
| process | `process/` | active, proposed, design, deprecated |
| run | `run/` | active, completed, blocked, cancelled |
| account | `account/` | active, suspended, closed, pending |
| asset | `asset/` | active, retired, maintenance, disposed |
| input | `input/` | unprocessed, processed, deferred |
| assumption | `assumption/` | active, challenged, invalidated, confirmed |
| constraint | `constraint/` | active, expired, waived, superseded |
| contradiction | `contradiction/` | unresolved, resolved, accepted |
| synthesis | `synthesis/` | draft, active, superseded |
| location | `location/` | active, inactive |

## Key fields

All records have:
- `type` (required) — one of the 20 types above
- `created` (required) — ISO date
- `status` — type-specific enum
- `tags` — list of tags
- `related` — list of wikilinks to other records
- `relationships` — list of wikilinks with semantic meaning

List fields (always arrays): `tags`, `aliases`, `related`, `relationships`, `participants`, `outputs`, `depends_on`, `blocked_by`, `based_on`, `supports`, `challenged_by`, `approved_by`, `confirmed_by`, `invalidated_by`, `cluster_sources`, `governed_by`, `references`, `project`

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

If the record types or statuses listed above seem outdated (e.g., a vault command rejects a type), query Alfred's live schema from inside the container:

```bash
/opt/alfred/bin/python3 -c "
from alfred.vault.schema import KNOWN_TYPES, STATUS_BY_TYPE
import json
print(json.dumps({
  'types': sorted(KNOWN_TYPES),
  'statuses': {k: sorted(v) for k, v in STATUS_BY_TYPE.items()}
}, indent=2))
"
```

This always reflects the installed version of Alfred, regardless of when this skill file was last synced.

To check the installed version:

```bash
/opt/alfred/bin/python3 -c "from importlib.metadata import version; print(version('alfred-vault'))"
```

To discover available CLI commands:

```bash
alfred --help
alfred vault --help
```

## Tips

- Use `alfred vault context` first to understand what's in the vault before searching
- Use `alfred vault search --grep` for fuzzy content search
- Wikilinks use the format `[[type/Record Name]]` (e.g., `[[person/Alice Smith]]`)
- When creating records, always set `status` — it's validated per type
- The vault is a shared resource — Alfred's background workers (Curator, Janitor, Distiller, Surveyor) also maintain it
