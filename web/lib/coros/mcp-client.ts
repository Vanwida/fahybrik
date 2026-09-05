// Read-only COROS MCP client (Streamable HTTP JSON-RPC).
//
// Apple / COROS own the activity record. We only call the official tools:
//   querySportRecords, getActivityDetail, downloadActivityFitFiles,
//   queryActivityFitFileDownloadUrls
// Write/push tools are never called. 50 FIT files / OAuth account / calendar day.

import { refreshAccessToken, OAuth2Error } from '@/lib/oauth/oauth2';

export type FetchFn = typeof fetch;

const REQUEST_TIMEOUT_MS = 30_000;
const EXPIRY_SKEW_MS = 60_000;
const MCP_PROTOCOL = '2025-03-26';

export type CorosMcpTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
};

export type CorosActivitySummary = {
  id: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number | null;
  distanceMeters: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  name: string | null;
  sport: string | null;
  raw: unknown;
};

export type CorosMcpClientOptions = {
  mcpUrl: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  basicAuth?: boolean;
  tokens: CorosMcpTokens;
  fetchImpl?: FetchFn;
  now?: () => number;
  onTokensRefreshed?: (tokens: CorosMcpTokens) => Promise<void> | void;
  onAuthError?: () => Promise<void> | void;
};

export interface CorosMcpSurface {
  listActivities(from: string, to: string): Promise<CorosActivitySummary[]>;
  getActivity(activityId: string): Promise<CorosActivitySummary | null>;
  downloadFit(activityId: string): Promise<Uint8Array | null>;
}

export class CorosMcpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CorosMcpError';
    this.status = status;
  }
}

export class CorosMcpClient implements CorosMcpSurface {
  private tokens: CorosMcpTokens;
  private readonly opts: CorosMcpClientOptions;
  private readonly fetchImpl: FetchFn;
  private readonly now: () => number;
  private nextId = 1;

