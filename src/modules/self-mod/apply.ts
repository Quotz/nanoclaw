/**
 * Approval handlers for self-modification actions.
 *
 * The approvals module calls these when an admin clicks Approve on a
 * pending_approvals row whose action matches. Each handler mutates the
 * container config in the DB, rebuilds/kills the container as needed,
 * and writes an on_wake message so the fresh container picks up where
 * the old one left off.
 *
 * install_packages: update DB + rebuild image + kill container + on_wake.
 * add_mcp_server: update DB + kill container + on_wake.
 */
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import { buildAgentGroupImage, killContainer, wakeContainer } from '../../container-runner.js';
import { getAgentGroup } from '../../db/agent-groups.js';
import { getContainerConfig, updateContainerConfigJson } from '../../db/container-configs.js';
import { getSession } from '../../db/sessions.js';
import type { McpServerConfig } from '../../container-config.js';
import { log } from '../../log.js';
import { writeSessionMessage } from '../../session-manager.js';
import type { ApprovalHandler } from '../approvals/index.js';

const execFileP = promisify(execFile);
const BRIDGE_DIR = '/opt/taskosaur-mcp';
const BRIDGE_HEALTH_URL = 'http://127.0.0.1:8889/health';
const RESTART_TIMEOUT_MS = 15_000;
const HEALTH_RETRIES = 10;
const HEALTH_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bridgeHealthy(): Promise<{ ok: boolean; detail?: string }> {
  for (let attempt = 0; attempt < HEALTH_RETRIES; attempt++) {
    try {
      const res = await fetch(BRIDGE_HEALTH_URL, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return { ok: true };
    } catch {
      /* retry */
    }
    await sleep(HEALTH_RETRY_DELAY_MS);
  }
  return { ok: false, detail: `health endpoint did not return 200 within ${HEALTH_RETRIES * HEALTH_RETRY_DELAY_MS}ms` };
}

export const applyInstallPackages: ApprovalHandler = async ({ session, payload, userId, notify }) => {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notify('install_packages approved but agent group missing.');
    return;
  }

  const configRow = getContainerConfig(agentGroup.id);
  if (!configRow) {
    notify('install_packages approved but container config missing.');
    return;
  }

  // Append new packages to existing lists in the DB (deduplicated)
  if (payload.apt) {
    const existing = JSON.parse(configRow.packages_apt) as string[];
    for (const pkg of payload.apt as string[]) {
      if (!existing.includes(pkg)) existing.push(pkg);
    }
    updateContainerConfigJson(agentGroup.id, 'packages_apt', existing);
  }
  if (payload.npm) {
    const existing = JSON.parse(configRow.packages_npm) as string[];
    for (const pkg of payload.npm as string[]) {
      if (!existing.includes(pkg)) existing.push(pkg);
    }
    updateContainerConfigJson(agentGroup.id, 'packages_npm', existing);
  }

  const pkgs = [
    ...((payload.apt as string[] | undefined) || []),
    ...((payload.npm as string[] | undefined) || []),
  ].join(', ');
  log.info('Package install approved', { agentGroupId: session.agent_group_id, userId });
  try {
    await buildAgentGroupImage(session.agent_group_id);
    writeSessionMessage(session.agent_group_id, session.id, {
      id: `appr-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'chat',
      timestamp: new Date().toISOString(),
      platformId: session.agent_group_id,
      channelType: 'agent',
      threadId: null,
      content: JSON.stringify({
        text: `Packages installed (${pkgs}) and container rebuilt. Verify the new packages are available (e.g. run them or check versions) and report the result to the user.`,
        sender: 'system',
        senderId: 'system',
      }),
      onWake: 1,
    });
    killContainer(session.id, 'rebuild applied', () => {
      const s = getSession(session.id);
      if (s) wakeContainer(s);
    });
    log.info('Container rebuild completed (bundled with install)', { agentGroupId: session.agent_group_id });
  } catch (e) {
    notify(
      `Packages added to config (${pkgs}) but rebuild failed: ${e instanceof Error ? e.message : String(e)}. Tell the user — an admin will need to retry the install_packages request or inspect the build logs.`,
    );
    log.error('Bundled rebuild failed after install approval', { agentGroupId: session.agent_group_id, err: e });
  }
};

export const applyPatchBridge: ApprovalHandler = async ({ session, payload, userId, notify }) => {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notify('patch_bridge approved but agent group missing.');
    return;
  }

  const description = payload.description as string;
  const diff = payload.diff as string;
  const files = (payload.files as string[]) || [];

  const tmpDiff = join(tmpdir(), `patch-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.diff`);
  await writeFile(tmpDiff, diff, 'utf8');

  const gitArgs = (...args: string[]): string[] => ['-C', BRIDGE_DIR, ...args];
  const runGit = (...args: string[]) => execFileP('git', gitArgs(...args), { timeout: 10_000 });

  log.info('patch_bridge: applying', { agentGroupId: session.agent_group_id, userId, files, diffBytes: diff.length });

  // 1) git apply --check (sanity) then apply for real
  try {
    await runGit('apply', '--check', tmpDiff);
  } catch (e) {
    await unlink(tmpDiff).catch(() => {});
    const detail = e instanceof Error ? e.message : String(e);
    notify(`patch_bridge failed: diff doesn't apply cleanly. ${detail.slice(0, 500)}`);
    log.warn('patch_bridge: --check failed', { err: detail });
    return;
  }
  try {
    await runGit('apply', tmpDiff);
  } catch (e) {
    await unlink(tmpDiff).catch(() => {});
    notify(`patch_bridge failed during apply: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  await unlink(tmpDiff).catch(() => {});

  // 2) Restart bridge service (requires sudo NOPASSWD entry on host)
  const revertAndRestart = async (reason: string) => {
    log.warn('patch_bridge: reverting', { reason });
    try {
      await runGit('checkout', '--', '.');
      await execFileP('sudo', ['-n', '/bin/systemctl', 'restart', 'taskosaur-mcp'], { timeout: RESTART_TIMEOUT_MS });
    } catch (revertErr) {
      log.error('patch_bridge: revert failed', { err: revertErr });
    }
  };
  try {
    await execFileP('sudo', ['-n', '/bin/systemctl', 'restart', 'taskosaur-mcp'], { timeout: RESTART_TIMEOUT_MS });
  } catch (e) {
    await revertAndRestart(`restart failed: ${e instanceof Error ? e.message : String(e)}`);
    notify(`patch_bridge failed: bridge restart command failed. Reverted. ${e instanceof Error ? e.message : ''}`.slice(0, 500));
    return;
  }

  // 3) Health check
  const health = await bridgeHealthy();
  if (!health.ok) {
    await revertAndRestart(`health failed: ${health.detail}`);
    notify(`patch_bridge failed: bridge unhealthy after restart (${health.detail}). Reverted to previous version.`);
    return;
  }

  // 4) Commit + push
  try {
    await runGit('add', '-A');
    const commitMsg = `patch_bridge: ${description.slice(0, 200)}\n\nApplied via NanoClaw self-mod approval.\nAgent: ${agentGroup.name}\nApprover-user-id: ${userId}\nFiles: ${files.join(', ')}`;
    await execFileP('git', gitArgs('commit', '-m', commitMsg), { timeout: 10_000 });
  } catch (e) {
    log.warn('patch_bridge: commit failed (changes applied + live, but not recorded)', { err: e });
    notify(
      `patch_bridge: applied + live but local commit failed: ${e instanceof Error ? e.message : String(e)}. Manual git intervention recommended.`,
    );
    // Don't bounce agent — they'll see the change anyway. Don't revert — code IS running.
    return;
  }
  try {
    await execFileP('git', gitArgs('push'), { timeout: 30_000 });
  } catch (e) {
    log.warn('patch_bridge: push failed (committed locally)', { err: e });
    // Non-fatal; commit landed. Tell admin to investigate.
    notify(
      `patch_bridge: applied + committed locally, but push to GitHub failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // 5) On-wake message + bounce agent so its SDK re-lists tools
  writeSessionMessage(session.agent_group_id, session.id, {
    id: `appr-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'chat',
    timestamp: new Date().toISOString(),
    platformId: session.agent_group_id,
    channelType: 'agent',
    threadId: null,
    content: JSON.stringify({
      text: `Bridge patch applied: ${description}. Verify the tool surface looks right (call \`tools/list\` semantics via a quick check, e.g. run one of the changed tools) and report to the user.`,
      sender: 'system',
      senderId: 'system',
    }),
    onWake: 1,
  });
  killContainer(session.id, 'patch_bridge applied', () => {
    const s = getSession(session.id);
    if (s) wakeContainer(s);
  });
  log.info('patch_bridge: applied + committed + pushed + agent bounced', {
    agentGroupId: session.agent_group_id,
    userId,
    files,
  });
};

export const applyAddMcpServer: ApprovalHandler = async ({ session, payload, userId, notify }) => {
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notify('add_mcp_server approved but agent group missing.');
    return;
  }

  const configRow = getContainerConfig(agentGroup.id);
  if (!configRow) {
    notify('add_mcp_server approved but container config missing.');
    return;
  }

  // Add the new MCP server to the existing map in the DB
  const servers = JSON.parse(configRow.mcp_servers) as Record<string, McpServerConfig>;
  servers[payload.name as string] = {
    command: payload.command as string,
    args: (payload.args as string[]) || [],
    env: (payload.env as Record<string, string>) || {},
  };
  updateContainerConfigJson(agentGroup.id, 'mcp_servers', servers);

  writeSessionMessage(session.agent_group_id, session.id, {
    id: `appr-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'chat',
    timestamp: new Date().toISOString(),
    platformId: session.agent_group_id,
    channelType: 'agent',
    threadId: null,
    content: JSON.stringify({
      text: `MCP server "${payload.name}" added. Verify it's available (e.g. list your tools) and report the result to the user.`,
      sender: 'system',
      senderId: 'system',
    }),
    onWake: 1,
  });
  killContainer(session.id, 'mcp server added', () => {
    const s = getSession(session.id);
    if (s) wakeContainer(s);
  });
  log.info('MCP server add approved', { agentGroupId: session.agent_group_id, userId });
};
