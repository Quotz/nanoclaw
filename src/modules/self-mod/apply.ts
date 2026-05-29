/**
 * Self-modification action implementations.
 *
 * install_packages + add_mcp_server: still admin-gated (registered as
 * approval handlers in index.ts). Run on admin click; mutate container
 * config + restart.
 *
 * patch_bridge: autonomous — exported as a plain function the delivery
 * handler in request.ts calls directly, no approval queueing. The safety
 * net is structural (validation + health-check + auto-revert + git history
 * + daily backups), not human-in-the-loop.
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
import type { Session } from '../../types.js';
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

export interface PatchBridgeResult {
  ok: boolean;
  reverted: boolean;
  commitSha?: string;
  reason?: string;
}

export async function applyPatchBridge(args: {
  session: Session;
  payload: { description: string; diff: string; files: string[] };
  notify: (text: string) => void;
}): Promise<PatchBridgeResult> {
  const { session, payload, notify } = args;
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    notify('patch_bridge: agent group missing.');
    return { ok: false, reverted: false, reason: 'agent group missing' };
  }

  const { description, diff, files } = payload;
  const tmpDiff = join(tmpdir(), `patch-bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.diff`);
  await writeFile(tmpDiff, diff, 'utf8');

  const gitArgs = (...args: string[]): string[] => ['-C', BRIDGE_DIR, ...args];
  const runGit = (...args: string[]) => execFileP('git', gitArgs(...args), { timeout: 10_000 });

  log.info('patch_bridge: applying', { agentGroupId: session.agent_group_id, files, diffBytes: diff.length });

  // 1) git apply --check then apply
  try {
    await runGit('apply', '--check', tmpDiff);
  } catch (e) {
    await unlink(tmpDiff).catch(() => {});
    const detail = e instanceof Error ? e.message : String(e);
    notify(`patch_bridge failed: diff doesn't apply cleanly. ${detail.slice(0, 500)}`);
    log.warn('patch_bridge: --check failed', { err: detail });
    return { ok: false, reverted: false, reason: `diff doesn't apply: ${detail.slice(0, 200)}` };
  }
  try {
    await runGit('apply', tmpDiff);
  } catch (e) {
    await unlink(tmpDiff).catch(() => {});
    const detail = e instanceof Error ? e.message : String(e);
    notify(`patch_bridge failed during apply: ${detail}`);
    return { ok: false, reverted: false, reason: `apply failed: ${detail.slice(0, 200)}` };
  }
  await unlink(tmpDiff).catch(() => {});

  // 2) Restart bridge service
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
    const detail = e instanceof Error ? e.message : String(e);
    await revertAndRestart(`restart failed: ${detail}`);
    notify(`patch_bridge failed: bridge restart command failed. Reverted. ${detail}`.slice(0, 500));
    return { ok: false, reverted: true, reason: `restart failed: ${detail.slice(0, 200)}` };
  }

  // 3) Health check
  const health = await bridgeHealthy();
  if (!health.ok) {
    await revertAndRestart(`health failed: ${health.detail}`);
    notify(`patch_bridge failed: bridge unhealthy after restart (${health.detail}). Reverted.`);
    return { ok: false, reverted: true, reason: `unhealthy after restart: ${health.detail}` };
  }

  // 4) Commit + push
  let commitSha: string | undefined;
  try {
    await runGit('add', '-A');
    const commitMsg = `patch_bridge: ${description.slice(0, 200)}\n\nApplied autonomously by ${agentGroup.name} via NanoClaw self-mod.\nFiles: ${files.join(', ')}`;
    await execFileP('git', gitArgs('commit', '-m', commitMsg), { timeout: 10_000 });
    const sha = await runGit('rev-parse', 'HEAD');
    commitSha = sha.stdout.trim();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log.warn('patch_bridge: commit failed (changes applied + live but not recorded)', { err: detail });
    notify(`patch_bridge: applied + live but local commit failed: ${detail}. Manual git intervention recommended.`);
    // Don't revert — code IS running. Bounce agent so it sees the new tools.
  }
  if (commitSha) {
    try {
      await execFileP('git', gitArgs('push'), { timeout: 30_000 });
    } catch (e) {
      log.warn('patch_bridge: push failed (committed locally)', { err: e });
      notify(`patch_bridge: applied + committed locally but push to GitHub failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5) On-wake message + bounce agent so MCP SDK re-lists tools
  writeSessionMessage(session.agent_group_id, session.id, {
    id: `patch-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'chat',
    timestamp: new Date().toISOString(),
    platformId: session.agent_group_id,
    channelType: 'agent',
    threadId: null,
    content: JSON.stringify({
      text: `Bridge patch applied autonomously: ${description}. Verify the tool surface looks right and tell the user what changed.`,
      sender: 'system',
      senderId: 'system',
    }),
    onWake: 1,
  });
  killContainer(session.id, 'patch_bridge applied', () => {
    const s = getSession(session.id);
    if (s) wakeContainer(s);
  });
  log.info('patch_bridge: applied + agent bounced', {
    agentGroupId: session.agent_group_id,
    commitSha,
    files,
  });
  return { ok: true, reverted: false, commitSha };
}

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
