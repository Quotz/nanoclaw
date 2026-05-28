# Taskosaur REST API reference

Auto-generated from `/api/docs-json` (OpenAPI 3.0) — schema details may lag the running app slightly. The raw spec is shipped alongside as `openapi.json` for cases where this summary is not enough.

## How Pero reads this

You normally call Taskosaur through `mcp__taskosaur__*` tools, NOT directly. This reference exists so you can:

- Interpret error messages from the bridge (which proxies these endpoints)
- Discover what features exist beyond the curated tool surface (request bridge additions if needed)
- Look up exact field names/types when the bridge tool description is ambiguous

Schema shorthand used below: `field*` = required; `[type]` = array; `|` between values = enum literals; `$Name` = reference to a named schema in `openapi.json`.

## Known bugs / workarounds (also see `mcp-quirks.md`)

- `POST /api/sprints` — DTO field is named `projectId` but the controller does `findUnique({ where: { slug: <projectId> } })`. The bridge auto-resolves UUID→slug. If you ever shell into the API directly, pass the project SLUG here.
- `POST /api/tasks/{id}/comments` — request body must be `{comment: "..."}`, not `{content: "..."}` (controller binds `@Body('comment')`). The bridge already maps this.
- `GET /api/workspaces` and `GET /api/projects` (top-level) require explicit scope query params (`organizationId=...` / similar) or return 400/403.


## auth

- **GET `/api/auth/access-control`** — Get user access for a specific resource
  - params: `scope*@query:string id*@query:string`
- **POST `/api/auth/forgot-password`** — Send password reset email
  - body: `{email*:string}`
- **POST `/api/auth/login`** — User login
  - body: `{email*:string, password*:string}`
  - returns: `$AuthResponseDto`
- **POST `/api/auth/logout`** — User logout
- **GET `/api/auth/profile`** — Get current user profile
- **POST `/api/auth/refresh`** — Refresh access token
  - body: `{refresh_token*:string}`
  - returns: `$AuthResponseDto`
- **POST `/api/auth/register`** — User registration
  - body: `{email*:string, password*:string, firstName*:string, lastName*:string, username:string}`
  - returns: `$AuthResponseDto`
- **POST `/api/auth/reset-password`** — Reset user password with token
  - body: `{token*:string, password*:string, confirmPassword*:string}`
- **POST `/api/auth/setup`** — Setup super admin user (first-time setup only)
  - body: `{email*:string, password*:string, firstName*:string, lastName*:string, username:string}`
- **GET `/api/auth/setup/required`** — Check if system setup is required
- **GET `/api/auth/verify-reset-token/{token}`** — Verify password reset token
  - params: `token*@path:string`
  - returns: `$VerifyResetTokenResponseDto`

## organizations

- **POST `/api/organizations`** — Create organization
  - body: `{name*:string, description:string, avatar:string, website:string, settings:object, ownerId*:string, defaultWorkspace:?, defaultProject:?}`
- **GET `/api/organizations`** — List organizations
- **PATCH `/api/organizations/archive/{id}`** — Archive organization
  - params: `id*@path:string`
- **GET `/api/organizations/slug/{slug}`**
  - params: `slug*@path:string`
- **GET `/api/organizations/universal-search`** — Universal search within organization
  - params: `q*@query:string organizationId*@query:string page@query:number limit@query:number`
- **PATCH `/api/organizations/{id}`**
  - params: `id*@path:string`
  - body: `{slug:string}`
- **DELETE `/api/organizations/{id}`** — Delete organization
  - params: `id*@path:string`
- **GET `/api/organizations/{id}`**
  - params: `id*@path:string`
- **GET `/api/organizations/{id}/charts`** — Get organization charts data
  - params: `id*@path:string types*@query:array workspaceId@query:string projectId@query:string`
- **GET `/api/organizations/{id}/stats`** — Get organization statistics
  - params: `id*@path:string`

## organization-members

