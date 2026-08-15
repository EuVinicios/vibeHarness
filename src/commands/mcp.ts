import { runMcpServer } from '../mcp/server.js';

/**
 * `vibe-harness mcp` — runs the stdio MCP server that lets AI clients drive
 * the harness (tools: vibe_status, vibe_init, vibe_prd, vibe_plan, vibe_pack,
 * vibe_audit, vibe_doctor, vibe_rules, vibe_install). stdout is the
 * JSON-RPC stream; logs go to stderr.
 */
export async function mcpCommand(): Promise<void> {
  await runMcpServer();
}
