// Cliente mínimo de las APIs del coach para los componentes compartidos: JSON
// de ida y vuelta, y un error con el mensaje que ya escribió el servidor
// (`{ error: { code, message } }`) para enseñarlo tal cual en un aviso.

export class PanelApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'PanelApiError';
    this.code = code;
    this.status = status;
  }
}

/** Mensaje para el coach: el del servidor si lo hay, si no uno honesto genérico. */
export function errorMessage(err: unknown, fallback = 'No se ha podido guardar. Vuelve a probar.'): string {
  if (err instanceof PanelApiError && err.message) return err.message;
  return fallback;
}

export async function apiJson<T>(
  url: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new PanelApiError('network', 'Sin conexión. Comprueba la red y vuelve a probar.', 0);
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = '';
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } | string; message?: string };
      if (body.error && typeof body.error === 'object') {
        code = body.error.code ?? code;
        message = body.error.message ?? '';
      } else if (typeof body.error === 'string') {
        code = body.error;
        message = body.message ?? '';
      }
    } catch {
      // cuerpo no JSON: se queda el genérico
    }
    throw new PanelApiError(code, message, res.status);
  }
  return (await res.json()) as T;
}