  constructor(opts: CorosMcpClientOptions) {
    this.opts = opts;
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  async listActivities(from: string, to: string): Promise<CorosActivitySummary[]> {
    const raw = await this.callTool('querySportRecords', {
      startDate: from,
      endDate: to,
      start_date: from,
      end_date: to,
      from,
      to,
    });
    return extractActivities(raw);
  }

  async getActivity(activityId: string): Promise<CorosActivitySummary | null> {
    const raw = await this.callTool('getActivityDetail', {
      activityId,
      activity_id: activityId,
      id: activityId,
    });
    const list = extractActivities(raw);
    return list.find((a) => a.id === activityId) ?? list[0] ?? null;
  }

  async downloadFit(activityId: string): Promise<Uint8Array | null> {
    const direct = await this.callTool('downloadActivityFitFiles', {
      activityId,
      activity_id: activityId,
      activityIds: [activityId],
      activity_ids: [activityId],
    });
    const bytes = extractFitBytes(direct);
    if (bytes) return bytes;

    const urls = await this.callTool('queryActivityFitFileDownloadUrls', {
      activityId,
      activity_id: activityId,
      activityIds: [activityId],
      activity_ids: [activityId],
    });
    const url = extractFirstUrl(urls);
    if (!url) return null;
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const body = await this.rpc('tools/call', { name, arguments: args });
    return unwrapToolResult(body);
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.isExpired()) await this.refresh();
    let res = await this.send(method, params);
    if (res.status === 401) {
      await this.refresh();
      res = await this.send(method, params);
      if (res.status === 401) {
        await this.opts.onAuthError?.();
        throw new CorosMcpError(`${method} unauthorized after refresh`, 401);
      }
    }
    if (!res.ok) throw new CorosMcpError(`${method} returned ${res.status}`, res.status);
    const parsed = await parseMcpResponse(res);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const err = (parsed as { error?: { message?: string } }).error;
      throw new CorosMcpError(err?.message ?? `${method} MCP error`, 502);
    }
    if (parsed && typeof parsed === 'object' && 'result' in parsed) {
      return (parsed as { result: unknown }).result;
    }
    return parsed;
  }

  private async send(method: string, params: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const id = this.nextId++;
    try {
      return await this.fetchImpl(this.opts.mcpUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.tokens.access_token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-protocol-version': MCP_PROTOCOL,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private isExpired(): boolean {
    const exp = this.tokens.expires_at ? this.tokens.expires_at.getTime() : null;
    return exp != null && this.now() >= exp - EXPIRY_SKEW_MS;
  }

  private async refresh(): Promise<void> {
    const refreshToken = this.tokens.refresh_token;
    if (!refreshToken) {
      await this.opts.onAuthError?.();
      throw new CorosMcpError('no refresh token available', 401);
    }
    let rotated;
    try {
      rotated = await refreshAccessToken({
        tokenEndpoint: this.opts.tokenEndpoint,
        clientId: this.opts.clientId,
        clientSecret: this.opts.clientSecret,
        refreshToken,
        basicAuth: this.opts.basicAuth,
      });
    } catch (e) {
      await this.opts.onAuthError?.();
      if (e instanceof OAuth2Error) {
        throw new CorosMcpError(`token refresh failed: ${e.message}`, e.status || 401);
      }
      throw new CorosMcpError(`token refresh failed: ${(e as Error).message}`, 401);
    }
    this.tokens = {
      access_token: rotated.access_token,
      refresh_token: rotated.refresh_token ?? this.tokens.refresh_token ?? null,
      expires_at:
        rotated.expires_in != null
          ? new Date(this.now() + rotated.expires_in * 1000)
          : this.tokens.expires_at ?? null,
    };
    await this.opts.onTokensRefreshed?.(this.tokens);
  }
}

export async function parseMcpResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  const ctype = res.headers.get('content-type') ?? '';
  if (ctype.includes('text/event-stream') || text.startsWith('event:') || text.includes('\ndata:')) {
    return parseSseJson(text);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseSseJson(text: string): unknown {
  const blocks = text.split('\n\n');
  for (let i = blocks.length - 1; i >= 0; i--) {
    const dataLines = blocks[i]!
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter((l) => l.length > 0 && l !== '[DONE]');
    if (dataLines.length === 0) continue;
    try {
      return JSON.parse(dataLines.join('\n')) as unknown;
    } catch {
      continue;
    }
  }
  return null;
}

export function unwrapToolResult(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const rec = result as Record<string, unknown>;
  const content = rec.content;
  if (Array.isArray(content)) {
    const texts: unknown[] = [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === 'string') {
        const parsed = tryJson(p.text);
        texts.push(parsed ?? p.text);
      }
      if (p.blob && typeof p.blob === 'string') texts.push({ blob: p.blob });
      if (typeof p.uri === 'string') texts.push({ url: p.uri });
    }
    if (texts.length === 1) return texts[0];
    if (texts.length > 1) return texts;
  }
  if ('structuredContent' in rec) return rec.structuredContent;
  return result;
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

export function extractActivities(raw: unknown): CorosActivitySummary[] {
  const rows = flattenRecords(raw);
  const out: CorosActivitySummary[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const parsed = parseActivityRow(row);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}

function flattenRecords(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => flattenRecords(item));
  }
  if (!raw || typeof raw !== 'object') return [];
  const rec = raw as Record<string, unknown>;
  for (const key of [
    'records',
    'activities',
    'sportRecords',
    'sport_records',
    'data',
    'items',
    'list',
    'result',
  ]) {
    if (Array.isArray(rec[key])) return flattenRecords(rec[key]);
  }
  if (looksLikeActivity(rec)) return [rec];
  return Object.values(rec).flatMap((v) => (v && typeof v === 'object' ? flattenRecords(v) : []));
}

function looksLikeActivity(rec: Record<string, unknown>): boolean {
  return pickString(rec, [
    'activityId',
    'activity_id',
    'id',
    'labelId',
    'label_id',
    'sportRecordId',
  ]) != null;
}

export function parseActivityRow(row: Record<string, unknown>): CorosActivitySummary | null {
  const id = pickString(row, [
    'activityId',
    'activity_id',
    'id',
    'labelId',
    'label_id',
    'sportRecordId',
    'recordId',
  ]);
  if (!id) return null;
  const start = pickDate(row, [
    'startTime',
    'start_time',
    'startedAt',
    'started_at',
    'beginTime',
    'begin_time',
    'startDate',
    'start_date',
  ]);
  if (!start) return null;
  const duration = pickNumber(row, [
    'duration',
    'durationSeconds',
    'duration_seconds',
    'totalTime',
    'total_time',
    'elapsedTime',
    'elapsed_time',
  ]);
  const durationSeconds =
    duration != null ? (duration > 10_000 ? Math.round(duration / 1000) : Math.round(duration)) : null;
  const end =
    pickDate(row, ['endTime', 'end_time', 'endedAt', 'ended_at', 'stopTime', 'stop_time']) ??
    (durationSeconds != null && durationSeconds > 0
      ? new Date(start.getTime() + durationSeconds * 1000)
      : new Date(start.getTime() + 60_000));
  if (end.getTime() <= start.getTime()) return null;
  return {
    id,
    startedAt: start,
    endedAt: end,
    durationSeconds:
      durationSeconds ?? Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000)),
    distanceMeters: pickNumber(row, ['distance', 'distanceMeters', 'distance_meters', 'distanceM']),
    avgHr: pickNumber(row, ['avgHr', 'avg_hr', 'averageHr', 'avgHeartRate', 'hrAvg']),
    maxHr: pickNumber(row, ['maxHr', 'max_hr', 'maxHeartRate', 'hrMax']),
    calories: pickNumber(row, ['calories', 'calorie', 'kcal']),
    name: pickString(row, ['name', 'title', 'workoutName']),
    sport: pickString(row, ['sport', 'sportType', 'sport_type', 'mode']),
    raw: row,
  };
}

