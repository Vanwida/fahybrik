// Llamadas a /api/coach/groups/* desde la página del grupo: el motivo del
// servidor viaja al aviso (nunca un «error» seco).

export async function groupApi<T = unknown>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res) return { ok: false, error: 'Sin conexión. Vuelve a intentarlo.' };
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok) return { ok: false, error: data?.error?.message ?? 'No se pudo guardar.' };
  return { ok: true, data: data as T };
}
