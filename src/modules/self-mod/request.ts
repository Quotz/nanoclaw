/**
 * Delivery-action handlers for agent-initiated self-modification requests.
 *
 * Two actions the container can write into messages_out (via the self-mod
 * MCP tools): install_packages, add_mcp_server. Each one validates input
 * and queues an approval request. The admin's approval triggers the
 * matching approval handler in ./apply.ts, which also performs the
 * required follow-up (rebuild+restart for install_packages, restart-only
 * for add_mcp_server).
 *
 * Host-side sanitization for install_packages is defense-in-depth — the MCP
 * tool validates first. Both layers matter: the DB row carries the payload
 * verbatim through to shell exec on apply.
 */
import { getDeliveryAdapter } from '../../delivery.js';
import { getAgentGroup } from '../../db/agent-groups.js';
import { log } from '../../log.js';
import type { Session } from '../../types.js';
import { notifyAgent, pickApprovalDelivery, pickApprover, requestApproval } from '../approvals/index.js';
import { applyPatchBridge } from './apply.js';

export async function handleInstallPackages(content: Record<string, unknown>, session: Session): Promise<void> {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notifyAgent(session, 'install_packages failed: agent group not found.');
    return;
  }

  const apt = (content.apt as string[]) || [];
  const npm = (content.npm as string[]) || [];
  const reason = (content.reason as string) || '';

  const APT_RE = /^[a-z0-9][a-z0-9._+-]*$/;
  const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
  const MAX_PACKAGES = 20;
  if (apt.length + npm.length === 0) {
    notifyAgent(session, 'install_packages failed: at least one apt or npm package is required.');
    return;
  }
  if (apt.length + npm.length > MAX_PACKAGES) {
    notifyAgent(session, `install_packages failed: max ${MAX_PACKAGES} packages per request.`);
    return;
  }
  const invalidApt = apt.find((p) => !APT_RE.test(p));
  if (invalidApt) {
    notifyAgent(session, `install_packages failed: invalid apt package name "${invalidApt}".`);
    log.warn('install_packages: invalid apt package rejected', { pkg: invalidApt });
    return;
  }
  const invalidNpm = npm.find((p) => !NPM_RE.test(p));
  if (invalidNpm) {
    notifyAgent(session, `install_packages failed: invalid npm package name "${invalidNpm}".`);
    log.warn('install_packages: invalid npm package rejected', { pkg: invalidNpm });
    return;
  }

  const packageList = [...apt.map((p) => `apt: ${p}`), ...npm.map((p) => `npm: ${p}`)].join(', ');
  await requestApproval({
    session,
    agentName: agentGroup.name,
    action: 'install_packages',
    payload: { apt, npm, reason },
    title: 'Install Packages Request',
    question: `Agent "${agentGroup.name}" is attempting to install a package + rebuild container:\n${packageList}${reason ? `\nReason: ${reason}` : ''}`,
  });
}

const MAX_DIFF_BYTES = 20_000;
const MAX_DESCRIPTION = 1_000;
const DIFF_FILE_HEADER_RE = /^(?:---|\+\+\+) (?:a|b)\/(.+)$/gm;

function affectedFiles(diff: string): { files: string[]; problems: string[] } {
  const problems: string[] = [];
  const files = new Set<string>();
  let m: RegExpExecArray | null;
  DIFF_FILE_HEADER_RE.lastIndex = 0;
  while ((m = DIFF_FILE_HEADER_RE.exec(diff)) !== null) {
    const path = m[1].trim();
    if (path === '/dev/null') {
      problems.push('diff creates or deletes a file (only modifications allowed)');
      continue;
    }
    if (!path.endsWith('.mjs')) {
      problems.push(`diff touches non-.mjs file "${path}"`);
      continue;
    }
    if (path.includes('..') || path.startsWith('/')) {
      problems.push(`diff has suspicious path "${path}"`);
      continue;
    }
    files.add(path);
  }
  if (files.size === 0 && problems.length === 0) {
    problems.push('diff contains no recognizable file headers');
  }
  return { files: [...files], problems };
}

