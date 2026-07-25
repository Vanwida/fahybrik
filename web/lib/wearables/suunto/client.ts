// Cliente de la Suunto Cloud API para SuuntoPlus Guides (subir el entreno
// PLANIFICADO al reloj del atleta).
//
// NO CONFUNDIR CON "WORKOUT PUSH"
// -------------------------------
// La FAQ de Suunto llama "push the workouts in FIT file format" a subir una
// actividad YA COMPLETADA a la cuenta del usuario. Eso es histórico, va por otra
// API y no pinta nada en un reloj. El entreno PLANIFICADO viaja solo por Guides,
// que es lo que hay aquí.
//
// Operaciones (PDF "Suuntoplus Guide Cloud API"):
//   POST   /v2/guides/files        crear (cuerpo application/zip)
//   GET    /v2/guides/items        listar (offset, limit, fileSince)
//   PUT    /v2/guides/files/{id}   reemplazar el contenido
//   DELETE /v2/guides/files/{id}   borrar
//
// Toda llamada lleva DOS cabeceras: `Authorization: Bearer <jwt>` y
// `Ocp-Apim-Subscription-Key`. Los tokens se rotan igual que en el cliente de
// Polar: refresco preventivo por expiración y un reintento reactivo ante un 401.
// Nunca se registra ningún secreto.

import { refreshAccessToken, OAuth2Error } from '@/lib/oauth/oauth2';
import { GUIDE_CONTENT_TYPE } from './guide-package';

export type FetchFn = typeof fetch;

const REQUEST_TIMEOUT_MS = 30_000;
const EXPIRY_SKEW_MS = 60_000;
const GUIDES_FILES_PATH = '/v2/guides/files';
const GUIDES_ITEMS_PATH = '/v2/guides/items';

/** Tope por página que documenta la API (`limit`, por defecto 50). */
export const GUIDES_PAGE_DEFAULT = 50;

export type SuuntoTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: Date | null;
};

/** Metadatos que la API devuelve por guide (payload de POST/PUT y filas de GET). */
export type SuuntoGuideItem = {
  id: string;
  username?: string;
  modificationTime?: number;
  fileModificationTime?: number;
  name?: string;
  description?: string;
  shortDescription?: string;
  owner?: string;
  url?: string;
  iconUrl?: string;
  type?: string;
  activities?: number[];
  localDate?: string;
  usage?: string;
  pinned?: boolean;
  externalId?: string;
};

/** Sobre común de las respuestas: { error, payload, metadata }. */
type SuuntoEnvelope<T> = {
  error?: { description?: string } | null;
  payload?: T | null;
  metadata?: { ts?: string };
};

export class SuuntoApiError extends Error {
  status: number;
  /** `error.description` del sobre, cuando la API lo manda (p. ej. en un 400). */
  description?: string;
  constructor(message: string, status: number, description?: string) {
    super(message);
    this.name = 'SuuntoApiError';
    this.status = status;
    this.description = description;
  }
}

export interface SuuntoGuidesClientOpts {
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
  tokenEndpoint: string;
  apiBase: string;
  tokens: SuuntoTokens;
  fetchImpl?: FetchFn;
  now?: () => number;
  onTokensRefreshed?: (tokens: SuuntoTokens) => Promise<void> | void;
  onAuthError?: () => Promise<void> | void;
}

/** Resultado de crear: un `externalId` repetido NO es un fallo (ver createGuide). */
export type CreateGuideResult =
  | { status: 'created'; item: SuuntoGuideItem }
  | { status: 'duplicate'; item: SuuntoGuideItem | null };

export class SuuntoGuidesClient {
  private tokens: SuuntoTokens;
  private readonly fetchImpl: FetchFn;
  private readonly now: () => number;

  constructor(private readonly opts: SuuntoGuidesClientOpts) {
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Los tokens vigentes (pueden haber rotado durante las llamadas). */
  currentTokens(): SuuntoTokens {
    return this.tokens;
  }

  /**
   * Sube un guide nuevo. La API responde 201 con el guide creado.
   *
   * IDEMPOTENCIA: si el atleta ya tiene otro guide con el mismo `externalId`, la
   * API responde 409 Conflict. Eso NO es un error: significa que ese entreno ya
   * está en su cuenta, que es exactamente el estado que queríamos. Lo tratamos
   * como éxito y devolvemos el guide que ya existía (lo buscamos por su
   * `externalId`) para que quien llama pueda seguir trabajando con su id.
   */
  async createGuide(zip: Uint8Array, externalId?: string): Promise<CreateGuideResult> {
    const res = await this.request('POST', GUIDES_FILES_PATH, zip);
    if (res.status === 409) {
      const item = externalId ? await this.findByExternalId(externalId) : null;
      return { status: 'duplicate', item };
    }
    const item = await this.expectPayload<SuuntoGuideItem>(res, 'POST', GUIDES_FILES_PATH);
    return { status: 'created', item };
  }

  /** Reemplaza el CONTENIDO de un guide. No toca `pinned`, `username` ni `id`. */
  async updateGuide(id: string, zip: Uint8Array): Promise<SuuntoGuideItem> {
    const path = `${GUIDES_FILES_PATH}/${encodeURIComponent(id)}`;
    const res = await this.request('PUT', path, zip);
    return this.expectPayload<SuuntoGuideItem>(res, 'PUT', path);
  }

  /**
   * Crea o actualiza según el `externalId`. Es lo que quiere un plan que cambia:
   * re-subir la misma sesión debe dejar UN guide, no dos ni un conflicto.
   */
  async upsertGuide(zip: Uint8Array, externalId: string): Promise<SuuntoGuideItem> {
    const created = await this.createGuide(zip, externalId);
    if (created.status === 'created') return created.item;
    if (created.item) return this.updateGuide(created.item.id, zip);
    // 409 sin poder localizar el guide: existe pero no lo vemos (lo creó otro
    // socio, o se borró entre medias). No inventamos un id.
    throw new SuuntoApiError(
      `guide con externalId ${externalId} en conflicto y no localizable`,
      409,
    );
  }

  /**
   * Lista los guides del atleta CREADOS POR NOSOTROS (la API no devuelve los de
   * otros socios). Vienen ordenados por `fileModificationTime` descendente.
   */
  async listGuides(params?: {
    offset?: number;
    limit?: number;
    /** Epoch en milisegundos: solo guides modificados en o después de esa marca. */
    fileSince?: number;
  }): Promise<SuuntoGuideItem[]> {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.fileSince !== undefined) query.set('fileSince', String(params.fileSince));
    const suffix = query.toString();
    const path = suffix ? `${GUIDES_ITEMS_PATH}?${suffix}` : GUIDES_ITEMS_PATH;

    const res = await this.request('GET', path);
    const payload = await this.expectPayload<SuuntoGuideItem[]>(res, 'GET', path);
    return Array.isArray(payload) ? payload : [];
  }

