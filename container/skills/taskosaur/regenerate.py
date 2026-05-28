#!/usr/bin/env python3
"""Generate a structured markdown reference from Taskosaur's OpenAPI spec.
Goal: optimize for Pero's grep-ability and skim cost, not for completeness
of every schema detail (the raw openapi.json is shipped alongside for that).

Usage:
  cd /opt/nanoclaw/container/skills/taskosaur
  curl -s https://taskosaur.815431624.xyz/api/docs-json > openapi.json
  python3 regenerate.py > api-reference.md
"""
import json, re, sys, collections, os

SPEC = json.load(open('openapi.json'))
paths = SPEC.get('paths', {})
schemas = SPEC.get('components', {}).get('schemas', {})

# Group endpoints by the first path segment after /api
groups = collections.OrderedDict()
GROUP_ORDER = [
  'auth', 'organizations', 'organization-members', 'workspaces', 'workspace-members',
  'projects', 'project-members', 'tasks', 'sprints', 'comments', 'task-statuses',
  'labels', 'workflows', 'gantt', 'activity-logs', 'notifications', 'automation',
  'invitations', 'email-templates', 'ai-chat', 'health', 'users', 'public',
]

def group_for(path):
  m = re.match(r'^/api/([a-z\-]+)', path)
  return m.group(1) if m else 'other'

for p, methods in paths.items():
  g = group_for(p)
  groups.setdefault(g, []).append((p, methods))

# Reorder groups
ordered = collections.OrderedDict()
for g in GROUP_ORDER:
  if g in groups:
    ordered[g] = groups.pop(g)
for g in sorted(groups):
  ordered[g] = groups[g]

def resolve_ref(ref):
  if not ref or not ref.startswith('#/components/schemas/'):
    return None
  return schemas.get(ref.split('/')[-1])

def schema_summary(schema, depth=0):
  """One-line summary of a schema's required fields and types."""
  if not schema:
    return ''
  if '$ref' in schema:
    r = resolve_ref(schema['$ref'])
    if r and depth < 2:
      return schema_summary(r, depth+1)
    return schema['$ref'].split('/')[-1]
  t = schema.get('type')
  if t == 'object':
    props = schema.get('properties', {})
    req = set(schema.get('required', []))
    parts = []
    for name, sub in list(props.items())[:12]:
      mark = '*' if name in req else ''
      tt = sub.get('type') or ('$' + sub['$ref'].split('/')[-1] if '$ref' in sub else '?')
      enum = sub.get('enum')
      if enum and len(enum) <= 6:
        tt = '|'.join(map(str, enum))
      fmt = sub.get('format')
      if fmt == 'date-time' or fmt == 'date':
        tt = fmt
      if sub.get('type') == 'array':
        item = sub.get('items', {})
        it = item.get('type') or ('$' + item['$ref'].split('/')[-1] if '$ref' in item else '?')
        tt = f'[{it}]'
      parts.append(f'{name}{mark}:{tt}')
    if len(props) > 12:
      parts.append(f'… ({len(props)-12} more)')
    return '{' + ', '.join(parts) + '}'
  if t == 'array':
    item = schema.get('items', {})
    if '$ref' in item:
      return f"[{item['$ref'].split('/')[-1]}]"
    return f"[{item.get('type','?')}]"
  return t or '?'

def body_summary(op):
  rb = op.get('requestBody')
  if not rb:
    return ''
  content = rb.get('content', {})
  for ct in ('application/json', 'multipart/form-data'):
    if ct in content:
      sch = content[ct].get('schema', {})
      if '$ref' in sch:
        r = resolve_ref(sch['$ref'])
        return schema_summary(r) if r else sch['$ref'].split('/')[-1]
      return schema_summary(sch)
  return list(content.keys())[0] if content else ''

def param_summary(params):
  if not params:
    return ''
  parts = []
  for p in params:
    name = p.get('name', '?')
    where = p.get('in', '?')
    req = '*' if p.get('required') else ''
    sch = p.get('schema', {})
    t = sch.get('type') or ('$' + sch['$ref'].split('/')[-1] if '$ref' in sch else '?')
    parts.append(f'{name}{req}@{where}:{t}')
  return ' '.join(parts)

out = []
out.append('# Taskosaur REST API reference\n')
out.append('Auto-generated from `/api/docs-json` (OpenAPI 3.0) — schema details may lag the running app slightly. The raw spec is shipped alongside as `openapi.json` for cases where this summary is not enough.\n')
out.append('## How Pero reads this\n')
out.append('You normally call Taskosaur through `mcp__taskosaur__*` tools, NOT directly. This reference exists so you can:\n')
out.append('- Interpret error messages from the bridge (which proxies these endpoints)')
out.append('- Discover what features exist beyond the curated tool surface (request bridge additions if needed)')
out.append('- Look up exact field names/types when the bridge tool description is ambiguous\n')
out.append('Schema shorthand used below: `field*` = required; `[type]` = array; `|` between values = enum literals; `$Name` = reference to a named schema in `openapi.json`.\n')
out.append('## Quirks / things to know (also see `mcp-quirks.md`)\n')
out.append('- `POST /api/sprints` — body field is `projectSlug` (DTO was renamed from the buggy `projectId` in the 2026-05 upstream). The bridge accepts UUID OR slug for its input field and resolves UUID→slug before sending.')
out.append('- `POST /api/tasks/{id}/comments` — request body is `{comment: "..."}` (controller binds `@Body(\'comment\')`). The bridge maps its `content` input field to `comment` on the wire.')
out.append('- `GET /api/workspaces` and `GET /api/projects` (top-level) require explicit scope query params (`organizationId=...` / similar) or return 400/403. Use the `*-by-organization` variants the bridge uses.\n')

# Group section
for g, items in ordered.items():
  out.append(f'\n## {g}\n')
  # Sort by path then method
  items.sort(key=lambda x: x[0])
  for path, methods in items:
    for method, op in methods.items():
      if method.upper() not in ('GET','POST','PUT','PATCH','DELETE'):
        continue
      summary = op.get('summary', '').strip()
      params = op.get('parameters', [])
      body = body_summary(op)
      param_line = param_summary(params)
      line = f'- **{method.upper()} `{path}`**'
      if summary:
        line += f' — {summary}'
      out.append(line)
      if param_line:
        out.append(f'  - params: `{param_line}`')
      if body:
        out.append(f'  - body: `{body}`')
      # responses — just list 2xx schema name if obvious
      responses = op.get('responses', {})
      ok = responses.get('200') or responses.get('201')
      if ok:
        content = ok.get('content', {}).get('application/json', {}).get('schema', {})
        if '$ref' in content:
          out.append(f"  - returns: `${content['$ref'].split('/')[-1]}`")
        elif content.get('type') == 'array':
          item = content.get('items', {})
          if '$ref' in item:
            out.append(f"  - returns: `[${item['$ref'].split('/')[-1]}]`")

# Schema index at the end
out.append('\n## Schemas (referenced above as `$Name`)\n')
out.append('Brief shape of each named schema. For full property docs/descriptions, see `openapi.json`.\n')
for name, sch in sorted(schemas.items()):
  out.append(f'- **`{name}`** — `{schema_summary(sch)}`')

print('\n'.join(out))
