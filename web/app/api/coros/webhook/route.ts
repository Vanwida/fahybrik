// GET /api/coros/webhook — liveness only.
// POST is NOT the delivery path (FH-86). Activities arrive via MCP pull.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(): Promise<Response> {
  return new Response(
    JSON.stringify({ ok: true, ignored: true, reason: 'mcp_pull_only' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