  /**
   * Borra un guide. Un 404 se trata como éxito: si ya no está, el resultado
   * buscado (que no esté) se cumple igual — borrar dos veces no debe romper.
   */
  async deleteGuide(id: string): Promise<void> {
    const path = `${GUIDES_FILES_PATH}/${encodeURIComponent(id)}`;
    const res = await this.request('DELETE', path);
    if (res.status === 404) return;
    if (!res.ok) throw await this.toError(res, 'DELETE', path);
  }

  /** Busca en las páginas de guides el que lleva ese `externalId`. */
  async findByExternalId(externalId: string): Promise<SuuntoGuideItem | null> {
    let offset = 0;
    for (;;) {
      const page = await this.listGuides({ offset, limit: GUIDES_PAGE_DEFAULT });
      const hit = page.find((item) => item.externalId === externalId);
      if (hit) return hit;
      if (page.length < GUIDES_PAGE_DEFAULT) return null;
      offset += page.length;
    }
  }

  // ── Transporte ─────────────────────────────────────────────────────────────

  // Refresco preventivo si el token ha expirado + un reintento reactivo ante 401.
  private async request(method: string, path: string, body?: Uint8Array): Promise<Response> {
    if (this.isExpired()) await this.refresh();
    let res = await this.send(method, path, body);
    if (res.status === 401) {
      await this.refresh();
      res = await this.send(method, path, body);
      if (res.status === 401) {
        await this.opts.onAuthError?.();
        throw new SuuntoApiError(`${method} ${path} no autorizado tras refrescar`, 401);
      }
    }
    return res;
  }

  private async send(method: string, path: string, body?: Uint8Array): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.tokens.access_token}`,
      'Ocp-Apim-Subscription-Key': this.opts.subscriptionKey,
      accept: 'application/json',
    };
    if (body) headers['content-type'] = GUIDE_CONTENT_TYPE;
    try {
      return await this.fetchImpl(this.url(path), {
        method,
        headers,
        // El cuerpo es el ZIP tal cual (--data-binary en los ejemplos del PDF).
        body: body ? (body.slice().buffer as ArrayBuffer) : undefined,
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
      throw new SuuntoApiError('no hay refresh token disponible', 401);
    }
    let rotated;
    try {
      rotated = await refreshAccessToken({
        tokenEndpoint: this.opts.tokenEndpoint,
        clientId: this.opts.clientId,
        clientSecret: this.opts.clientSecret,
        refreshToken,
        // El quick start autentica el cliente con `curl --user id:secret`.
        basicAuth: true,
      });
    } catch (e) {
      await this.opts.onAuthError?.();
      if (e instanceof OAuth2Error) {
        throw new SuuntoApiError(`fallo al refrescar el token: ${e.message}`, e.status || 401);
      }
      throw new SuuntoApiError(`fallo al refrescar el token: ${(e as Error).message}`, 401);
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

  private async envelope<T>(res: Response): Promise<SuuntoEnvelope<T> | null> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as SuuntoEnvelope<T>;
    } catch {
      return null;
    }
  }

  private async expectPayload<T>(res: Response, method: string, path: string): Promise<T> {
    if (!res.ok) throw await this.toError(res, method, path);
    const body = await this.envelope<T>(res);
    if (!body || body.payload == null) {
      throw new SuuntoApiError(`${method} ${path} respondió sin payload`, res.status);
    }
    return body.payload;
  }

  /** Un 400 trae la causa en `error.description`; la conservamos sin envolverla. */
  private async toError(res: Response, method: string, path: string): Promise<SuuntoApiError> {
    const body = await this.envelope<unknown>(res);
    const description = body?.error?.description;
    return new SuuntoApiError(
      `${method} ${path} devolvió ${res.status}${description ? `: ${description}` : ''}`,
      res.status,
      description,
    );
  }
}
