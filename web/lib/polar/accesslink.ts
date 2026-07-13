// Polar AccessLink Dynamic API v4 REST client (read-only) with on-demand token
// refresh.
//
// GENERATION. Our Polar developer client is a v4 Dynamic API app (OAuth at
// auth.polar.com with granular per-endpoint scopes; verified empirically — the
// v4 token endpoint authenticates our credentials, the legacy v3 host does not).
// v4 is PULL-only (no webhooks): data is read over date-range list endpoints and
// a cron poller drives ingestion. Every path/field here is taken from the
// official v4 OpenAPI spec (https://www.polar.com/polar-api-v4/, version v4):
//   * GET /v4/data/training-sessions/list?from&to&features   (scope training_sessions:read)
//   * GET /v4/data/sleeps?from&to&features                    (scope sleep:read)
//   * GET /v4/data/nightly-recharge-results?from&to           (scope nightly_recharge:read)
//   * GET /v4/data/sports/list                                (scope sports:read)
// `from` is inclusive, `to` EXCLUSIVE, both ISO-8601 dates. Without `features`
// the range can be wide (training 90d, sleep 30d, recharge 28d) but laps/samples/
// sleep-score need `features`, which restricts the request to ONE day at a time.
// v4 has NO user-registration and NO transaction/commit dance.
//
// TOKEN REFRESH is identical to before: refresh before a call when expired and
// once reactively on a 401, then retry. Polar's token endpoint requires HTTP
// Basic client auth (basicAuth:true). Rotated tokens are handed to
// `onTokensRefreshed`; an unrecoverable auth failure fires `onAuthError`. No
// secrets are logged.

import { refreshAccessToken, OAuth2Error } from '@/lib/oauth/oauth2';

export type FetchFn = typeof fetch;

const REQUEST_TIMEOUT_MS = 15_000;
const EXPIRY_SKEW_MS = 60_000;
// Path prefix for the v4 data endpoints (appended to the configured apiBase host).
const V4_DATA = '/v4/data';

export type AccessLinkTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
};

// ── v4 response shapes (subset we map; exact keys per the official spec) ───────

export type V4SportReference = { id?: string };

export type V4Statistic = {
  type?: string; // StatisticsStatisticsType, e.g. STATISTICS_TYPE_HEART_RATE
  min?: number;
  avg?: number;
  max?: number;
};

export type V4Lap = {
  splitTimeMillis?: number; // elapsed from exercise start
  durationMillis?: number;
  distanceMeters?: number;
  statistics?: { statistics?: V4Statistic[] };
};

export type V4Exercise = {
  startTime?: string; // local
  stopTime?: string;
  durationMillis?: number;
  distanceMeters?: number;
  calories?: number;
  timezoneOffsetMinutes?: number;
  sport?: V4SportReference;
  laps?: { laps?: V4Lap[]; autoLaps?: V4Lap[] };
};

export type V4TrainingSession = {
  identifier?: { id?: string };
  startTime?: string; // local time
  stopTime?: string;
  durationMillis?: number;
  distanceMeters?: number;
  calories?: number;
  hrAvg?: number;
  hrMax?: number;
  timezoneOffsetMinutes?: number;
  sport?: V4SportReference;
  exercises?: V4Exercise[];
};

export type V4NightSleep = {
  sleepDate?: string;
  sleepScore?: { sleepScore?: number };
  sleepEvaluation?: {
    asleepDuration?: string; // "27000s"
    sleepSpan?: string;
    phaseDurations?: { rem?: string; light?: string; deep?: string; unknown?: string; wake?: string };
  };
};

export type V4NightlyRechargeResult = {
  date?: string;
  recoveryIndicator?: number; // 1..6
  meanNightlyRecoveryRmssd?: number; // HRV RMSSD, ms
  ansStatus?: number;
};

export type V4Sport = {
  id?: V4SportReference;
  name?: string;
  parentSport?: V4SportReference;
};

export type AccessLinkClientOptions = {
  apiBase: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  tokens: AccessLinkTokens;
  fetchImpl?: FetchFn;
  now?: () => number;
  onTokensRefreshed?: (tokens: AccessLinkTokens) => Promise<void> | void;
  onAuthError?: () => Promise<void> | void;
};

