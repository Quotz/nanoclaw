# Taskosaur API quirks & bridge workarounds

The bundled Taskosaur app has a few inconsistencies that the
`taskosaur-mcp` bridge compensates for. If you ever hit one of these
errors despite the bridge, read on — the bridge code may have drifted from
this list, or you may be calling an endpoint the bridge doesn't cover.

## 1. Sprint creation: project lookup is by SLUG, not UUID

**Endpoint:** `POST /api/sprints`

**Symptom:** `{"message":"Project not found","statusCode":404}` even though
the project clearly exists.

**Cause:** Taskosaur's `SprintsService.create` does
`prisma.project.findUnique({ where: { slug: dto.projectId } })`. The DTO
field is named `projectId` but the controller treats it as a slug.

**Bridge workaround:** `create_sprint` auto-resolves UUID→slug (cached
in-process). You can pass either form.

**If you ever bypass the bridge:** pass the project slug (e.g.
`"fangrabs"`), not the UUID.

## 2. Comment body key is `comment`, not `content`

**Endpoint:** `POST /api/tasks/{id}/comments`

**Symptom:** HTTP 500 with Prisma error `Argument 'content' is missing`.

**Cause:** NestJS controller does `@Body('comment')`, so it extracts the
`comment` field from the body. The bridge previously sent `{content: ...}`
which got dropped.

**Bridge workaround:** `add_task_comment` keeps `content` as the tool's
input field name (caller-facing) but sends `{comment: ...}` on the wire.

**If you ever bypass the bridge:** post `{"comment": "..."}`.

## 3. Top-level list endpoints require explicit scope

**Endpoints:** `GET /api/workspaces`, `GET /api/projects`.

**Symptom:**
- `/api/workspaces` → `403 "Scope id missing"`
- `/api/projects` → `400 "The value passed as UUID is not a string"`

**Cause:** Both expect a scope query parameter (`organizationId` or
`workspaceId`). The bridge's `list_workspaces` and `list_projects` already
pass them, but if you ever call the API directly you need to include them.

**Bridge tools to use instead:**
- `list_workspaces({organizationId})` — defaults to the configured org
- `list_projects({organizationId})` — defaults to the configured org;
  internally uses `/api/projects/by-organization?organizationId=...`

## 4. Task creation requires `statusId`

**Endpoint:** `POST /api/tasks`

**Symptom:** `["statusId should not be empty","statusId must be a UUID"]`
with HTTP 400.

**Cause:** Not a bug, just a non-obvious required field. New tasks always
land in a specific status.

**How to handle:** Call `list_task_statuses({projectId})` first to get the
list (To Do / In Progress / In Review / Done by default). Use the To Do
status's `id` for new tasks unless the user said otherwise.

## 5. Update DTOs in OpenAPI are empty

**Affects:** `UpdateTaskDto`, `UpdateProjectDto`, `UpdateWorkspaceDto`,
`UpdateSprintDto`, and several `Update*Dto`s in `openapi.json`.

**Symptom:** `openapi.json` shows these schemas with an empty `properties`
object or only one field (e.g. `UpdateTaskDto` only shows
`stopRecurrence`).

**Cause:** NestJS generates Update DTOs via `PartialType(CreateXDto)`,
which Swagger doesn't fully expand. The fields are actually
`Partial<CreateXDto>` — any field from `CreateXDto` is settable, all
optional.

**How to handle:** Look at the corresponding `CreateXDto` for the set of
valid fields. The bridge's `update_*` tools document the common ones in
their `inputSchema`.

## Reporting new quirks

If you discover a new bug or non-obvious behavior, **tell Andrey** rather
than working around it silently. Several bugs above were only found
because Pero kept failing on the same call until the cause was traced.
Some are worth upstreaming as PRs to Taskosaur.
