---
name: knowledge-search
description: Search across the user's knowledge base — work logs, past conversations, structured knowledge, and project notes. Use whenever you need context from before the current session.
---

# Knowledge Search (QMD)

You have access to a QMD search engine that indexes the user's files. Use it to find relevant context before answering questions about past work, decisions, projects, or anything discussed previously.

## When to Search

- User asks about something from a past conversation or work session
- You need context about a project, decision, or task mentioned before
- User references a person, meeting, or event you don't have in current context
- Before making recommendations that should account for prior decisions

## Available MCP Tools

### `query` — Primary search (use this most often)

Searches across all indexed collections using hybrid retrieval (keyword + semantic + LLM reranking).

Parameters:
- `query` (string, required) — natural language search query
- `collection` (string, optional) — limit to a specific collection
- `limit` (number, optional) — max results (default: 10)

The query supports sub-query types:
- `lex:` prefix for keyword-only search (fast, precise)
- `vec:` prefix for semantic-only search (finds conceptual matches)
- Default (no prefix) uses hybrid search (best quality)

### `get` — Retrieve a specific document

Fetch full content by path or document ID (6-char hash shown in search results).

Parameters:
- `path` (string) — file path or docid

### `multi_get` — Batch retrieve

Fetch multiple documents at once.

Parameters:
- `paths` (string) — comma-separated paths or glob pattern

### `status` — Index health

Check what collections are indexed, document counts, and index health.

## Collections

Results include collection context that tells you where information came from:

| Collection | Contains |
|------------|----------|
| `workspace` | User's work logs and notes written in Obsidian |
| `conversations` | Archived transcripts from past agent sessions |
| `group-memory` | Per-group memory files maintained by the agent |
| `memory` | Cog-native memory — hot memory, observations, entities, action items, threads, glacier archives |

Not all collections may be configured — check `status` if unsure.

## Tips

- Keep queries concise and specific: "pricing decision for Project X" not "what did we talk about"
- Use `collection` filter when you know where to look
- Search results include file paths — use `get` to read full context if a snippet is relevant
- Don't search for things you already have in current session context
