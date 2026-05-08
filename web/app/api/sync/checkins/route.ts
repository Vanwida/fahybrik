// POST /api/sync/checkins
//
// Spec-mandated alias of /api/checkins. Same handler, same auth, same body.

import type { NextResponse } from 'next/server';
import { handleCheckinPost } from '@/lib/sync/checkin-route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req: Request): Promise<NextResponse> {
  return handleCheckinPost(req);
}
