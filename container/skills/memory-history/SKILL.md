---
name: memory-history
description: Deep search across all memory files to recall past information. Trigger when the user says "what did I say about...", "when did we discuss...", "find that conversation about...", "history of...", or asks about past information that needs multi-file search.
---

# Memory History

Deep memory search — recursive across all memory files, cross-referencing observations, entities, action items, and glacier archives. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog).

**Relationship to QMD:** For fuzzy or conceptual queries, use the QMD MCP `query` tool first — its hybrid search (BM25 + vectors + LLM rerank) is typically better. Use this skill when QMD returns nothing, when you need to piece together a chronological narrative from multiple files, or when the user specifically asks for a "history" or "timeline".

## Vault Location

`/workspace/extra/memory` inside the container.

## Memory Files

**Read on activation:**
- `hot-memory.md` (for context on what's currently relevant)
- `link-index.md` (to discover which files connect)

**Search across:**
- All `observations.md` files (personal, work domains, cog-meta)
- All `entities.md` files
- All `action-items.md` files
- All `hot-memory.md` files
- `threads/*.md` files in every domain
- `glacier/index.md` (for targeted archive retrieval — don't scan all glacier files)

## Process

### Pass 1: Locate

1. Extract keywords from the user's query (names, topics, dates, phrases)
2. Try QMD first (if available): call the `query` MCP tool with the user's natural language query
3. If QMD returns good hits, skip to Pass 2 with those files
4. Otherwise, fall back to grep: `grep -rn "<keyword>" /workspace/extra/memory/ --include="*.md" --exclude-dir=glacier`
5. Note which files matched and how many hits
6. If >10 files match, narrow by domain or add query terms
7. If 0 matches, try synonyms or related terms
8. Check `glacier/index.md` for archived data matching the query

### Pass 2: Extract

1. Read the top 3-5 most relevant files (by hit density and recency)
2. Extract the specific passages that match the query
3. Track the timeline: when did the topic first come up? How did it evolve?

### Pass 3: Synthesize

1. Combine extracted passages into a coherent answer
2. Present findings chronologically with dates
3. If something seems incomplete, flag it:
   > "Found references to X in observations but no entity entry — want me to create one?"
4. Cite the specific files and line numbers you drew from

## Artifact Formats

- **Search result**: `YYYY-MM-DD: <summary of what was found> ([[source-file]])`
- **Memory gap**: `Gap: referenced but not in memory — <topic>`
- **Timeline**: Chronological list of when a topic appeared and how it evolved

## Activation

Extract search terms from the user's query and begin Pass 1. Prefer QMD for fuzzy queries; fall back to grep for exact matches. Be thorough but concise in the synthesis — don't dump raw content.