- **POST `/api/organization-members`** — Add a member to an organization
  - body: `{userId*:string, organizationId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **GET `/api/organization-members`** — Get all organization members
  - params: `organizationId@query:string search@query:string`
- **POST `/api/organization-members/invite`** — Invite a user to organization by email
  - body: `{email*:string, organizationId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **GET `/api/organization-members/organization/{organizationId}/stats`** — Get organization member statistics
  - params: `organizationId*@path:string`
- **PATCH `/api/organization-members/set-default`** — Set a default organization for a user
  - params: `organizationId*@query:string`
- **GET `/api/organization-members/slug`** — Get organization members by organization slug
  - params: `slug@query:string page@query:string limit@query:string search@query:string`
- **GET `/api/organization-members/user/{userId}/organization/{organizationId}`** — Get membership for a specific user and organization
  - params: `userId*@path:string organizationId*@path:string`
- **GET `/api/organization-members/user/{userId}/organizations`** — Get all organizations for a user
  - params: `userId*@path:string`
- **PATCH `/api/organization-members/{id}`** — Update organization member role
  - params: `id*@path:string`
  - body: `{userId:string, organizationId:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER, isDefault:boolean}`
- **DELETE `/api/organization-members/{id}`** — Remove a member from organization
  - params: `id*@path:string`
- **GET `/api/organization-members/{id}`** — Get organization member by ID
  - params: `id*@path:string`

## workspaces

- **POST `/api/workspaces`** — Create a new workspace
  - body: `{name*:string, slug*:string, description:string, avatar:string, color:string, settings:object, organizationId*:string}`
- **GET `/api/workspaces`** — Get all workspaces
  - params: `organizationId@query:string search@query:string`
- **PATCH `/api/workspaces/archive/{id}`** — Archive a workspace
  - params: `id*@path:string`
- **GET `/api/workspaces/archived`** — Get archived workspaces for an organization
  - params: `organizationId*@query:string`
- **GET `/api/workspaces/organization/{organizationId}/slug/{slug}`** — Get workspace by organization ID and slug
  - params: `organizationId*@path:string slug*@path:string`
- **GET `/api/workspaces/organization/{organizationId}/workspace/{slug}/charts`** — Get workspace charts data
  - params: `organizationId*@path:string slug*@path:string types*@query:array`
- **GET `/api/workspaces/recent/{workspaceId}`** — Get recent activity for workspace
  - params: `workspaceId*@path:string limit*@query:string page*@query:string`
- **GET `/api/workspaces/search`** — Search workspaces without pagination
  - params: `organizationId*@query:string search*@query:string`
- **GET `/api/workspaces/search/paginated`** — Search workspaces with pagination
  - params: `organizationId*@query:string search*@query:string page*@query:string limit*@query:string`
- **PATCH `/api/workspaces/unarchive/{id}`** — Unarchive a workspace
  - params: `id*@path:string`
- **GET `/api/workspaces/{id}`** — Get workspace by ID
  - params: `id*@path:string`
- **PATCH `/api/workspaces/{id}`** — Update a workspace
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/workspaces/{id}`** — Delete a workspace
  - params: `id*@path:string`

## workspace-members

- **POST `/api/workspace-members`** — Add a member to a workspace
  - body: `{}`
- **GET `/api/workspace-members`** — Get all workspace members
  - params: `workspaceId@query:string search@query:string page@query:string limit@query:string`
- **POST `/api/workspace-members/invite`** — Invite a user to workspace by email
  - body: `{}`
- **GET `/api/workspace-members/user/{userId}/workspace/{workspaceId}`** — Get membership for a specific user and workspace
  - params: `userId*@path:string workspaceId*@path:string`
- **GET `/api/workspace-members/user/{userId}/workspaces`** — Get all workspaces for a user
  - params: `userId*@path:string`
- **GET `/api/workspace-members/workspace/{workspaceId}/stats`** — Get workspace member statistics
  - params: `workspaceId*@path:string`
- **GET `/api/workspace-members/{id}`** — Get workspace member by ID
  - params: `id*@path:string`
- **PATCH `/api/workspace-members/{id}`** — Update workspace member role
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/workspace-members/{id}`** — Remove a member from workspace
  - params: `id*@path:string`

## projects

- **POST `/api/projects`** — Create a new project
  - body: `{name*:string, slug*:string, taskPrefix:string, color*:string, avatar*:string, description:string, status:PLANNING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED, priority:LOW|MEDIUM|HIGH|URGENT, startDate:date-time, endDate:date-time, settings:object, workspaceId:string, … (2 more)}`
- **GET `/api/projects`** — Get all projects
  - params: `workspaceId@query:string status@query:string priority@query:string search@query:string pageSize@query:? page@query:?`
- **PATCH `/api/projects/archive/{id}`** — Archive a project
  - params: `id*@path:string`
- **GET `/api/projects/archived`** — Get archived projects for a workspace or organization
  - params: `workspaceId@query:string organizationId@query:string`
- **GET `/api/projects/by-organization`** — Get projects by organization
  - params: `organizationId*@query:string workspaceId@query:string status@query:string priority@query:string page@query:string pageSize@query:string search@query:string`
- **GET `/api/projects/by-slug/{slug}`** — Get project by slug
  - params: `slug*@path:string`
- **GET `/api/projects/search`** — Search projects without pagination
  - params: `workspaceId*@query:string organizationId*@query:string search*@query:string`
- **GET `/api/projects/search/paginated`** — Search projects with pagination
  - params: `workspaceId*@query:string organizationId*@query:string search*@query:string page*@query:string limit*@query:string`
- **PATCH `/api/projects/unarchive/{id}`** — Unarchive a project (fails if parent workspace is archived)
  - params: `id*@path:string`
- **GET `/api/projects/workspace/{workspaceId}/key/{key}`** — Find project by workspace and key
  - params: `workspaceId*@path:string key*@path:string`
- **GET `/api/projects/{id}`** — Get project by ID
  - params: `id*@path:string`
- **PATCH `/api/projects/{id}`** — Update a project
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/projects/{id}`** — Delete a project
  - params: `id*@path:string`
- **POST `/api/projects/{projectId}/inbox`** — Create inbox for project
  - params: `projectId*@path:string`
  - body: `{name*:string, description:string, emailAddress:string, emailSignature:string, autoReplyEnabled:boolean, autoReplyTemplate:string, syncInterval:string, autoCreateTask:boolean, defaultTaskType:TASK|BUG|EPIC|STORY|SUBTASK, defaultPriority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, defaultStatusId:string, defaultAssigneeId:string, … (7 more)}`
- **GET `/api/projects/{projectId}/inbox`** — Get inbox configuration
  - params: `projectId*@path:string`
- **PUT `/api/projects/{projectId}/inbox`** — Update inbox configuration
  - params: `projectId*@path:string`
  - body: `{name*:string, description:string, emailAddress:string, emailSignature:string, autoReplyEnabled:boolean, autoReplyTemplate:string, syncInterval:string, autoCreateTask:boolean, defaultTaskType:TASK|BUG|EPIC|STORY|SUBTASK, defaultPriority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, defaultStatusId:string, defaultAssigneeId:string, … (7 more)}`
- **PUT `/api/projects/{projectId}/inbox/email-account`** — Setup or update email account
  - params: `projectId*@path:string`
  - body: `{emailAddress*:string, displayName:string, imapHost*:string, imapPort:number, imapUsername*:string, imapPassword*:string, imapUseSsl:boolean, imapTlsRejectUnauth:boolean, imapTlsMinVersion:string, imapServername:string, imapFolder:string, smtpHost*:string, … (7 more)}`
- **GET `/api/projects/{projectId}/inbox/messages`** — Get inbox messages
  - params: `projectId*@path:string status@query:string includeSpam@query:boolean fromEmail@query:string fromDate@query:string toDate@query:string search@query:string convertedOnly@query:boolean`
- **GET `/api/projects/{projectId}/inbox/messages/{messageId}`** — Get specific inbox message
  - params: `messageId*@path:string projectId*@path:?`
- **POST `/api/projects/{projectId}/inbox/messages/{messageId}/convert`** — Convert message to task
  - params: `messageId*@path:string projectId*@path:?`
- **POST `/api/projects/{projectId}/inbox/messages/{messageId}/ignore`** — Mark message as ignored
  - params: `messageId*@path:string projectId*@path:?`
- **GET `/api/projects/{projectId}/inbox/rules`** — Get inbox rules
  - params: `projectId*@path:string`
- **POST `/api/projects/{projectId}/inbox/rules`** — Create inbox rule
  - params: `projectId*@path:string`
  - body: `{name*:string, description:string, priority:number, enabled:boolean, conditions*:object, actions*:object, stopOnMatch:boolean}`
- **PUT `/api/projects/{projectId}/inbox/rules/{ruleId}`** — Update inbox rule
  - params: `ruleId*@path:string projectId*@path:?`
  - body: `{name*:string, description:string, priority:number, enabled:boolean, conditions*:object, actions*:object, stopOnMatch:boolean}`
- **DELETE `/api/projects/{projectId}/inbox/rules/{ruleId}`** — Delete inbox rule
  - params: `ruleId*@path:string projectId*@path:?`
- **POST `/api/projects/{projectId}/inbox/sync`** — Manually trigger email sync
  - params: `projectId*@path:string`
- **POST `/api/projects/{projectId}/inbox/test-email/{accountId}`** — Test email configuration
  - params: `accountId*@path:string projectId*@path:?`
- **GET `/api/projects/{slug}/charts`** — Get project charts data
  - params: `slug*@path:string types*@query:array`
- **GET `/api/projects/{slug}/charts/sprint-burndown/{sprintId}`** — Get sprint burndown data
  - params: `slug*@path:string sprintId*@path:string`

## project-members

- **POST `/api/project-members`** — Add a member to a project
  - body: `{userId*:string, projectId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **GET `/api/project-members`** — Get all project members
  - params: `projectId@query:string search@query:string page@query:string limit@query:string`
- **POST `/api/project-members/invite`** — Invite a user to project by email
  - body: `{email*:string, projectId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **GET `/api/project-members/project/{projectId}/stats`** — Get project member statistics
  - params: `projectId*@path:string`
- **GET `/api/project-members/user/{userId}/project/{projectId}`** — Get membership for a specific user and project
  - params: `userId*@path:string projectId*@path:string`
- **GET `/api/project-members/user/{userId}/projects`** — Get all projects for a user
  - params: `userId*@path:string`
- **GET `/api/project-members/workspace/{workspaceId}`** — Get all project members in a workspace
  - params: `workspaceId*@path:string`
- **GET `/api/project-members/{id}`** — Get project member by ID
  - params: `id*@path:string`
- **PATCH `/api/project-members/{id}`** — Update project member role
  - params: `id*@path:string`
  - body: `{role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **DELETE `/api/project-members/{id}`** — Remove a member from project
  - params: `id*@path:string`

## tasks

- **POST `/api/tasks`**
  - body: `{title*:string, description:string, type:TASK|BUG|EPIC|STORY|SUBTASK, priority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, startDate:date-time, dueDate:date-time, storyPoints:number, originalEstimate:number, remainingEstimate:number, customFields:object, projectId*:string, assigneeIds:[string], … (8 more)}`
- **GET `/api/tasks`** — Get all tasks with filters
  - params: `organizationId*@query:string projectId@query:string sprintId@query:string workspaceId@query:string parentTaskId@query:string assigneeIds*@query:string reporterIds*@query:string priorities@query:string statuses@query:string types@query:string search@query:string sortBy@query:string sortOrder@query:string limit@query:? page@query:?`
- **GET `/api/tasks/all-tasks`** — Get all tasks with filters (no pagination)
  - params: `organizationId*@query:string projectId@query:string sprintId@query:string workspaceId@query:string parentTaskId@query:string priorities@query:string statuses@query:string types@query:string search@query:string sortBy@query:string sortOrder@query:string`
- **POST `/api/tasks/bulk-create`** — Bulk create tasks from CSV import
  - body: `{projectId*:string, statusId*:string, sprintId:string, tasks*:[$BulkTaskItem]}`
- **POST `/api/tasks/bulk-delete`** — Bulk delete tasks
  - body: `{taskIds:[string], projectId:string, all:boolean, excludedIds:[string]}`
- **GET `/api/tasks/by-status`** — Get tasks grouped by status with pagination
  - params: `slug*@query:string sprintId@query:string includeSubtasks@query:boolean statusId@query:string page@query:number limit@query:number`
- **POST `/api/tasks/create-task-attachment`** — Create a new task
  - body: `{title*:string, description:string, type:TASK|BUG|STORY|EPIC|SUBTASK, priority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, startDate:date-time, dueDate:date-time, storyPoints:number, originalEstimate:number, remainingEstimate:number, customFields:object, projectId*:string, assigneeIds:[string], … (7 more)}`
- **GET `/api/tasks/key/{key}`**
  - params: `key*@path:string`
- **GET `/api/tasks/organization/{orgId}`**
  - params: `orgId*@path:string search*@query:string page*@query:string limit*@query:string`
- **GET `/api/tasks/recurring/project/{projectId}`** — Get all recurring tasks for a project
  - params: `projectId*@path:string`
- **GET `/api/tasks/today`** — Get today's tasks filtered by assignee/reporter and organization
  - params: `organizationId*@query:string page*@query:string limit*@query:string`
- **GET `/api/tasks/{id}`**
  - params: `id*@path:string`
- **PATCH `/api/tasks/{id}`**
  - params: `id*@path:string`
  - body: `{stopRecurrence:boolean}`
- **DELETE `/api/tasks/{id}`**
  - params: `id*@path:string`
- **PATCH `/api/tasks/{id}/assignees`**
  - params: `id*@path:string`
- **POST `/api/tasks/{id}/comments`**
  - params: `id*@path:string`
- **POST `/api/tasks/{id}/complete-occurrence`** — Complete current occurrence and generate next
  - params: `id*@path:string`
- **PATCH `/api/tasks/{id}/due-date`**
  - params: `id*@path:string`
- **PATCH `/api/tasks/{id}/priority`**
  - params: `id*@path:string`
- **POST `/api/tasks/{id}/recurrence`** — Add recurrence to task
  - params: `id*@path:string`
  - body: `{recurrenceType:DAILY|WEEKLY|MONTHLY|QUARTERLY|YEARLY|CUSTOM, interval:number, daysOfWeek:[number], endType:NEVER|ON_DATE|AFTER_OCCURRENCES}`
- **PATCH `/api/tasks/{id}/recurrence`** — Update recurrence configuration
  - params: `id*@path:string`
  - body: `{recurrenceType:DAILY|WEEKLY|MONTHLY|QUARTERLY|YEARLY|CUSTOM, interval:number, daysOfWeek:[number], dayOfMonth:number, monthOfYear:number, endType:NEVER|ON_DATE|AFTER_OCCURRENCES, endDate:date-time, occurrenceCount:number}`
- **DELETE `/api/tasks/{id}/recurrence`** — Stop task recurrence
  - params: `id*@path:string`
- **PATCH `/api/tasks/{id}/status`**
  - params: `id*@path:string`
- **PATCH `/api/tasks/{id}/unassign`**
  - params: `id*@path:string`
- **POST `/api/tasks/{taskId}/comments/{commentId}/send-email`** — Send comment as email reply
  - params: `taskId*@path:string commentId*@path:string`

## sprints

- **POST `/api/sprints`** — Create a new sprint
  - body: `{name*:string, goal:string, status:PLANNING|ACTIVE|COMPLETED|CANCELLED, startDate:date-time, endDate:date-time, projectId*:string}`
- **GET `/api/sprints`** — Get all sprints
  - params: `projectId@query:string status@query:string`
- **PATCH `/api/sprints/archive/{id}`** — Archive a sprint
  - params: `id*@path:string`
- **GET `/api/sprints/project/{projectId}/active`** — Get active sprint for a project
  - params: `projectId*@path:string`
- **GET `/api/sprints/slug`** — Get sprints by project slug
  - params: `slug@query:string status@query:string`
- **GET `/api/sprints/{id}`** — Get sprint by ID
  - params: `id*@path:string`
- **PATCH `/api/sprints/{id}`** — Update a sprint
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/sprints/{id}`** — Delete a sprint
  - params: `id*@path:string`
- **PATCH `/api/sprints/{id}/complete`** — Complete a sprint
  - params: `id*@path:string`
- **PATCH `/api/sprints/{id}/start`** — Start a sprint
  - params: `id*@path:string`

## task-statuses

- **POST `/api/task-statuses`** — Create a new task status
  - body: `{name*:string, color*:string, category*:?, position*:integer, workflowId*:string}`
- **GET `/api/task-statuses`** — Get all task statuses
  - params: `workflowId@query:string organizationId@query:string`
- **GET `/api/task-statuses/deleted`** — Get deleted task statuses
  - params: `workflowId@query:string`
- **POST `/api/task-statuses/from-project`** — Create task status from project configuration
  - body: `{}`
- **PATCH `/api/task-statuses/positions`** — Update task status positions
  - body: `{}`
- **GET `/api/task-statuses/project`** — Get task statuses by project slug
  - params: `projectId*@query:string`
- **GET `/api/task-statuses/{id}`** — Get task status by ID
  - params: `id*@path:string`
- **PATCH `/api/task-statuses/{id}`** — Update a task status
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/task-statuses/{id}`** — Delete a task status
  - params: `id*@path:string`
- **PATCH `/api/task-statuses/{id}/restore`** — Restore a deleted task status
  - params: `id*@path:string`

## labels

- **POST `/api/labels`** — Create a new label
  - body: `{name*:string, color*:string, description:string, projectId*:string}`
- **GET `/api/labels`** — Get all labels
  - params: `projectId@query:string`
- **POST `/api/labels/assign`** — Assign a label to a task
  - body: `{taskId*:string, labelId*:string}`
- **POST `/api/labels/assign-multiple`** — Assign multiple labels to a task
  - body: `{taskId*:string, labelIds*:[string]}`
- **GET `/api/labels/task/{taskId}`** — Get all labels for a task
  - params: `taskId*@path:string`
- **DELETE `/api/labels/task/{taskId}/label/{labelId}`** — Remove a label from a task
  - params: `taskId*@path:string labelId*@path:string`
- **GET `/api/labels/{id}`** — Get label by ID
  - params: `id*@path:string`
- **PATCH `/api/labels/{id}`** — Update a label
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/labels/{id}`** — Delete a label
  - params: `id*@path:string`

## workflows

- **POST `/api/workflows`** — Create a new workflow
  - body: `{name*:string, description:string, isDefault:boolean, organizationId*:string}`
- **GET `/api/workflows`** — Get all workflows
  - params: `organizationId@query:string`
- **GET `/api/workflows/organization/{organizationId}/default`** — Get default workflow for organization
  - params: `organizationId*@path:string`
- **GET `/api/workflows/slug`** — Get workflows by organization slug
  - params: `slug*@query:string`
- **GET `/api/workflows/{id}`** — Get workflow by ID
  - params: `id*@path:string`
- **PATCH `/api/workflows/{id}`** — Update a workflow
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/workflows/{id}`** — Delete a workflow
  - params: `id*@path:string`
- **PATCH `/api/workflows/{id}/set-default`** — Make workflow default for organization
  - params: `id*@path:string`

## gantt

- **GET `/api/gantt/project/{projectId}`** — Get Gantt chart data for a project
  - params: `projectId*@path:string`
- **GET `/api/gantt/project/{projectId}/resources`** — Get resource allocation for project
  - params: `projectId*@path:string`
- **GET `/api/gantt/sprint/{sprintId}`** — Get Gantt chart data for a sprint
  - params: `sprintId*@path:string`

## activity-logs

- **GET `/api/activity-logs/organization/{organizationId}/recent`** — Get recent activity for organization
  - params: `organizationId*@path:string limit@query:string page@query:string entityType@query:string userId@query:string`
- **GET `/api/activity-logs/organization/{organizationId}/stats`** — Get activity statistics for organization
  - params: `organizationId*@path:string days*@query:string`
- **GET `/api/activity-logs/task/{taskId}/activities`** — Get task activities
  - params: `taskId*@path:string limit*@query:string page*@query:string`

## notifications

- **GET `/api/notifications`** — Get user notifications
  - params: `isRead@query:string organizationId@query:string page@query:string limit@query:string type@query:?`
- **DELETE `/api/notifications/bulk`** — Delete multiple notifications
- **GET `/api/notifications/by-type/{type}`** — Get notifications by type
  - params: `page*@query:string limit*@query:string organizationId*@query:string`
- **PATCH `/api/notifications/mark-all-read`** — Mark all notifications as read
  - params: `organizationId*@query:string`
- **PATCH `/api/notifications/mark-all-unread-read`** — Mark all unread notifications as read
  - params: `organizationId*@query:string`
- **GET `/api/notifications/recent`** — Get recent notifications
  - params: `limit@query:string organizationId@query:string`
- **GET `/api/notifications/stats/summary`** — Get notification statistics
  - params: `organizationId*@query:string`
- **GET `/api/notifications/unread-count`** — Get unread notifications count
  - params: `organizationId@query:string`
- **GET `/api/notifications/user/{userId}/organization/{organizationId}`** — Get notifications by user and organization
  - params: `userId*@path:string organizationId*@path:string isRead@query:string startDate@query:string endDate@query:string page@query:string limit@query:string priority@query:? type@query:?`
- **GET `/api/notifications/{id}`** — Get notification by ID
  - params: `id*@path:string`
- **DELETE `/api/notifications/{id}`** — Delete notification
  - params: `id*@path:string`
- **PATCH `/api/notifications/{id}/read`** — Mark notification as read
  - params: `id*@path:string`

## automation

- **POST `/api/automation/rules`** — Create a new automation rule
  - body: `{name*:string, description:string, triggerType*:string, triggerConfig:object, actionType*:string, actionConfig:object, organizationId:string, workspaceId:string, projectId:string, createdBy*:string, status:ACTIVE|INACTIVE|DRAFT}`
- **GET `/api/automation/rules`** — Get all automation rules
  - params: `organizationId@query:string workspaceId@query:string projectId@query:string`
- **GET `/api/automation/rules/{id}`** — Get automation rule by ID
  - params: `id*@path:string`
- **PATCH `/api/automation/rules/{id}`** — Update automation rule
  - params: `id*@path:string`
  - body: `{name*:string, description:string, triggerType*:string, triggerConfig:object, actionType*:string, actionConfig:object, organizationId:string, workspaceId:string, projectId:string, createdBy*:string, status:ACTIVE|INACTIVE|DRAFT}`
- **DELETE `/api/automation/rules/{id}`** — Delete automation rule
  - params: `id*@path:string`
- **GET `/api/automation/rules/{id}/stats`** — Get rule execution statistics
  - params: `id*@path:string`
- **PATCH `/api/automation/rules/{id}/toggle`** — Toggle rule active/inactive status
  - params: `id*@path:string`

## invitations

- **POST `/api/invitations`** — Send invitation
  - body: `{}`
- **GET `/api/invitations/entity/{entityType}/{entityId}`** — Get pending and rejected invitations for an entity
  - params: `entityType*@path:string entityId*@path:string`
- **GET `/api/invitations/user`** — Get user invitations
- **GET `/api/invitations/verify/{token}`** — Verify invitation token
  - params: `token*@path:string`
- **DELETE `/api/invitations/{id}`** — Delete invitation
  - params: `id*@path:string`
- **POST `/api/invitations/{id}/resend`** — Resend invitation
  - params: `id*@path:string`
- **PATCH `/api/invitations/{token}/accept`** — Accept invitation
  - params: `token*@path:string`
- **PATCH `/api/invitations/{token}/decline`** — Decline invitation
  - params: `token*@path:string`

## email-templates

- **GET `/api/email-templates`** — Get all default email templates
  - params: `category@query:string search@query:string`
- **GET `/api/email-templates/categories`** — Get template categories
- **GET `/api/email-templates/variables`** — Get common template variables
- **GET `/api/email-templates/{id}`** — Get template by ID
  - params: `id*@path:string`

## ai-chat

- **POST `/api/ai-chat/chat`** — Send chat message to AI assistant
  - body: `{message*:string, history:[$ChatMessageDto], workspaceId:string, projectId:string, sessionId:string, currentOrganizationId:string}`
  - returns: `$ChatResponseDto`
- **DELETE `/api/ai-chat/context/{sessionId}`** — Clear conversation context for a session
  - params: `sessionId*@path:string`
- **POST `/api/ai-chat/generate-description`** — Generate a task description from a title using AI
  - body: `{title*:string, taskType:string}`
  - returns: `$GenerateDescriptionResponseDto`
- **POST `/api/ai-chat/test-connection`** — Test AI provider connection without requiring AI to be enabled
  - body: `{apiKey*:string, model*:string, apiUrl*:string}`
  - returns: `$TestConnectionResponseDto`

## health

- **GET `/api/health`**
- **GET `/api/health/queue`**

## users

- **POST `/api/users`** — Create a new user
  - body: `{email*:string, mobileNumber:string, username:string, firstName*:string, lastName*:string, password*:string, avatar:string, bio:string, timezone:string, language:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
  - returns: `$User`
- **GET `/api/users`** — Retrieve all users
  - returns: `[$User]`
- **POST `/api/users/change-password`** — Change current user password
  - body: `{currentPassword*:string, newPassword*:string, confirmPassword*:string}`
- **GET `/api/users/exists`** — Check if any users exist in the system
- **GET `/api/users/status/bulk`** — Get online status for multiple users
  - params: `userIds*@query:string`
  - returns: `$BulkUserStatusResponseDto`
- **GET `/api/users/{id}`** — Retrieve a user by ID
  - params: `id*@path:string`
  - returns: `$User`
- **PATCH `/api/users/{id}`** — Update a user by ID
  - params: `id*@path:string`
  - body: `{email:string, mobileNumber:string, username:string, firstName:string, lastName:string, password:string, avatar:string, bio:string, timezone:string, language:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER, status:ACTIVE|INACTIVE|SUSPENDED|PENDING, … (3 more)}`
  - returns: `$User`
- **DELETE `/api/users/{id}`** — Delete a user by ID
  - params: `id*@path:string`
- **GET `/api/users/{id}/status`** — Get online status for a single user
  - params: `id*@path:string`
  - returns: `$UserStatusResponseDto`

## public

- **GET `/api/public/project-tasks/activities/{taskId}`** — Get public task activities
  - params: `taskId*@path:string limit*@query:string page*@query:string`
- **GET `/api/public/project-tasks/attachments/{taskId}`** — Get public task attachments
  - params: `taskId*@path:string`
- **GET `/api/public/project-tasks/comments/{taskId}`** — Get public task comments
  - params: `taskId*@path:string`
- **GET `/api/public/project-tasks/key/{slug}`** — Get public task by slug
  - params: `slug*@path:string`
- **GET `/api/public/project-tasks/{taskId}`** — Get public task details
  - params: `taskId*@path:string projectSlug*@path:? workspaceSlug*@path:?`
- **GET `/api/public/project-tasks/{workspaceSlug}/projects/{projectSlug}/tasks`** — Get public project tasks
  - params: `workspaceSlug*@path:string projectSlug*@path:string limit@query:number page*@query:number status@query:string priority@query:string parentTaskId@query:string type@query:string offset@query:?`
- **GET `/api/public/project-tasks/{workspaceSlug}/projects/{projectSlug}/taskskanban`** — Get public project tasks in kanban format
  - params: `workspaceSlug*@path:string projectSlug*@path:string`
- **GET `/api/public/tasks/{token}`** — Get shared task by token
  - params: `token*@path:string`
- **GET `/api/public/tasks/{token}/attachments/{attachmentId}`** — Get attachment URL
  - params: `token*@path:string attachmentId*@path:string`
- **GET `/api/public/workspaces/{slug}/charts`** — Get project charts data
  - params: `slug*@path:string types*@query:array`
- **GET `/api/public/workspaces/{slug}/statuses`** — Get project statuses
  - params: `slug*@path:string`
- **GET `/api/public/workspaces/{workspaceSlug}/projects`** — Get workspace public projects
  - params: `workspaceSlug*@path:string`
- **GET `/api/public/workspaces/{workspaceSlug}/projects/{projectSlug}`** — Get public project
  - params: `workspaceSlug*@path:string projectSlug*@path:string`
- **GET `/api/public/workspaces/{workspaceSlug}/projects/{projectSlug}/calendar`** — Get public project calendar events
  - params: `workspaceSlug*@path:string projectSlug*@path:string startDate@query:string endDate@query:string`
- **GET `/api/public/workspaces/{workspaceSlug}/projects/{projectSlug}/sprints`** — Get public project sprints
  - params: `workspaceSlug*@path:string projectSlug*@path:string`
- **GET `/api/public/workspaces/{workspaceSlug}/projects/{projectSlug}/sprints/{sprintId}`** — Get public sprint details
  - params: `workspaceSlug*@path:string projectSlug*@path:string sprintId*@path:string`
- **GET `/api/public/workspaces/{workspaceSlug}/projects/{projectSlug}/sprints/{sprintId}/tasks`** — Get public sprint tasks
  - params: `workspaceSlug*@path:string projectSlug*@path:string sprintId*@path:string`

## other

- **GET `/api`**
- **GET `/email/queue/stats`** — Get email queue statistics
- **POST `/email/send`** — Send email notification
  - body: `{to*:string, subject*:string, template*:string, data*:object, priority:low|normal|high|critical, delay:number}`
- **POST `/email/send-bulk`** — Send bulk email notifications
  - body: `{recipients*:[string], subject*:string, template*:string, data*:object, priority:low|normal|high|critical}`

## queues

- **GET `/api/queues`**
- **POST `/api/queues`**
- **PUT `/api/queues`**
- **DELETE `/api/queues`**
- **PATCH `/api/queues`**
- **GET `/api/queues/test`**
- **GET `/api/queues/{path}`**
- **POST `/api/queues/{path}`**
- **PUT `/api/queues/{path}`**
- **DELETE `/api/queues/{path}`**
- **PATCH `/api/queues/{path}`**

## s

- **GET `/api/s3/presigned-get-url`** — Get presigned GET URL to download or access a file
  - params: `key*@query:string`
- **GET `/api/s3/presigned-put-url`** — Get presigned PUT URL to upload a file
  - params: `key*@query:string`

## search

- **POST `/api/search/advanced`** — Advanced search with filters
  - body: `{query:string, taskTypes:[string], priorities:[string], assigneeIds:[string], reporterIds:[string], statusIds:[string], labelIds:[string], sprintIds:[string], dueDateFrom:date-time, dueDateTo:date-time, createdFrom:date-time, createdTo:date-time, … (7 more)}`
- **POST `/api/search/global`** — Global search across all entities
  - body: `{query*:string, entityType:string, organizationId:string, workspaceId:string, projectId:string, page:number, limit:number, sortBy:relevance|createdAt|updatedAt|title|priority|dueDate, sortOrder:asc|desc}`
- **GET `/api/search/quick`** — Quick search with simple query string
  - params: `query*@query:string entityType@query:string organizationId@query:string workspaceId@query:string projectId@query:string page@query:number limit@query:number sortBy@query:string sortOrder@query:string q*@query:string type@query:string`
- **GET `/api/search/suggestions`** — Get search suggestions
  - params: `q*@query:string limit@query:string`

## settings

- **GET `/api/settings`** — Get all settings
  - params: `category*@query:string`
  - returns: `[$SettingResponseDto]`
- **POST `/api/settings`** — Set or update a setting
  - body: `{key*:string, value*:string, description:string, category:string, isEncrypted:boolean}`
- **POST `/api/settings/bulk`** — Set or update multiple settings at once
  - body: `{settings*:[$SetSettingDto]}`
- **GET `/api/settings/{key}`** — Get setting by key
  - params: `key*@path:string defaultValue*@query:string`
  - returns: `$SettingResponseDto`
- **DELETE `/api/settings/{key}`** — Delete a setting
  - params: `key*@path:string`

## task-attachments

- **GET `/api/task-attachments`**
  - params: `taskId*@query:string`
- **GET `/api/task-attachments/stats`**
  - params: `taskId*@query:string`
- **GET `/api/task-attachments/task/{taskId}`**
  - params: `taskId*@path:string`
- **POST `/api/task-attachments/upload/{taskId}`** — Upload a file attachment to a task
  - params: `taskId*@path:string`
  - body: `{file:string}`
- **GET `/api/task-attachments/{id}`**
  - params: `id*@path:string`
- **DELETE `/api/task-attachments/{id}`**
  - params: `id*@path:string`
- **GET `/api/task-attachments/{id}/download`** — Download file
  - params: `id*@path:string`
- **GET `/api/task-attachments/{id}/preview`** — Preview file
  - params: `id*@path:string`

## task-comments

- **POST `/api/task-comments`** — Create a new task comment
  - body: `{content*:string, taskId*:string, parentCommentId:string}`
- **GET `/api/task-comments`** — Get all comments for a task
  - params: `taskId*@query:string sort@query:string limit@query:? page@query:?`
- **GET `/api/task-comments/middle-pagination`** — Get comments with middle pagination
  - params: `taskId*@query:string newestCount@query:? oldestCount@query:? limit@query:? page@query:?`
- **GET `/api/task-comments/task/{taskId}/tree`** — Get comment tree for a task
  - params: `taskId*@path:string`
- **GET `/api/task-comments/{id}`** — Get a specific comment by ID
  - params: `id*@path:string`
- **PATCH `/api/task-comments/{id}`** — Update a comment
  - params: `id*@path:string`
  - body: `{}`
- **DELETE `/api/task-comments/{id}`** — Delete a comment
  - params: `id*@path:string`
- **GET `/api/task-comments/{id}/replies`** — Get replies to a comment
  - params: `id*@path:string`

## task-dependencies

- **POST `/api/task-dependencies`** — Create a new task dependency
  - body: `{type*:BLOCKS|FINISH_START|START_START|FINISH_FINISH|START_FINISH, dependentTaskId*:string, blockingTaskId*:string, createdBy*:string}`
- **GET `/api/task-dependencies`** — Get all task dependencies
  - params: `projectId@query:string`
- **POST `/api/task-dependencies/bulk`** — Create multiple task dependencies at once
  - body: `{dependencies*:[$CreateTaskDependencyDto]}`
- **GET `/api/task-dependencies/stats`** — Get dependency statistics for a project
  - params: `projectId*@query:string`
- **GET `/api/task-dependencies/task/{taskId}`** — Get all dependencies for a specific task
  - params: `taskId*@path:string`
- **GET `/api/task-dependencies/task/{taskId}/blocked`** — Get all tasks blocked by a specific task
  - params: `taskId*@path:string`
- **DELETE `/api/task-dependencies/tasks/{dependentTaskId}/{blockingTaskId}`** — Remove dependency between two specific tasks
  - params: `dependentTaskId*@path:string blockingTaskId*@path:string`
- **GET `/api/task-dependencies/{id}`** — Get a specific task dependency by ID
  - params: `id*@path:string`
- **PATCH `/api/task-dependencies/{id}`** — Update a task dependency
  - params: `id*@path:string`
  - body: `{type:BLOCKS|FINISH_START|START_START|FINISH_FINISH|START_FINISH, dependentTaskId:string, blockingTaskId:string, createdBy:string}`
- **DELETE `/api/task-dependencies/{id}`** — Remove a task dependency
  - params: `id*@path:string`

## task-labels

- **POST `/api/task-labels`** — Assign a label to a task
  - body: `{taskId*:string, labelId*:string}`
- **GET `/api/task-labels`** — Get all task labels
- **DELETE `/api/task-labels/{taskId}/{labelId}`** — Remove a label from a task
  - params: `taskId*@path:string labelId*@path:string`

## task-shares

- **POST `/api/task-shares`** — Create public share link
  - body: `{taskId*:string, expiresInDays*:1|3|7|14|30}`
- **GET `/api/task-shares/task/{taskId}`** — Get share links for task
  - params: `taskId*@path:string`
- **DELETE `/api/task-shares/{shareId}`** — Revoke share link
  - params: `shareId*@path:string`

## task-watchers

- **POST `/api/task-watchers`** — Create a new task watcher
  - body: `{}`
- **GET `/api/task-watchers`** — Get all task watchers with optional filters
  - params: `taskId@query:string userId@query:string`
- **GET `/api/task-watchers/check/{taskId}/{userId}`** — Check if a user is watching a specific task
  - params: `taskId*@path:string userId*@path:string`
- **GET `/api/task-watchers/stats`** — Get task watcher statistics
  - params: `taskId@query:string userId@query:string`
- **GET `/api/task-watchers/task/{taskId}`** — Get all watchers for a specific task
  - params: `taskId*@path:string`
- **POST `/api/task-watchers/toggle`** — Toggle watch status for a task
  - body: `{taskId:string, userId:string}`
- **POST `/api/task-watchers/unwatch`** — Stop watching a task
  - body: `{}`
- **GET `/api/task-watchers/user/{userId}/watched-tasks`** — Get all tasks watched by a specific user
  - params: `userId*@path:string`
- **POST `/api/task-watchers/watch`** — Watch a task for updates
  - body: `{}`
- **GET `/api/task-watchers/{id}`** — Get a specific task watcher by ID
  - params: `id*@path:string`
- **DELETE `/api/task-watchers/{id}`** — Remove a task watcher
  - params: `id*@path:string requestUserId*@query:string`

## time-entries

- **POST `/api/time-entries`**
  - body: `{description:string, timeSpent*:number, startTime:date-time, endTime:date-time, date:date-time, taskId*:string, userId*:string}`
- **GET `/api/time-entries`**
  - params: `taskId*@query:string userId*@query:string startDate*@query:string endDate*@query:string`
- **GET `/api/time-entries/summary`**
  - params: `userId*@query:string taskId*@query:string startDate*@query:string endDate*@query:string`
- **GET `/api/time-entries/timer/active/{userId}`**
  - params: `userId*@path:string`
- **POST `/api/time-entries/timer/start`**
  - body: `{}`
- **POST `/api/time-entries/timer/stop`**
  - body: `{}`
- **GET `/api/time-entries/{id}`**
  - params: `id*@path:string`
- **PATCH `/api/time-entries/{id}`**
  - params: `id*@path:string requestUserId*@query:string`
  - body: `{}`
- **DELETE `/api/time-entries/{id}`**
  - params: `id*@path:string requestUserId*@query:string`

## uploads

- **GET `/api/uploads/tasks/{taskId}/{filename}`** — Serve task attachment file
  - params: `taskId*@path:string filename*@path:string`
- **POST `/api/uploads/upload/{folder}`** — Upload and save a file to S3 or Local Storage
  - params: `folder*@path:string`
  - body: `{file:string}`
- **GET `/api/uploads/{folder}/{filename}`** — Serve file from storage
  - params: `folder*@path:string filename*@path:string`

## Schemas (referenced above as `$Name`)

Brief shape of each named schema. For full property docs/descriptions, see `openapi.json`.

- **`AdvancedSearchDto`** — `{query:string, taskTypes:[string], priorities:[string], assigneeIds:[string], reporterIds:[string], statusIds:[string], labelIds:[string], sprintIds:[string], dueDateFrom:date-time, dueDateTo:date-time, createdFrom:date-time, createdTo:date-time, … (7 more)}`
- **`AssignLabelDto`** — `{taskId*:string, labelId*:string}`
- **`AssignMultipleLabelsDto`** — `{taskId*:string, labelIds*:[string]}`
- **`AssignTaskLabelDto`** — `{taskId*:string, labelId*:string}`
- **`AuthResponseDto`** — `{access_token*:string, refresh_token*:string, user*:object}`
- **`BulkCreateDependenciesDto`** — `{dependencies*:[$CreateTaskDependencyDto]}`
- **`BulkCreateTasksDto`** — `{projectId*:string, statusId*:string, sprintId:string, tasks*:[$BulkTaskItem]}`
- **`BulkDeleteTasksDto`** — `{taskIds:[string], projectId:string, all:boolean, excludedIds:[string]}`
- **`BulkEmailDto`** — `{recipients*:[string], subject*:string, template*:string, data*:object, priority:low|normal|high|critical}`
- **`BulkSetSettingsDto`** — `{settings*:[$SetSettingDto]}`
- **`BulkTaskItem`** — `{}`
- **`BulkUserStatusResponseDto`** — `{status*:object}`
- **`ChangePasswordDto`** — `{currentPassword*:string, newPassword*:string, confirmPassword*:string}`
- **`ChatMessageDto`** — `{role*:system|user|assistant, content*:string}`
- **`ChatRequestDto`** — `{message*:string, history:[$ChatMessageDto], workspaceId:string, projectId:string, sessionId:string, currentOrganizationId:string}`
- **`ChatResponseDto`** — `{message*:string, success*:boolean, error:string}`
- **`CreateAutomationRuleDto`** — `{name*:string, description:string, triggerType*:string, triggerConfig:object, actionType*:string, actionConfig:object, organizationId:string, workspaceId:string, projectId:string, createdBy*:string, status:ACTIVE|INACTIVE|DRAFT}`
- **`CreateInboxDto`** — `{name*:string, description:string, emailAddress:string, emailSignature:string, autoReplyEnabled:boolean, autoReplyTemplate:string, syncInterval:string, autoCreateTask:boolean, defaultTaskType:TASK|BUG|EPIC|STORY|SUBTASK, defaultPriority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, defaultStatusId:string, defaultAssigneeId:string, … (7 more)}`
- **`CreateInvitationDto`** — `{}`
- **`CreateLabelDto`** — `{name*:string, color*:string, description:string, projectId*:string}`
- **`CreateOrganizationDto`** — `{name*:string, description:string, avatar:string, website:string, settings:object, ownerId*:string, defaultWorkspace:?, defaultProject:?}`
- **`CreateOrganizationMemberDto`** — `{userId*:string, organizationId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **`CreateProjectDto`** — `{name*:string, slug*:string, taskPrefix:string, color*:string, avatar*:string, description:string, status:PLANNING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED, priority:LOW|MEDIUM|HIGH|URGENT, startDate:date-time, endDate:date-time, settings:object, workspaceId:string, … (2 more)}`
- **`CreateProjectMemberDto`** — `{userId*:string, projectId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **`CreatePublicTaskShareDto`** — `{taskId*:string, expiresInDays*:1|3|7|14|30}`
- **`CreateRuleDto`** — `{name*:string, description:string, priority:number, enabled:boolean, conditions*:object, actions*:object, stopOnMatch:boolean}`
- **`CreateSprintDto`** — `{name*:string, goal:string, status:PLANNING|ACTIVE|COMPLETED|CANCELLED, startDate:date-time, endDate:date-time, projectId*:string}`
- **`CreateTaskCommentDto`** — `{content*:string, taskId*:string, parentCommentId:string}`
- **`CreateTaskDependencyDto`** — `{type*:BLOCKS|FINISH_START|START_START|FINISH_FINISH|START_FINISH, dependentTaskId*:string, blockingTaskId*:string, createdBy*:string}`
- **`CreateTaskDto`** — `{title*:string, description:string, type:TASK|BUG|EPIC|STORY|SUBTASK, priority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, startDate:date-time, dueDate:date-time, storyPoints:number, originalEstimate:number, remainingEstimate:number, customFields:object, projectId*:string, assigneeIds:[string], … (8 more)}`
- **`CreateTaskStatusDto`** — `{name*:string, color*:string, category*:?, position*:integer, workflowId*:string}`
- **`CreateTaskStatusFromProjectDto`** — `{}`
- **`CreateTaskWatcherDto`** — `{}`
- **`CreateTimeEntryDto`** — `{description:string, timeSpent*:number, startTime:date-time, endTime:date-time, date:date-time, taskId*:string, userId*:string}`
- **`CreateUserDto`** — `{email*:string, mobileNumber:string, username:string, firstName*:string, lastName*:string, password*:string, avatar:string, bio:string, timezone:string, language:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **`CreateWorkflowDto`** — `{name*:string, description:string, isDefault:boolean, organizationId*:string}`
- **`CreateWorkspaceDto`** — `{name*:string, slug*:string, description:string, avatar:string, color:string, settings:object, organizationId*:string}`
- **`CreateWorkspaceMemberDto`** — `{}`
- **`DefaultProjectDto`** — `{name*:string}`
- **`DefaultWorkspaceDto`** — `{name*:string}`
- **`ForgotPasswordDto`** — `{email*:string}`
- **`GenerateDescriptionDto`** — `{title*:string, taskType:string}`
- **`GenerateDescriptionResponseDto`** — `{description*:string, success*:boolean, error:string}`
- **`GlobalSearchDto`** — `{query*:string, entityType:string, organizationId:string, workspaceId:string, projectId:string, page:number, limit:number, sortBy:relevance|createdAt|updatedAt|title|priority|dueDate, sortOrder:asc|desc}`
- **`InviteOrganizationMemberDto`** — `{email*:string, organizationId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **`InviteProjectMemberDto`** — `{email*:string, projectId*:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **`InviteWorkspaceMemberDto`** — `{}`
- **`LoginDto`** — `{email*:string, password*:string}`
- **`PublicProjectDto`** — `{id*:string, name*:string, slug*:string, description:string, color:string, avatar:string, status:PLANNING|ACTIVE|ON_HOLD|COMPLETED|CANCELLED, priority:LOW|MEDIUM|HIGH|URGENT, visibility*:string, startDate:date-time, endDate:date-time, createdAt*:date-time, … (4 more)}`
- **`PublicProjectStatsDto`** — `{taskCount*:number, completionRate*:number, hasActiveSprints*:boolean}`
- **`PublicSharedTaskDto`** — `{title*:string, description:string, status*:object, priority*:string, dueDate:date-time, assignees*:[?], createdBy:object, attachments*:[?]}`
- **`PublicSprintDto`** — `{id*:string, name*:string, description:string, status*:PLANNING|ACTIVE|COMPLETED|CANCELLED, startDate:date-time, endDate:date-time, createdAt*:date-time, tasks:[$PublicTaskDto], progress*:number, isPublicView*:boolean}`
- **`PublicTaskDto`** — `{id*:string, title*:string, description:string, type*:TASK|BUG|EPIC|STORY|SUBTASK, priority*:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, dueDate:date-time, createdAt*:date-time, status*:$PublicTaskStatusDto, labels:[$PublicTaskLabelDto], subtasks:[$PublicTaskDto], isPublicView*:boolean}`
- **`PublicTaskLabelDto`** — `{id*:string, name*:string, color*:string}`
- **`PublicTaskPaginationDto`** — `{data*:[$PublicTaskDto], page*:number, total*:number, limit*:number, totalPages*:number}`
- **`PublicTaskShareResponseDto`** — `{id*:string, token*:string, shareUrl*:string, expiresAt*:date-time, createdAt*:date-time}`
- **`PublicTaskStatusDto`** — `{id*:string, name*:string, color*:string, category*:string}`
- **`RecurrenceConfigDto`** — `{recurrenceType*:DAILY|WEEKLY|MONTHLY|QUARTERLY|YEARLY|CUSTOM, interval*:number, daysOfWeek:[number], dayOfMonth:number, monthOfYear:number, endType*:NEVER|ON_DATE|AFTER_OCCURRENCES, endDate:string, occurrenceCount:number}`
- **`RefreshTokenDto`** — `{refresh_token*:string}`
- **`RegisterDto`** — `{email*:string, password*:string, firstName*:string, lastName*:string, username:string}`
- **`ResetPasswordDto`** — `{token*:string, password*:string, confirmPassword*:string}`
- **`SendEmailDto`** — `{to*:string, subject*:string, template*:string, data*:object, priority:low|normal|high|critical, delay:number}`
- **`SetSettingDto`** — `{key*:string, value*:string, description:string, category:string, isEncrypted:boolean}`
- **`SettingResponseDto`** — `{key*:string, value*:object, description:object, category*:string, isEncrypted*:boolean}`
- **`SetupAdminDto`** — `{email*:string, password*:string, firstName*:string, lastName*:string, username:string}`
- **`SetupEmailDto`** — `{emailAddress*:string, displayName:string, imapHost*:string, imapPort:number, imapUsername*:string, imapPassword*:string, imapUseSsl:boolean, imapTlsRejectUnauth:boolean, imapTlsMinVersion:string, imapServername:string, imapFolder:string, smtpHost*:string, … (7 more)}`
- **`StartTimerDto`** — `{}`
- **`StatusCategory`** — `string`
- **`StopTimerDto`** — `{}`
- **`TestConnectionDto`** — `{apiKey*:string, model*:string, apiUrl*:string}`
- **`TestConnectionResponseDto`** — `{success*:boolean, message:string, error:string}`
- **`UnwatchTaskDto`** — `{}`
- **`UpdateInboxDto`** — `{name*:string, description:string, emailAddress:string, emailSignature:string, autoReplyEnabled:boolean, autoReplyTemplate:string, syncInterval:string, autoCreateTask:boolean, defaultTaskType:TASK|BUG|EPIC|STORY|SUBTASK, defaultPriority:LOWEST|LOW|MEDIUM|HIGH|HIGHEST, defaultStatusId:string, defaultAssigneeId:string, … (7 more)}`
- **`UpdateLabelDto`** — `{}`
- **`UpdateOrganizationDto`** — `{slug:string}`
- **`UpdateOrganizationMemberDto`** — `{userId:string, organizationId:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER, isDefault:boolean}`
- **`UpdatePositionsDto`** — `{}`
- **`UpdateProjectDto`** — `{}`
- **`UpdateProjectMemberDto`** — `{role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER}`
- **`UpdateSprintDto`** — `{}`
- **`UpdateTaskCommentDto`** — `{}`
- **`UpdateTaskDependencyDto`** — `{type:BLOCKS|FINISH_START|START_START|FINISH_FINISH|START_FINISH, dependentTaskId:string, blockingTaskId:string, createdBy:string}`
- **`UpdateTaskDto`** — `{stopRecurrence:boolean}`
- **`UpdateTaskStatusDto`** — `{}`
- **`UpdateTimeEntryDto`** — `{}`
- **`UpdateUserDto`** — `{email:string, mobileNumber:string, username:string, firstName:string, lastName:string, password:string, avatar:string, bio:string, timezone:string, language:string, role:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER, status:ACTIVE|INACTIVE|SUSPENDED|PENDING, … (3 more)}`
- **`UpdateWorkflowDto`** — `{}`
- **`UpdateWorkspaceDto`** — `{}`
- **`UpdateWorkspaceMemberDto`** — `{}`
- **`User`** — `{id*:string, mobileNumber:string, email*:string, username:string, firstName*:string, lastName*:string, avatar:string, bio:string, timezone*:string, language*:string, role*:SUPER_ADMIN|OWNER|MANAGER|MEMBER|VIEWER, status*:ACTIVE|INACTIVE|SUSPENDED|PENDING, … (5 more)}`
- **`UserStatusResponseDto`** — `{userId*:string, isOnline*:boolean, lastSeen:string}`
- **`VerifyResetTokenResponseDto`** — `{valid*:boolean, message:string}`
- **`WatchTaskDto`** — `{}`
