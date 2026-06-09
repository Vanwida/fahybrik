import { jsonError, jsonOk, getClientIp } from '@/lib/api/responses';
import {
  DemoLoginError,
  establishCoachSession,
  isCoachDemoLoginEnabled,
  resolveDemoCoachEmail,
} from '@/lib/auth/demo-login';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // When disabled, respond 404 (not 403) so we don't disclose that this
  // endpoint exists on a production deployment.
  if (!isCoachDemoLoginEnabled()) {
    return jsonError('not_found', 'Not found', 404);
  }

  try {
    const email = resolveDemoCoachEmail();
    const coach = await establishCoachSession({
      email,
      user_agent: req.headers.get('user-agent'),
      ip: getClientIp(req),
    });
    return jsonOk({ email: coach.email, full_name: coach.full_name });
  } catch (err) {
    if (err instanceof DemoLoginError && err.code === 'not_allowed') {
      return jsonError('forbidden', 'Email not on coach allowlist', 403);
    }
    return jsonError('internal', 'Could not start demo session', 500);
  }
}
