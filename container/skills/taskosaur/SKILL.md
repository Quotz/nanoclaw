---
name: taskosaur
description: Manage tasks, projects, sprints, and labels on the Taskosaur project management app. Use whenever the user asks about tasks, to-dos, projects, sprints, boards, or work tracking.
allowed-tools: Bash(node:*)
---

# Taskosaur — Project Management

Control the Taskosaur project management instance. Full CRUD for tasks, projects, sprints, labels, time entries, and more.

## Prerequisites

The following env vars must be set in the container (injected automatically by NanoClaw from `.env`):
- `TASKOSAUR_URL` — API base URL (e.g. `https://taskosaur.example.com/api`)
- `TASKOSAUR_EMAIL` — bot account email
- `TASKOSAUR_PASSWORD` — bot account password

If you get "TASKOSAUR_URL not set", the credentials are missing from `.env`.

## CLI tool

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs <action> ['{"key":"value"}']
```

Arguments are passed as a single JSON string. Omit the JSON arg for actions that need no parameters.

## First use — get context

Always start with `context` to discover org, workspace, project, status, sprint, and label IDs:

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs context
```

Cache the IDs you need — avoid calling `context` repeatedly.

## Common workflows

### List and search tasks

```bash
# All tasks in a project
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-list '{"projectId":"<id>"}'

# Tasks due today
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-today

# Search
node /home/node/.claude/skills/taskosaur/taskosaur.mjs search '{"query":"bug fix"}'

# Tasks grouped by status
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-by-status '{"projectId":"<id>"}'
```

### Create a task

Requires `title`, `projectId`, and `statusId` (get these from `context`):

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-create '{"title":"Fix login bug","projectId":"<id>","statusId":"<id>","priority":"HIGH","description":"Users can't login with SSO"}'
```

Optional fields: `type` (default TASK), `priority` (NONE/LOW/MEDIUM/HIGH/URGENT), `description`, `dueDate`, `startDate`, `sprintId`, `assigneeIds`, `parentTaskId`, `storyPoints`.

### Update tasks

```bash
# Update fields
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-update '{"id":"<id>","title":"New title","description":"Updated"}'

# Quick status/priority changes
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-set-status '{"id":"<id>","statusId":"<statusId>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-set-priority '{"id":"<id>","priority":"HIGH"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-set-due-date '{"id":"<id>","dueDate":"2026-04-10"}'
```

### Bulk operations

```bash
# Create multiple tasks
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-bulk-create '{"tasks":[{"title":"Task 1","projectId":"<id>","statusId":"<id>"},{"title":"Task 2","projectId":"<id>","statusId":"<id>"}]}'

# Delete multiple
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-bulk-delete '{"taskIds":["<id1>","<id2>"]}'
```

### Projects

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs project-list '{"workspaceId":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs project-create '{"name":"New Project","workspaceId":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs project-stats '{"slug":"<slug>"}'
```

### Sprints

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs sprint-list '{"projectId":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs sprint-active '{"projectId":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs sprint-create '{"name":"Sprint 1","projectId":"<id>","startDate":"2026-04-07","endDate":"2026-04-21"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs sprint-start '{"id":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs sprint-complete '{"id":"<id>"}'
```

### Labels

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs label-list '{"projectId":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs label-create '{"name":"bug","color":"#FF0000","projectId":"<id>"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs label-assign '{"taskId":"<id>","labelId":"<id>"}'
```

### Time tracking

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs time-create '{"taskId":"<id>","duration":3600,"description":"Code review"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs time-list '{"taskId":"<id>"}'
```

## All available actions

Run `node /home/node/.claude/skills/taskosaur/taskosaur.mjs --help` for the full list.

| Category | Actions |
|----------|---------|
| Discovery | `context`, `me` |
| Orgs | `org-list`, `org-get`, `org-stats`, `org-update`, `org-members` |
| Workspaces | `workspace-list`, `workspace-get`, `workspace-create`, `workspace-update`, `workspace-delete`, `workspace-archive`, `workspace-unarchive`, `workspace-members`, `workspace-recent` |
| Projects | `project-list`, `project-get`, `project-create`, `project-update`, `project-delete`, `project-archive`, `project-unarchive`, `project-members`, `project-stats` |
| Statuses | `status-list`, `status-create`, `status-update`, `status-delete`, `status-reorder` |
| Tasks | `task-list`, `task-all`, `task-get`, `task-today`, `task-by-status`, `task-create`, `task-update`, `task-set-status`, `task-set-priority`, `task-set-due-date`, `task-set-assignees`, `task-unassign`, `task-delete`, `task-bulk-delete`, `task-bulk-create`, `task-add-recurrence`, `task-update-recurrence`, `task-remove-recurrence` |
| Sprints | `sprint-list`, `sprint-get`, `sprint-active`, `sprint-create`, `sprint-update`, `sprint-delete`, `sprint-start`, `sprint-complete`, `sprint-archive` |
| Labels | `label-list`, `label-create`, `label-update`, `label-delete`, `label-assign`, `label-unassign`, `label-bulk-assign`, `labels-by-task` |
| Members | `members-list`, `members-invite` |
| Users | `user-list`, `user-get` |
| Time | `time-list`, `time-create`, `time-update`, `time-delete` |
| Notifications | `notif-list`, `notif-mark-read`, `notif-mark-all-read` |
| Search | `search` |

## Known limitations

The following endpoints are not available in the current Taskosaur deployment:
- **Comments** (`task-comment`, `task-comments`) — returns 500/404
- **Activity logs** (`activity-list`) — endpoint not found

These actions are still in the CLI tool but will error if called. They may become available in a future Taskosaur update.

## Response format

All responses are JSON. When presenting to the user, format as readable text — don't dump raw JSON. Summarize task lists as bullet points with title, status, priority, and assignee.

## Task references

Tasks have both `id` (UUID) and `key` (human-readable like `PROJ-42`). Use `task-get` with either:

```bash
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-get '{"key":"PROJ-42"}'
node /home/node/.claude/skills/taskosaur/taskosaur.mjs task-get '{"id":"<uuid>"}'
```