// Minimal read surface the poller depends on — lets tests inject a fake.
export interface PolarV4Client {
  listTrainingSessions(from: string, to: string, features?: string[]): Promise<V4TrainingSession[]>;
  listSleeps(from: string, to: string, features?: string[]): Promise<V4NightSleep[]>;
  listNightlyRecharge(from: string, to: string): Promise<V4NightlyRechargeResult[]>;
  listSports(): Promise<V4Sport[]>;
}

export class AccessLinkError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccessLinkError';
    this.status = status;
  }
}

export class AccessLinkClient implements PolarV4Client {
  private tokens: AccessLinkTokens;
  private readonly opts: AccessLinkClientOptions;
  private readonly fetchImpl: FetchFn;
  private readonly now: () => number;

  constructor(opts: AccessLinkClientOptions) {
    this.opts = opts;
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  async listTrainingSessions(
    from: string,
    to: string,
    features?: string[],
  ): Promise<V4TrainingSession[]> {
    const body = await this.getJson<{ trainingSessions?: V4TrainingSession[] }>(
      this.withQuery('/training-sessions/list', from, to, features),
    );
    return body?.trainingSessions ?? [];
  }

  async listSleeps(from: string, to: string, features?: string[]): Promise<V4NightSleep[]> {
    const body = await this.getJson<{ nightSleeps?: V4NightSleep[] }>(
      this.withQuery('/sleeps', from, to, features),
    );
    return body?.nightSleeps ?? [];
  }

  async listNightlyRecharge(from: string, to: string): Promise<V4NightlyRechargeResult[]> {
    const body = await this.getJson<{
      nightlyRechargeResults?: { nightlyRechargeResults?: V4NightlyRechargeResult[] };
    }>(this.withQuery('/nightly-recharge-results', from, to));
    return body?.nightlyRechargeResults?.nightlyRechargeResults ?? [];
  }

  async listSports(): Promise<V4Sport[]> {
    const body = await this.getJson<{ sports?: V4Sport[] }>('/sports/list');
    return body?.sports ?? [];
  }

  private withQuery(path: string, from: string, to: string, features?: string[]): string {
    const params = new URLSearchParams({ from, to });
    for (const f of features ?? []) params.append('features', f);
    return `${path}?${params.toString()}`;
  }

  // GET a v4 data endpoint: 200 → parsed JSON; 204/404 → null. Other non-2xx → throw.
  private async getJson<T>(path: string): Promise<T | null> {
    const res = await this.request('GET', `${V4_DATA}${path}`);
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new AccessLinkError(`GET ${path} returned ${res.status}`, res.status);
    return (await this.json(res)) as T | null;
  }

  // Core request with expiry pre-refresh + one reactive refresh-and-retry on 401.
  private async request(method: string, path: string): Promise<Response> {
    if (this.isExpired()) await this.refresh();
    let res = await this.send(method, path);
    if (res.status === 401) {
      await this.refresh();
      res = await this.send(method, path);
      if (res.status === 401) {
        await this.opts.onAuthError?.();
        throw new AccessLinkError(`${method} ${path} unauthorized after refresh`, 401);
      }
    }
    return res;
  }

  private async send(method: string, path: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchImpl(this.url(path), {
        method,
        headers: { authorization: `Bearer ${this.tokens.access_token}`, accept: 'application/json' },
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
      throw new AccessLinkError('no refresh token available', 401);
    }
    let rotated;
    try {
      rotated = await refreshAccessToken({
        tokenEndpoint: this.opts.tokenEndpoint,
        clientId: this.opts.clientId,
        clientSecret: this.opts.clientSecret,
        refreshToken,
        basicAuth: true,
      });
    } catch (e) {
      await this.opts.onAuthError?.();
      if (e instanceof OAuth2Error) {
        throw new AccessLinkError(`token refresh failed: ${e.message}`, e.status || 401);
      }
      throw new AccessLinkError(`token refresh failed: ${(e as Error).message}`, 401);
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

  private url(path: string): string {
    const base = this.opts.apiBase.replace(/\/+$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async json(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

// Read a typed statistic's average out of a v4 statistics array.
export function statAvg(stats: V4Statistic[] | undefined, type: string): number | undefined {
  const hit = stats?.find((s) => s.type === type);
  return typeof hit?.avg === 'number' ? hit.avg : undefined;
}

export function statMax(stats: V4Statistic[] | undefined, type: string): number | undefined {
  const hit = stats?.find((s) => s.type === type);
  return typeof hit?.max === 'number' ? hit.max : undefined;
}
