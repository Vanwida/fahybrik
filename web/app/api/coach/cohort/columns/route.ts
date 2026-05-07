import { cookies } from 'next/headers';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  COLUMN_KEYS,
  ColumnPrefsSchema,
  DEFAULT_COLUMNS,
  type ColumnKey,
  type ColumnPrefs,
} from '@/lib/coach/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'fahybrik_cohort_columns';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(value: string | undefined): ColumnPrefs {
  if (!value) return { visible: [...DEFAULT_COLUMNS] };
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    const valid = ColumnPrefsSchema.safeParse(parsed);
    if (valid.success) return valid.data;
  } catch {
    // fall through to default
  }
  return { visible: [...DEFAULT_COLUMNS] };
}

export async function GET() {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  const store = await cookies();
  const prefs = readCookie(store.get(COOKIE_NAME)?.value);
  return jsonOk({ prefs, available: COLUMN_KEYS as readonly ColumnKey[] });
}

export async function PUT(req: Request) {
  const session = await getCoachSession();
  if (!session) {
    return jsonError('unauthorized', 'Coach session required', 401);
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON', 400);
  }
  const parsed = ColumnPrefsSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError('invalid_request', 'Invalid column prefs', 400, parsed.error.flatten());
  }
  const store = await cookies();
  store.set({
    name: COOKIE_NAME,
    value: encodeURIComponent(JSON.stringify(parsed.data)),
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return jsonOk({ prefs: parsed.data });
}
