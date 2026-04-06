#!/usr/bin/env node
/**
 * Taskosaur CLI tool for NanoClaw container agents.
 * Usage: node taskosaur.mjs <action> [json-args]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.TASKOSAUR_URL;
if (!BASE_URL) { console.error('Error: TASKOSAUR_URL not set'); process.exit(1); }
const CREDS = {
  email: process.env.TASKOSAUR_EMAIL,
  password: process.env.TASKOSAUR_PASSWORD,
};

// Token cache in /tmp so it works even when skill dir is readonly
const TOKEN_FILE = process.env.TASKOSAUR_TOKEN_FILE || '/tmp/.taskosaur-token.json';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function loadToken() {
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (data.expiresAt && Date.now() < data.expiresAt - 120_000) return data.access_token;
    if (data.refresh_token) {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: data.refresh_token }),
      });
      if (res.ok) {
        const fresh = await res.json();
        saveToken(fresh);
        return fresh.access_token;
      }
    }
  } catch {}
  return null;
}

function saveToken(data) {
  let expiresAt = Date.now() + 14 * 60 * 1000;
  try {
    const p = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64').toString());
    if (p.exp) expiresAt = p.exp * 1000;
  } catch {}
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...data, expiresAt }));
}

async function getToken() {
  const cached = await loadToken();
  if (cached) return cached;
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(CREDS),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  saveToken(data);
  return data.access_token;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function api(method, endpoint, body) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${method} ${endpoint} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PATCH = (p, b) => api('PATCH', p, b);
const DEL = (p) => api('DELETE', p);

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      if (Array.isArray(v)) p.set(k, v.join(','));
      else p.set(k, String(v));
    }
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgId() {
  const orgs = await GET('/organizations');
  return (Array.isArray(orgs) ? orgs[0] : orgs)?.id;
}

// ── Context / Discovery ───────────────────────────────────────────────────────

async function context() {
  const orgs = await GET('/organizations');
  const org = Array.isArray(orgs) ? orgs[0] : orgs;
  const orgId = org?.id;
  const workspaceData = await GET(`/workspaces?orgId=${orgId}`);
  const wsList = Array.isArray(workspaceData) ? workspaceData : workspaceData?.data || [];
  const result = { organization: { id: orgId, name: org?.name, slug: org?.slug }, workspaces: [] };
  for (const ws of wsList) {
    const projects = await GET(`/projects?workspaceId=${ws.id}&pageSize=50`);
    const pList = Array.isArray(projects) ? projects : projects?.data || [];
    const wsEntry = { id: ws.id, name: ws.name, slug: ws.slug, projects: [] };
    for (const p of pList) {
      const [statuses, sprints, labels] = await Promise.all([
        GET(`/task-statuses/project?projectId=${p.id}`),
        GET(`/sprints?projectId=${p.id}`),
        GET(`/labels?projectId=${p.id}`),
      ]);
      wsEntry.projects.push({
        id: p.id, name: p.name, key: p.key, slug: p.slug, status: p.status, priority: p.priority,
        statuses: (Array.isArray(statuses) ? statuses : []).map(s => ({ id: s.id, name: s.name, color: s.color, category: s.category })),
        sprints: (Array.isArray(sprints) ? sprints : []).map(s => ({ id: s.id, name: s.name, status: s.status, startDate: s.startDate, endDate: s.endDate })),
        labels: (Array.isArray(labels) ? labels : []).map(l => ({ id: l.id, name: l.name, color: l.color })),
      });
    }
    result.workspaces.push(wsEntry);
  }
  return result;
}

// ── Organizations ─────────────────────────────────────────────────────────────

async function orgList() { return GET('/organizations'); }
async function orgGet(a) { return GET(`/organizations/${a.id}`); }
async function orgStats(a) { return GET(`/organizations/${a.id}/stats`); }
async function orgUpdate(a) { const { id, ...rest } = a; return PATCH(`/organizations/${id}`, rest); }
async function orgMembers(a) { return GET(`/organization-members?organizationId=${a.organizationId}`); }

// ── Workspaces ────────────────────────────────────────────────────────────────

async function workspaceList(a) {
  const orgId = a.orgId || await getOrgId();
  const data = await GET(`/workspaces?orgId=${orgId}`);
  return Array.isArray(data) ? data : data?.data || [];
}
async function workspaceGet(a) { return GET(`/workspaces/${a.id}`); }
async function workspaceCreate(a) { return POST('/workspaces', a); }
async function workspaceUpdate(a) { const { id, ...rest } = a; return PATCH(`/workspaces/${id}`, rest); }
async function workspaceDelete(a) { return DEL(`/workspaces/${a.id}`); }
async function workspaceArchive(a) { return PATCH(`/workspaces/archive/${a.id}`, {}); }
async function workspaceUnarchive(a) { return PATCH(`/workspaces/unarchive/${a.id}`, {}); }
async function workspaceMembers(a) { return GET(`/workspace-members?workspaceId=${a.workspaceId}`); }
async function workspaceRecent(a) { return GET(`/workspaces/recent/${a.workspaceId}${qs({ limit: a.limit || 20, page: a.page || 1 })}`); }

// ── Projects ──────────────────────────────────────────────────────────────────

async function projectList(a) {
  const data = await GET(`/projects${qs({ workspaceId: a.workspaceId, status: a.status, priority: a.priority, search: a.search, page: a.page, pageSize: a.pageSize || 50 })}`);
  return Array.isArray(data) ? data : data?.data || [];
}
async function projectGet(a) { return GET(`/projects/${a.id}`); }
async function projectCreate(a) { return POST('/projects', a); }
async function projectUpdate(a) { const { id, ...rest } = a; return PATCH(`/projects/${id}`, rest); }
async function projectDelete(a) { return DEL(`/projects/${a.id}`); }
async function projectArchive(a) { return PATCH(`/projects/archive/${a.id}`, {}); }
async function projectUnarchive(a) { return PATCH(`/projects/unarchive/${a.id}`, {}); }
async function projectMembers(a) { return GET(`/project-members?projectId=${a.projectId}`); }
async function projectStats(a) { return GET(`/projects/${a.slug}/charts${qs({ types: a.types || 'task-status,task-type,kpi-metrics,task-priority' })}`); }

// ── Task Statuses ─────────────────────────────────────────────────────────────

async function statusList(a) { return GET(`/task-statuses/project?projectId=${a.projectId}`); }
async function statusCreate(a) { return POST('/task-statuses', a); }
async function statusUpdate(a) { const { id, ...rest } = a; return PATCH(`/task-statuses/${id}`, rest); }
async function statusDelete(a) { return DEL(`/task-statuses/${a.id}`); }
async function statusReorder(a) { return PATCH('/task-statuses/positions', { positions: a.positions }); }

// ── Tasks ─────────────────────────────────────────────────────────────────────

async function taskList(a) {
  const orgId = a.orgId || await getOrgId();
  const data = await GET(`/tasks/organization/${orgId}${qs({ projectId: a.projectId, search: a.search, priorities: a.priorities, statuses: a.statuses, types: a.types, assigneeIds: a.assigneeIds, page: a.page || 1, pageSize: a.pageSize || 50 })}`);
  return Array.isArray(data) ? data : data?.tasks || data?.data || [];
}

async function taskAll(a) {
  const orgId = await getOrgId();
  const data = await GET(`/tasks/organization/${orgId}${qs({ projectId: a.projectId, pageSize: 200 })}`);
  return Array.isArray(data) ? data : data?.tasks || [];
}

async function taskGet(a) { return a.key ? GET(`/tasks/key/${a.key}`) : GET(`/tasks/${a.id}`); }

async function taskToday() {
  const orgId = await getOrgId();
  const today = new Date().toISOString().split('T')[0];
  const data = await GET(`/tasks/organization/${orgId}?pageSize=100`);
  const list = Array.isArray(data) ? data : data?.tasks || [];
  return list.filter(t => t.dueDate && t.dueDate.startsWith(today));
}

async function taskByStatus(a) {
  const orgId = await getOrgId();
  const data = await GET(`/tasks/organization/${orgId}${qs({ projectId: a.projectId, pageSize: 200 })}`);
  const list = Array.isArray(data) ? data : data?.tasks || [];
  const grouped = {};
  for (const t of list) {
    const key = t.status?.name || t.statusId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }
  return grouped;
}

async function taskCreate(a) {
  const { title, projectId, statusId, type = 'TASK', priority, description, dueDate, startDate, sprintId, assigneeIds, reporterIds, parentTaskId, storyPoints, customFields } = a;
  if (!title || !projectId || !statusId) throw new Error('title, projectId, statusId required');
  return POST('/tasks', { title, projectId, statusId, type, priority, description, dueDate, startDate, sprintId, assigneeIds, reporterIds, parentTaskId, storyPoints, customFields });
}

async function taskUpdate(a) { const { id, ...rest } = a; return PATCH(`/tasks/${id}`, rest); }
async function taskSetStatus(a) { return PATCH(`/tasks/${a.id}/status`, { statusId: a.statusId }); }
async function taskSetPriority(a) { return PATCH(`/tasks/${a.id}/priority`, { priority: a.priority }); }
async function taskSetDueDate(a) { return PATCH(`/tasks/${a.id}/due-date`, { dueDate: a.dueDate }); }
async function taskSetAssignees(a) { return PATCH(`/tasks/${a.id}/assignees`, { assigneeIds: a.assigneeIds }); }
async function taskUnassign(a) { return PATCH(`/tasks/${a.id}/unassign`, {}); }
async function taskDelete(a) { return DEL(`/tasks/${a.id}`); }
async function taskBulkDelete(a) { return POST('/tasks/bulk-delete', { taskIds: a.taskIds }); }

async function taskComment(a) { return POST(`/tasks/${a.taskId}/comments`, { content: a.content }); }
async function taskComments(a) { return GET(`/tasks/${a.taskId}/comments`); }

async function taskAddRecurrence(a) { const { id, ...rest } = a; return POST(`/tasks/${id}/recurrence`, rest); }
async function taskUpdateRecurrence(a) { const { id, ...rest } = a; return PATCH(`/tasks/${id}/recurrence`, rest); }
async function taskRemoveRecurrence(a) { return DEL(`/tasks/${a.id}/recurrence`); }

// ── Sprints ───────────────────────────────────────────────────────────────────

async function sprintList(a) { return GET(`/sprints${qs({ projectId: a.projectId, status: a.status })}`); }
async function sprintGet(a) { return GET(`/sprints/${a.id}`); }
async function sprintActive(a) { return GET(`/sprints/project/${a.projectId}/active`); }
async function sprintCreate(a) { return POST('/sprints', a); }
async function sprintUpdate(a) { const { id, ...rest } = a; return PATCH(`/sprints/${id}`, rest); }
async function sprintDelete(a) { return DEL(`/sprints/${a.id}`); }
async function sprintStart(a) { return PATCH(`/sprints/${a.id}/start`, {}); }
async function sprintComplete(a) { return PATCH(`/sprints/${a.id}/complete`, {}); }
async function sprintArchive(a) { return PATCH(`/sprints/archive/${a.id}`, {}); }

// ── Labels ────────────────────────────────────────────────────────────────────

async function labelList(a) { return GET(`/labels${a.projectId ? `?projectId=${a.projectId}` : ''}`); }
async function labelCreate(a) { return POST('/labels', a); }
async function labelUpdate(a) { const { id, ...rest } = a; return PATCH(`/labels/${id}`, rest); }
async function labelDelete(a) { return DEL(`/labels/${a.id}`); }
async function labelAssign(a) { return POST('/labels/assign', { taskId: a.taskId, labelId: a.labelId }); }
async function labelUnassign(a) { return DEL(`/labels/task/${a.taskId}/label/${a.labelId}`); }
async function labelBulkAssign(a) { return POST('/labels/assign-multiple', { taskId: a.taskId, labelIds: a.labelIds }); }
async function labelsByTask(a) { return GET(`/labels/task/${a.taskId}`); }

// ── Members ───────────────────────────────────────────────────────────────────

async function membersList(a) { return GET(`/project-members?projectId=${a.projectId}`); }
async function membersInvite(a) { return POST('/invitations', a); }

// ── Users ─────────────────────────────────────────────────────────────────────

async function userList() { return GET('/users'); }
async function userGet(a) { return GET(`/users/${a.id}`); }
async function userMe() { return GET('/auth/profile'); }

// ── Activity ──────────────────────────────────────────────────────────────────

async function activityList(a) {
  return GET(`/activity-logs${qs({ taskId: a.taskId, projectId: a.projectId, workspaceId: a.workspaceId, page: a.page || 1, limit: a.limit || 20 })}`);
}

// ── Time Entries ──────────────────────────────────────────────────────────────

async function timeList(a) { return GET(`/time-entries${qs({ taskId: a.taskId, projectId: a.projectId, userId: a.userId })}`); }
async function timeCreate(a) { return POST('/time-entries', a); }
async function timeUpdate(a) { const { id, ...rest } = a; return PATCH(`/time-entries/${id}`, rest); }
async function timeDelete(a) { return DEL(`/time-entries/${a.id}`); }

// ── Notifications ─────────────────────────────────────────────────────────────

async function notifList(a) { return GET(`/notifications${qs({ page: a.page || 1, limit: a.limit || 20 })}`); }
async function notifMarkRead(a) { return PATCH(`/notifications/${a.id}/read`, {}); }
async function notifMarkAllRead() { return PATCH('/notifications/read-all', {}); }

// ── Search ────────────────────────────────────────────────────────────────────

async function search(a) {
  const orgId = await getOrgId();
  const data = await GET(`/tasks/organization/${orgId}${qs({ search: a.query, pageSize: a.limit || 50 })}`);
  return Array.isArray(data) ? data : data?.tasks || [];
}

// ── Bulk Create ───────────────────────────────────────────────────────────────

async function taskBulkCreate(a) {
  const results = [];
  for (const task of a.tasks) {
    results.push(await taskCreate(task));
  }
  return results;
}

// ── Action map ────────────────────────────────────────────────────────────────

const ACTIONS = {
  context, me: userMe,
  'org-list': orgList, 'org-get': orgGet, 'org-stats': orgStats, 'org-update': orgUpdate, 'org-members': orgMembers,
  'workspace-list': workspaceList, 'workspace-get': workspaceGet, 'workspace-create': workspaceCreate, 'workspace-update': workspaceUpdate, 'workspace-delete': workspaceDelete, 'workspace-archive': workspaceArchive, 'workspace-unarchive': workspaceUnarchive, 'workspace-members': workspaceMembers, 'workspace-recent': workspaceRecent,
  'project-list': projectList, 'project-get': projectGet, 'project-create': projectCreate, 'project-update': projectUpdate, 'project-delete': projectDelete, 'project-archive': projectArchive, 'project-unarchive': projectUnarchive, 'project-members': projectMembers, 'project-stats': projectStats,
  'status-list': statusList, 'status-create': statusCreate, 'status-update': statusUpdate, 'status-delete': statusDelete, 'status-reorder': statusReorder,
  'task-list': taskList, 'task-all': taskAll, 'task-get': taskGet, 'task-today': taskToday, 'task-by-status': taskByStatus, 'task-create': taskCreate, 'task-update': taskUpdate, 'task-set-status': taskSetStatus, 'task-set-priority': taskSetPriority, 'task-set-due-date': taskSetDueDate, 'task-set-assignees': taskSetAssignees, 'task-unassign': taskUnassign, 'task-delete': taskDelete, 'task-bulk-delete': taskBulkDelete, 'task-bulk-create': taskBulkCreate, 'task-comment': taskComment, 'task-comments': taskComments, 'task-add-recurrence': taskAddRecurrence, 'task-update-recurrence': taskUpdateRecurrence, 'task-remove-recurrence': taskRemoveRecurrence,
  'sprint-list': sprintList, 'sprint-get': sprintGet, 'sprint-active': sprintActive, 'sprint-create': sprintCreate, 'sprint-update': sprintUpdate, 'sprint-delete': sprintDelete, 'sprint-start': sprintStart, 'sprint-complete': sprintComplete, 'sprint-archive': sprintArchive,
  'label-list': labelList, 'label-create': labelCreate, 'label-update': labelUpdate, 'label-delete': labelDelete, 'label-assign': labelAssign, 'label-unassign': labelUnassign, 'label-bulk-assign': labelBulkAssign, 'labels-by-task': labelsByTask,
  'members-list': membersList, 'members-invite': membersInvite,
  'user-list': userList, 'user-get': userGet,
  'activity-list': activityList,
  'time-list': timeList, 'time-create': timeCreate, 'time-update': timeUpdate, 'time-delete': timeDelete,
  'notif-list': notifList, 'notif-mark-read': notifMarkRead, 'notif-mark-all-read': notifMarkAllRead,
  search,
};

// ── Main ──────────────────────────────────────────────────────────────────────

const [,, action, argsRaw] = process.argv;

if (!action || action === '--help') {
  console.log('Available actions:\n' + Object.keys(ACTIONS).join('\n'));
  process.exit(0);
}

if (!ACTIONS[action]) {
  console.error(`Unknown action: ${action}`);
  console.error('Run without args for list of actions');
  process.exit(1);
}

let args = {};
try {
  if (argsRaw) args = JSON.parse(argsRaw);
} catch (e) {
  console.error('Invalid JSON args:', argsRaw);
  process.exit(1);
}

try {
  const result = await ACTIONS[action](args);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