// Rate limit state: per-agent-group recent patch attempts. In-memory; resets
// on NanoClaw restart. Single process, no contention.
interface PatchRecord {
  ts: number;
  reverted: boolean;
}
const patchHistory = new Map<string, PatchRecord[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_HOURLY_LIMIT = 5;
const REVERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown after a revert

function checkRateLimit(agentGroupId: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  const recent = (patchHistory.get(agentGroupId) ?? []).filter((p) => now - p.ts < RATE_WINDOW_MS);
  patchHistory.set(agentGroupId, recent);

  if (recent.length >= RATE_HOURLY_LIMIT) {
    return { ok: false, reason: `rate limit: max ${RATE_HOURLY_LIMIT} patches/hour (have ${recent.length} in last hour)` };
  }
  const lastReverted = [...recent].reverse().find((p) => p.reverted);
  if (lastReverted && now - lastReverted.ts < REVERT_COOLDOWN_MS) {
    const minRemaining = Math.ceil((REVERT_COOLDOWN_MS - (now - lastReverted.ts)) / 60_000);
    return { ok: false, reason: `cooldown: last patch was reverted; ${minRemaining}m until you can try again` };
  }
  return { ok: true };
}

function recordPatch(agentGroupId: string, reverted: boolean): void {
  const list = patchHistory.get(agentGroupId) ?? [];
  list.push({ ts: Date.now(), reverted });
  patchHistory.set(agentGroupId, list);
}

async function notifyAdminMatrix(agentGroupId: string, text: string): Promise<void> {
  const approvers = pickApprover(agentGroupId);
  const target = await pickApprovalDelivery(approvers, '');
  if (!target) {
    log.warn('patch_bridge: no admin DM target for post-hoc notification');
    return;
  }
  const adapter = getDeliveryAdapter();
  if (!adapter) {
    log.warn('patch_bridge: no delivery adapter for post-hoc notification');
    return;
  }
  try {
    await adapter.deliver(
      target.messagingGroup.channel_type,
      target.messagingGroup.platform_id,
      null,
      'chat',
      JSON.stringify({ text, sender: 'pero', senderId: 'system' }),
    );
  } catch (err) {
    log.warn('patch_bridge: post-hoc admin notification failed', { err });
  }
}

export async function handlePatchBridge(content: Record<string, unknown>, session: Session): Promise<void> {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notifyAgent(session, 'patch_bridge failed: agent group not found.');
    return;
  }

  const description = ((content.description as string) || '').trim();
  const diff = (content.diff as string) || '';

  if (!description) {
    notifyAgent(session, 'patch_bridge failed: description is required.');
    return;
  }
  if (description.length > MAX_DESCRIPTION) {
    notifyAgent(session, `patch_bridge failed: description exceeds ${MAX_DESCRIPTION} chars.`);
    return;
  }
  if (!diff) {
    notifyAgent(session, 'patch_bridge failed: diff is required.');
    return;
  }
  if (diff.length > MAX_DIFF_BYTES) {
    notifyAgent(session, `patch_bridge failed: diff exceeds ${MAX_DIFF_BYTES} bytes.`);
    log.warn('patch_bridge: oversized diff rejected', { size: diff.length });
    return;
  }

  const { files, problems } = affectedFiles(diff);
  if (problems.length > 0) {
    notifyAgent(session, `patch_bridge failed: ${problems.join('; ')}.`);
    return;
  }

  const rate = checkRateLimit(session.agent_group_id);
  if (!rate.ok) {
    notifyAgent(session, `patch_bridge refused: ${rate.reason}`);
    log.info('patch_bridge: rate-limited', { agentGroupId: session.agent_group_id, reason: rate.reason });
    return;
  }

  // Autonomous apply — no approval gate. Safety net is the validator above
  // + health-check-with-revert in applyPatchBridge + daily backups + git history.
  const result = await applyPatchBridge({
    session,
    payload: { description, diff, files },
    notify: (text) => notifyAgent(session, text),
  });

  recordPatch(session.agent_group_id, result.reverted);

  // Post-hoc admin notification — every attempt, success or failure
  if (result.ok && result.commitSha) {
    const short = result.commitSha.slice(0, 7);
    const summary = description.length > 120 ? `${description.slice(0, 120)}…` : description;
    await notifyAdminMatrix(
      session.agent_group_id,
      `🔧 ${agentGroup.name} applied bridge patch ${short}: ${summary}\nhttps://github.com/Quotz/taskosaur-mcp/commit/${result.commitSha}`,
    );
  } else if (result.reverted) {
    await notifyAdminMatrix(
      session.agent_group_id,
      `⚠️ ${agentGroup.name} attempted a bridge patch but it was auto-reverted: ${result.reason ?? 'unknown reason'}`,
    );
  } else if (!result.ok) {
    await notifyAdminMatrix(
      session.agent_group_id,
      `❌ ${agentGroup.name}'s bridge patch was rejected at validate-time: ${result.reason ?? 'unknown reason'}`,
    );
  }
}

export async function handleAddMcpServer(content: Record<string, unknown>, session: Session): Promise<void> {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notifyAgent(session, 'add_mcp_server failed: agent group not found.');
    return;
  }
  const serverName = content.name as string;
  const command = content.command as string;
  if (!serverName || !command) {
    notifyAgent(session, 'add_mcp_server failed: name and command are required.');
    return;
  }
  await requestApproval({
    session,
    agentName: agentGroup.name,
    action: 'add_mcp_server',
    payload: {
      name: serverName,
      command,
      args: (content.args as string[]) || [],
      env: (content.env as Record<string, string>) || {},
    },
    title: 'Add MCP Request',
    question: `Agent "${agentGroup.name}" is attempting to add a new MCP server:\n${serverName} (${command})`,
  });
}
