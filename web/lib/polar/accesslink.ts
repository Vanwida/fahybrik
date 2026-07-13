// Polar AccessLink v3 REST client (read-only) with on-demand token refresh.
//
// SCOPE. This client speaks the CLASSIC AccessLink v3 REST surface that the
// webhook pipeline drives: register a user, and GET the three entities a
// notification points at — an exercise, a night's sleep, a night's nightly
// recharge. Every path and field name here is taken verbatim from the official
// AccessLink OpenAPI spec (https://www.polar.com/accesslink-api/, version v3):
//   * POST /v3/users                         — register (member-id → polar-user-id)
//   * GET  /v3/exercises/{id}                — non-transactional single exercise
//   * GET  /v3/users/sleep/{date}           — sleep for a night (YYYY-MM-DD)
//   * GET  /v3/users/nightly-recharge/{date}— nightly recharge for a night
// We use the NON-transactional reads (simplest documented path); the webhook
// carries the entity id/date so we never need the create→list→commit transaction
// flow. Laps/splits are NOT available on the exercise summary (only samples/route
// which need TCX-style parsing) — that's a documented follow-up, not done here.
//
// TOKEN REFRESH. AccessLink access tokens are long-lived but do expire. This
// client refreshes on demand: before a call when `expires_at` has passed, and
// reactively on a 401, retrying the request exactly once. Polar's token endpoint
// requires HTTP Basic client auth (client_secret_basic) → `basicAuth: true`,
// same as the OAuth callback. A refreshed token is handed back via
// `onTokensRefreshed` so the caller can persist it; an unrecoverable auth failure
// fires `onAuthError` (the caller flips the connection to 'error'). Secrets are
// never logged.

import { refreshAccessToken, OAuth2Error } from '@/lib/oauth/oauth2';

export type FetchFn = typeof fetch;

// Cap any single AccessLink request so a hung provider can't wedge the webhook.
const REQUEST_TIMEOUT_MS = 15_000;
// Refresh a little BEFORE the token actually expires to avoid a guaranteed 401.
const EXPIRY_SKEW_MS = 60_000;

export type AccessLinkTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
};

// Exercise summary — the subset of `exerciseHashId` we map. Field names are the
// spec's exact (snake_case) keys. `heart_rate` is an object {average, maximum}.
export type PolarExercise = {
  id: string;
  start_time?: string;
  start_time_utc_offset?: number;
  duration?: string; // ISO-8601, e.g. "PT2H44M45S"
  calories?: number;
  distance?: number; // meters
  heart_rate?: { average?: number; maximum?: number };
  sport?: string;
  detailed_sport_info?: string;
};

// Sleep — subset of the `sleep` schema. Stage durations are seconds.
export type PolarSleep = {
  date?: string;
  sleep_start_time?: string;
  sleep_end_time?: string;
  light_sleep?: number;
  deep_sleep?: number;
  rem_sleep?: number;
  unrecognized_sleep_stage?: number;
  sleep_score?: number;
};

// Nightly recharge — subset of the `nightly-recharge` schema.
export type PolarNightlyRecharge = {
  date?: string;
  heart_rate_avg?: number;
  heart_rate_variability_avg?: number; // RMSSD, ms
  nightly_recharge_status?: number; // 1..6
  ans_charge?: number;
};

export type AccessLinkClientOptions = {
  apiBase: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  tokens: AccessLinkTokens;
  fetchImpl?: FetchFn;
  now?: () => number;
  // Persist a rotated token set (caller writes it back encrypted).
  onTokensRefreshed?: (tokens: AccessLinkTokens) => Promise<void> | void;
  // Signal an unrecoverable auth failure (caller flips connection → 'error').
  onAuthError?: () => Promise<void> | void;
};

// Minimal read surface ingest-polar depends on — lets tests inject a fake without
// standing up the whole HTTP client.
export interface PolarReadClient {
  getExercise(exerciseId: string): Promise<PolarExercise | null>;
  getSleep(date: string): Promise<PolarSleep | null>;
  getNightlyRecharge(date: string): Promise<PolarNightlyRecharge | null>;
}

export class AccessLinkError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccessLinkError';
    this.status = status;
  }
}

export class AccessLinkClient implements PolarReadClient {
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

  /**
   * Register the athlete to our partner client (required before any data read).
   * Idempotent: a 409 means the user is already registered — treated as success.
   * Returns the Polar user id when the 200 body carries it (used to backfill the
   * webhook reverse-lookup key), else null.
   */
  async registerUser(
    memberId: string,
  ): Promise<{ polarUserId: number | null; alreadyRegistered: boolean }> {
    const res = await this.request('POST', '/v3/users', {
      body: JSON.stringify({ 'member-id': memberId }),
      contentType: 'application/json',
    });
    if (res.status === 409) return { polarUserId: null, alreadyRegistered: true };
    if (!res.ok) {
      throw new AccessLinkError(`register user returned ${res.status}`, res.status);
    }
    const body = (await this.json(res)) as Record<string, unknown> | null;
    const raw = body?.['polar-user-id'];
    const polarUserId =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null;
    return {
      polarUserId: polarUserId != null && Number.isFinite(polarUserId) ? polarUserId : null,
      alreadyRegistered: false,
    };
  }

  async getExercise(exerciseId: string): Promise<PolarExercise | null> {
    return this.getEntity<PolarExercise>(`/v3/exercises/${encodeURIComponent(exerciseId)}`);
  }

  async getSleep(date: string): Promise<PolarSleep | null> {
    return this.getEntity<PolarSleep>(`/v3/users/sleep/${encodeURIComponent(date)}`);
  }

  async getNightlyRecharge(date: string): Promise<PolarNightlyRecharge | null> {
    return this.getEntity<PolarNightlyRecharge>(
      `/v3/users/nightly-recharge/${encodeURIComponent(date)}`,
    );
  }

  // GET one entity: 200 → parsed JSON; 204/404 → null (nothing available for this
  // id/date — e.g. a night with no recharge). Other non-2xx → throw.
  private async getEntity<T>(path: string): Promise<T | null> {
    const res = await this.request('GET', path);
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) {
      throw new AccessLinkError(`GET ${path} returned ${res.status}`, res.status);
    }
    return (await this.json(res)) as T | null;
  }

  // Core request with expiry pre-refresh + one reactive refresh-and-retry on 401.
  private async request(
    method: string,
    path: string,
    init?: { body?: string; contentType?: string },
  ): Promise<Response> {
    if (this.isExpired()) await this.refresh();

    let res = await this.send(method, path, init);
    if (res.status === 401) {
      // The access token was rejected mid-flight. Refresh once and retry; a second
      // 401 (or a refresh failure) is unrecoverable.
      await this.refresh();
      res = await this.send(method, path, init);
      if (res.status === 401) {
        await this.opts.onAuthError?.();
        throw new AccessLinkError(`${method} ${path} unauthorized after refresh`, 401);
      }
    }
    return res;
  }

  private async send(
    method: string,
    path: string,
    init?: { body?: string; contentType?: string },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.tokens.access_token}`,
      accept: 'application/json',
    };
    if (init?.contentType) headers['content-type'] = init.contentType;
    try {
      return await this.fetchImpl(this.url(path), {
        method,
        headers,
        body: init?.body,
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

  // Rotate the access token. No refresh token → unrecoverable. On OAuth failure →
  // onAuthError + throw. On success → adopt the new token set + notify the caller.
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
      // Polar rotates the refresh token; keep the old one if none is returned.
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
