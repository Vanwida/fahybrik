import { describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/coros/webhook/route';

describe('COROS webhook is not the delivery path', () => {
  it('GET stays a liveness probe', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('POST acknowledges but does not persist (mcp_pull_only)', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true, reason: 'mcp_pull_only' });
  });
});
