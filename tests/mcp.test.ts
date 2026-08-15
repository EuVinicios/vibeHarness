import { buildServer } from '../src/mcp/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('mcp server', () => {
  it('exposes the lifecycle tools', async () => {
    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    for (const expected of [
      'vibe_status',
      'vibe_init',
      'vibe_prd',
      'vibe_plan',
      'vibe_pack',
      'vibe_audit',
      'vibe_doctor',
      'vibe_rules',
      'vibe_install',
    ]) {
      expect(names).toContain(expected);
    }

    const result = await client.callTool({ name: 'vibe_status', arguments: {} });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as { type: 'text'; text: string }[])[0].text);
    expect(payload.ok).toBe(true);
    expect(['init', 'prd', 'plan', 'pack', 'audit', 'doctor']).toContain(payload.data.nextAction ?? 'init');

    await client.close();
    await server.close();
  });

  it('vibe_prd without answers returns pendingQuestions, not placeholders', async () => {
    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'vibe_prd', arguments: {} });
    const payload = JSON.parse((result.content as { type: 'text'; text: string }[])[0].text);
    expect(payload.ok).toBe(false);
    expect(payload.pendingQuestions.map((q: { id: string }) => q.id)).toContain('problem');

    await client.close();
    await server.close();
  });
});
