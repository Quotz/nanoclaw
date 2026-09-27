// Read-only smoke test for a host MCP bridge: connect, list tools, call each named tool with {} args
// (or JSON after '='), exit 1 on any error. Usage: node mcp-smoke.mjs <url> [tool[=json] ...]
// Run from the bridge dir so its node_modules resolve.
import { createRequire } from 'node:module';

// Resolve the SDK from the bridge's node_modules (cwd), not from this file's location.
const req = createRequire(`${process.cwd()}/`);
const { Client } = await import(req.resolve('@modelcontextprotocol/sdk/client/index.js'));
const { StreamableHTTPClientTransport } = await import(req.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js'));

const [url, ...calls] = process.argv.slice(2);
const c = new Client({ name: 'ops-smoke', version: '0' }, { capabilities: {} });
try {
  await c.connect(new StreamableHTTPClientTransport(new URL(url)));
  const { tools } = await c.listTools();
  if (process.env.LIST) console.log(tools.map((t) => t.name).join(' '));
  for (const spec of calls) {
    const [name, json] = spec.split(/=(.*)/s);
    const r = await c.callTool({ name, arguments: json ? JSON.parse(json) : {} });
    if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text?.slice(0, 300)}`);
  }
  console.log(`ok: ${tools.length} tools, ${calls.length} calls`);
  await c.close();
} catch (e) {
  console.error(`FAIL ${url}: ${e.message}`);
  process.exit(1);
}
