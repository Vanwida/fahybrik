import { describe, expect, it } from 'vitest';
import { readCoachSessionDetailResponse } from '@/lib/dashboard/coach/session-detail-load';

// Cómo el cajón Entreno clasifica la respuesta. Sin montar React: 400/404
// cierran el panel (id ajeno o mal formado); el resto de no-OK y un 200
// sin `session` son el aviso «No se pudo cargar el detalle del entreno.»

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const session = {
  assignment_id: '490',
  iso_date: '2026-08-25',
  status: 'completed',
  display_title: 'VO2max + Wall Balls',
};

describe('readCoachSessionDetailResponse — el camino del panel Entreno', () => {
  it('400 y 404: invalid (el id no era de este atleta)', async () => {
    expect(await readCoachSessionDetailResponse(jsonRes(400, { error: 'ID entreno inválido' }))).toEqual({
      kind: 'invalid',
    });
    expect(await readCoachSessionDetailResponse(jsonRes(404, { error: 'Entreno no encontrado' }))).toEqual({
      kind: 'invalid',
    });
  });

  it('500 JSON y 500 HTML: error (el aviso de carga, no un cierre)', async () => {
    expect(
      await readCoachSessionDetailResponse(
        jsonRes(500, { error: 'No se pudo cargar el detalle del entreno.' }),
      ),
    ).toEqual({ kind: 'error' });

    const html = new Response('<html>Internal Server Error</html>', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    });
    expect(await readCoachSessionDetailResponse(html)).toEqual({ kind: 'error' });
  });

  it('200 sin session, o JSON roto: error', async () => {
    expect(await readCoachSessionDetailResponse(jsonRes(200, {}))).toEqual({ kind: 'error' });
    expect(await readCoachSessionDetailResponse(jsonRes(200, { session: null }))).toEqual({
      kind: 'error',
    });
    const broken = new Response('no-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    expect(await readCoachSessionDetailResponse(broken)).toEqual({ kind: 'error' });
  });

  it('200 con session: ready', async () => {
    expect(await readCoachSessionDetailResponse(jsonRes(200, { session }))).toEqual({
      kind: 'ready',
      session,
    });
  });
});
