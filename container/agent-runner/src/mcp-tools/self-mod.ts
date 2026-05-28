/**
 * Self-modification MCP tools: install_packages, add_mcp_server, patch_bridge.
 *
 * Fire-and-forget — the tool writes a system action row and returns
 * immediately. The host processes the request (including admin approval)
 * and notifies the agent via a chat message when complete. Admin approval
 * is approval to apply the change: `install_packages` auto-rebuilds the
 * per-agent image and restarts the container; `add_mcp_server` updates
 * `container.json` and restarts; `patch_bridge` applies a unified diff to
 * the host-side taskosaur-mcp bridge source, restarts it, health-checks,
 * commits + pushes the change, and bounces the agent.
 *
 * Inputs are sanitized at the tool boundary AND re-validated on the host
 * side (defense in depth).
 */
import { writeMessageOut } from '../db/messages-out.js';
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function log(msg: string): void {
  console.error(`[mcp-tools] ${msg}`);
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

const APT_RE = /^[a-z0-9][a-z0-9._+-]*$/;
const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const MAX_PACKAGES = 20;

export const installPackages: McpToolDefinition = {
  tool: {
    name: 'install_packages',
    description:
      'Install apt and/or npm packages into YOUR per-agent container image. Requires admin approval; fire-and-forget. On approval, the image is rebuilt and the container is restarted automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apt: { type: 'array', items: { type: 'string' }, description: 'apt packages to install (names only, no version specs or flags)' },
        npm: { type: 'array', items: { type: 'string' }, description: 'npm packages to install globally (names only, no version specs)' },
        reason: { type: 'string', description: 'Why these packages are needed' },
      },
    },
  },
  async handler(args) {
    const apt = (args.apt as string[]) || [];
    const npm = (args.npm as string[]) || [];
    if (apt.length === 0 && npm.length === 0) return err('At least one apt or npm package is required');
    if (apt.length + npm.length > MAX_PACKAGES) return err(`Maximum ${MAX_PACKAGES} packages per request`);

    const invalidApt = apt.find((p) => !APT_RE.test(p));
    if (invalidApt) return err(`Invalid apt package name: "${invalidApt}". Only lowercase letters, digits, and ._+- allowed.`);
    const invalidNpm = npm.find((p) => !NPM_RE.test(p));
    if (invalidNpm) return err(`Invalid npm package name: "${invalidNpm}". No version specs or shell characters.`);

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'install_packages',
        apt,
        npm,
        reason: (args.reason as string) || '',
      }),
    });

    log(`install_packages: ${requestId} → apt=[${apt.join(',')}] npm=[${npm.join(',')}]`);
    return ok(`Package install request submitted. You will be notified when admin approves or rejects.`);
  },
};

export const addMcpServer: McpToolDefinition = {
  tool: {
    name: 'add_mcp_server',
    description:
      'Wire an EXISTING third-party MCP server into YOUR per-agent runtime config — you must already know the exact `command` + `args` to invoke it (e.g. `npx @modelcontextprotocol/server-github`). Requires admin approval; fire-and-forget.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'MCP server name (unique identifier)' },
        command: { type: 'string', description: 'Command to run the MCP server' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        env: { type: 'object', description: 'Environment variables for the server' },
      },
      required: ['name', 'command'],
    },
  },
  async handler(args) {
    const name = args.name as string;
    const command = args.command as string;
    if (!name || !command) return err('name and command are required');

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'add_mcp_server',
        name,
        command,
        args: (args.args as string[]) || [],
        env: (args.env as Record<string, string>) || {},
      }),
    });

    log(`add_mcp_server: ${requestId} → "${name}" (${command})`);
    return ok(`MCP server request submitted. You will be notified when admin approves or rejects.`);
  },
};

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
      problems.push('diff creates or deletes a file (only modifications to existing files are allowed)');
      continue;
    }
    if (!path.endsWith('.mjs')) {
      problems.push(`diff touches non-.mjs file "${path}" (only .mjs files allowed)`);
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

export const patchBridge: McpToolDefinition = {
  tool: {
    name: 'patch_bridge',
    description:
      'Propose a patch to the host-side taskosaur-mcp bridge source (e.g. fix a tool bug, add a new tool). The diff is a unified-format patch against the bridge working tree at /opt/taskosaur-mcp/. Only modifications to existing *.mjs files are allowed. On admin approval: diff applied → service restarted → health-checked → on success committed + pushed → container bounced. On any failure, the patch is reverted and the bridge is restored.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description: 'Short explanation of what the patch does and why (shown to admin in approval card).',
        },
        diff: {
          type: 'string',
          description:
            'Unified diff in standard "git diff" format. Headers must look like "--- a/tools.mjs\\n+++ b/tools.mjs". No new-file / deleted-file diffs; only modifications to existing .mjs files.',
        },
      },
      required: ['description', 'diff'],
    },
  },
  async handler(args) {
    const description = ((args.description as string) || '').trim();
    const diff = (args.diff as string) || '';

    if (!description) return err('description is required');
    if (description.length > MAX_DESCRIPTION) return err(`description must be ≤ ${MAX_DESCRIPTION} chars`);
    if (!diff) return err('diff is required');
    if (diff.length > MAX_DIFF_BYTES) return err(`diff must be ≤ ${MAX_DIFF_BYTES} bytes (got ${diff.length})`);

    const { files, problems } = affectedFiles(diff);
    if (problems.length > 0) return err(problems.join('; '));

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'patch_bridge',
        description,
        diff,
        files,
      }),
    });

    log(`patch_bridge: ${requestId} → files=[${files.join(',')}] diffBytes=${diff.length}`);
    return ok(`Bridge patch request submitted (${files.length} file${files.length === 1 ? '' : 's'}, ${diff.length}B). You will be notified when admin approves or rejects.`);
  },
};

registerTools([installPackages, addMcpServer, patchBridge]);
