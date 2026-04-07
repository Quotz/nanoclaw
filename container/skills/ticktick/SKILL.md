---
name: ticktick
description: Access and manage the user's TickTick tasks, lists, and projects via the hosted TickTick MCP server. Use when the user mentions todos, task lists, deadlines, "what's on my list", or wants to create, update, complete, or move tasks.
---

# TickTick

You have access to the user's TickTick account via the hosted TickTick MCP server at `https://mcp.ticktick.com`. Use it whenever the user wants to read or manage their task list, not WebFetch or generic search.

## When to Use

- User asks what's on their list, what's due today/tomorrow/this week
- User wants to create a new task, complete/delete an existing one, or move tasks between lists
- User mentions TickTick by name
- User talks about "todos", "tasks", or "my list" in a context that implies their personal task system
- You need to check a deadline the user has mentioned before

## When NOT to Use

- Scheduling calendar events — that's a separate system
- Note-taking or general knowledge — use the vault/knowledge-search tools instead
- Reminders that aren't tied to a task — those belong in the user's reminder app
- Work-log or journal entries — those go in Alfred/Obsidian

## Available Tool Categories

TickTick exposes tools in three categories (discovered at runtime — specific names vary):

- **Task Queries** — fetch tasks by list, priority, due date, status, search term
- **List Queries** — enumerate the user's lists/projects and inspect their contents
- **Task Management** — create, update, complete, delete, and move tasks between lists

You do not need to memorise tool names. The agent SDK surfaces them automatically; pick the one whose description matches the user's request.

## How to Respond

- **Format results as bullets, not raw JSON.** One bullet per task. Include title, due date, and (if the user asked) priority.
- **Show due dates relatively** when close: "today", "tomorrow", "this Friday". Use absolute dates for things further out.
- **Group by list** when returning more than 5 tasks from multiple lists.
- **Don't expose task IDs** unless the user specifically asks — they're internal.
- **Confirm destructive actions** before calling complete/delete tools: "I'll mark 'Buy milk' as done — confirm?"
- **For bulk requests** ("add these three tasks"), create them one call at a time so partial failures are visible.

## Known Limitations

- TickTick MCP currently supports basic task, list, and project operations only. Habit tracking, Pomodoro sessions, and the Eisenhower matrix are NOT exposed.
- The server is hosted by TickTick, so TickTick outages and network blips will surface as connection errors.
- Authentication is via long-lived Bearer token stored in `.env` — if you see `401 Unauthorized`, the user needs to rotate the token via https://ticktick.com → avatar → Settings → Account → API Token.

## Reference

- TickTick MCP docs: https://help.ticktick.com/articles/7438129581631995904
