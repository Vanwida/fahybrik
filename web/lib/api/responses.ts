import { NextResponse } from 'next/server';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function jsonOk<T>(body: T, status = 200): NextResponse<T> {
  return new NextResponse(JSON.stringify(body, jsonReplacer), {
    status,
    headers: { 'content-type': 'application/json' },
  }) as NextResponse<T>;
}

export function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0];
    if (first) return first.trim();
  }
  return req.headers.get('x-real-ip');
}
