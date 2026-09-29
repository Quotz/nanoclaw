import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';

// Fork patch: Hindsight auto-memory. Agents forget to call the hindsight MCP
// tools, so recall runs on UserPromptSubmit (results land as additionalContext)
// and every finished turn is retained fire-and-forget. Zero config: it turns on
// only when the group already wires an http MCP server named `hindsight` at
// `http://<host>:<port>/mcp/<bank>/`; base URL and bank come from that URL.
// HINDSIGHT_AUTO=0 turns it off. Soft-fail everywhere, and memory contents are
// never logged. Replayed by .nanoclaw-migrations/guide.md.

const RECALL_TIMEOUT_MS = 5000;
const RETAIN_TIMEOUT_MS = 10000;
const RECALL_QUERY_CHARS = 2000;
const MIN_RECALL_CHARS = 15;
const MIN_RETAIN_CHARS = 40;
const RETAIN_CONTEXT = 'conversation between Andrey and Pero (NanoClaw)';
const MCP_URL_RE = /^(https?:\/\/[^/\s]+)\/mcp\/([^/\s]+)\/?$/;
const MESSAGE_RE = /<message\b[^>]*>([\s\S]*?)<\/message>/g;

export interface HindsightTarget {
  baseUrl: string;
  bank: string;
}

type Log = (msg: string) => void;

export function resolveHindsightTarget(
  mcpServers: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env,
): HindsightTarget | null {
  if (env.HINDSIGHT_AUTO === '0') return null;
  const server = mcpServers.hindsight as { type?: unknown; url?: unknown } | undefined;
  if (!server || server.type !== 'http' || typeof server.url !== 'string') return null;
  const match = MCP_URL_RE.exec(server.url.trim());
  return match ? { baseUrl: match[1], bank: match[2] } : null;
}

/** Inner text of the formatter's `<message …>` blocks, so metadata never reaches the embeddings. */
export function plainText(text: string): string {
  const inner = [...text.matchAll(MESSAGE_RE)].map((m) => m[1].trim()).filter(Boolean);
  return (inner.length ? inner.join('\n') : text).trim();
}

function bankUrl(target: HindsightTarget, suffix: string): string {
  return `${target.baseUrl}/v1/default/banks/${target.bank}/memories${suffix}`;
}

function post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

interface RecallResult {
  text?: string;
  occurred_start?: string | null;
  mentioned_at?: string | null;
}

async function recall(target: HindsightTarget, query: string, log: Log): Promise<string | null> {
  try {
    const res = await post(bankUrl(target, '/recall'), { query, budget: 'mid', max_tokens: 1500 }, RECALL_TIMEOUT_MS);
    if (!res.ok) {
      log(`Hindsight recall HTTP ${res.status} (soft-fail)`);
      return null;
    }
    const { results = [] } = (await res.json()) as { results?: RecallResult[] };
    const lines = results
      .filter((r) => r.text?.trim())
      .map((r) => {
        const date = (r.occurred_start || r.mentioned_at || '').slice(0, 10);
        return `- ${r.text!.trim()}${date ? ` (${date})` : ''}`;
      });
    return lines.length ? lines.join('\n') : null;
  } catch (err) {
    log(`Hindsight recall failed (soft-fail): ${err instanceof Error ? err.name : 'error'}`);
    return null;
  }
}

function retain(target: HindsightTarget, sessionId: string, content: string, log: Log): void {
  const item = {
    content,
    context: RETAIN_CONTEXT,
    document_id: `nanoclaw-${sessionId}`,
    update_mode: 'append',
  };
  post(bankUrl(target, ''), { items: [item], async: true }, RETAIN_TIMEOUT_MS)
    .then((res) => {
      if (!res.ok) log(`Hindsight retain HTTP ${res.status} (soft-fail)`);
    })
    .catch((err) => log(`Hindsight retain failed (soft-fail): ${err instanceof Error ? err.name : 'error'}`));
}

/** Hooks for one query. The pending user text pairs a prompt with the turn's final reply. */
export function createHindsightHooks(
  target: HindsightTarget,
  log: Log,
): { UserPromptSubmit: HookCallback; Stop: HookCallback } {
  let pendingUser: string | null = null;
  return {
    UserPromptSubmit: async (input) => {
      const user = plainText((input as { prompt?: string }).prompt ?? '');
      pendingUser = user;
      if (user.length < MIN_RECALL_CHARS) return { continue: true };
      const recalled = await recall(target, user.slice(-RECALL_QUERY_CHARS), log);
      if (!recalled) return { continue: true };
      const additionalContext = [
        '<memory-context source="hindsight">',
        'Facts from long-term memory that may be relevant to this turn. Use them silently; do not announce the lookup.',
        recalled,
        '</memory-context>',
      ].join('\n');
      return { continue: true, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } };
    },
    Stop: async (input) => {
      const i = input as { session_id?: string; last_assistant_message?: string };
      const user = pendingUser;
      pendingUser = null;
      const assistant = plainText(i.last_assistant_message ?? '');
      // A turn that replied only via send_message has no final text; the user's
      // side still carries the facts, so retain it alone rather than drop it.
      if (user && i.session_id && user.length + assistant.length >= MIN_RETAIN_CHARS) {
        retain(target, i.session_id, assistant ? `User: ${user}\n\nAssistant: ${assistant}` : `User: ${user}`, log);
      }
      return { continue: true };
    },
  };
}
