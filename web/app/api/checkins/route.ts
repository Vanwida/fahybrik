// POST /api/checkins
//
// Daily morning check-in submission from iOS (the path the shipped client
// uses today). Aliases at /api/sync/checkins for #31 spec parity.

import type { NextResponse } from 'next/server';
import { handleCheckinPost } from '@/lib/sync/checkin-route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req: Request): Promise<NextResponse> {
  return handleCheckinPost(req);
}