export function extractFitBytes(raw: unknown): Uint8Array | null {
  const blobs = collectStrings(raw, ['blob', 'data', 'content', 'file', 'fit', 'base64']);
  for (const s of blobs) {
    const bytes = decodePossibleBase64(s);
    if (bytes && bytes.length > 12) return bytes;
  }
  return null;
}

export function extractFirstUrl(raw: unknown): string | null {
  const urls = collectStrings(raw, ['url', 'uri', 'downloadUrl', 'download_url', 'href']);
  for (const s of urls) {
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
  }
  const walk = collectAllStrings(raw);
  for (const s of walk) {
    if (s.startsWith('https://') || s.startsWith('http://')) return s;
  }
  return null;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.length > 0 && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function pickDate(row: Record<string, unknown>, keys: string[]): Date | null {
  for (const k of keys) {
    const v = row[k];
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v === 'number' && Number.isFinite(v)) {
      const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : null;
      if (ms) {
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    if (typeof v === 'string' && v.length > 0) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 1e9) {
        const d = new Date(n > 1e12 ? n : n * 1000);
        if (!Number.isNaN(d.getTime())) return d;
      }
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function collectStrings(raw: unknown, keys: string[]): string[] {
  const out: string[] = [];
  walk(raw, (rec) => {
    for (const k of keys) {
      const v = rec[k];
      if (typeof v === 'string' && v.length > 0) out.push(v);
    }
  });
  return out;
}

function collectAllStrings(raw: unknown): string[] {
  const out: string[] = [];
  walk(raw, (rec) => {
    for (const v of Object.values(rec)) {
      if (typeof v === 'string' && v.length > 0) out.push(v);
    }
  });
  return out;
}

function walk(raw: unknown, fn: (rec: Record<string, unknown>) => void): void {
  if (Array.isArray(raw)) {
    for (const item of raw) walk(item, fn);
    return;
  }
  if (!raw || typeof raw !== 'object') return;
  const rec = raw as Record<string, unknown>;
  fn(rec);
  for (const v of Object.values(rec)) walk(v, fn);
}

function decodePossibleBase64(s: string): Uint8Array | null {
  const trimmed = s.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(trimmed) || trimmed.length < 16) return null;
  try {
    const buf = Buffer.from(trimmed, trimmed.includes('-') || trimmed.includes('_') ? 'base64url' : 'base64');
    return buf.length > 0 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}
