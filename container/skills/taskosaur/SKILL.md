---
name: taskosaur
description: >-
  Taskosaur project management — REST API reference for the running self-hosted
  instance. Use this skill when you need to know what a Taskosaur endpoint
  accepts, what fields a write expects, what an error means, or what's available
  beyond the curated MCP tool surface. You access Taskosaur via mcp__taskosaur__*
  tools (PRE-AUTHENTICATED via the host bridge) — this skill is purely a
  reference for understanding the underlying API.
metadata:
  source: /api/docs-json (OpenAPI 3.0) on https://taskosaur.815431624.xyz
  version: regenerated 2026-05-28
---

# Taskosaur — API reference (for understanding what the MCP tools do)

You already have `mcp__taskosaur__*` tools wired through a host-side bridge.
The bridge holds Pero's credentials — **never ask Andrey for a Taskosaur
key, never present a OneCLI connect URL for Taskosaur**, and never try to
hit the Taskosaur API directly with curl unless you've thought about why
the MCP tool isn't sufficient. The MCP tools are the right path 99% of the
time.

This skill exists so you can:

1. **Interpret error messages.** If a tool call fails with "Project not
   found" or a 500, this reference tells you what the underlying endpoint
   expects.
2. **Discover what's possible.** The bridge exposes 28 tools, but the API
   has 200+ endpoints. If Andrey asks for something not in the tool list
   (e.g. setting up an automation rule, configuring a Gantt view, importing
   tasks from CSV), check `api-reference.md` to see if the endpoint exists,
   then tell Andrey it would need to be added to the bridge.
3. **Look up exact field names/types.** When a write call complains about
   a missing field, this is faster than guessing.

## Files in this skill

- **`api-reference.md`** — concise summary of all 236 paths, grouped by domain
  (auth, organizations, workspaces, projects, tasks, sprints, comments, etc.),
  with required params, body shapes, and named schema references.
- **`openapi.json`** — full OpenAPI 3.0 spec from the running app, ~210KB.
  Use this only when `api-reference.md` lacks detail you need (e.g. full
  property descriptions or all enum values).
- **`mcp-quirks.md`** — known upstream bugs and how the bridge compensates
  for them. Read this if a tool call returns an unexpected error.

## How to navigate

- For "what does this tool do?" or "what does this endpoint take?" →
  grep `api-reference.md` for the endpoint path or method name.
- For "what fields does Schema X have?" → grep `openapi.json` for the
  schema name; the `properties` object lists all fields with types and
  descriptions.
- For "why did this tool call fail?" → check `mcp-quirks.md` first; then
  read the response error verbatim and cross-check against the endpoint
  in `api-reference.md`.

## Don't

- Don't paste API responses back to Andrey verbatim — summarize.
- Don't call the API outside the bridge unless you've checked the MCP
  tool list first and confirmed the operation truly isn't exposed.
- Don't treat this reference as gospel — it's regenerated periodically
  from the running app's OpenAPI spec. If a field is missing here but
  present in `openapi.json`, trust the spec.
