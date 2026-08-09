import { describe, expect, it } from 'vitest';
import type { CoachAthleteCommunicationDTO } from '@fahybrid/shared/domain/coach-communications';
import {
  aInput,
  borradorVacio,
  carriles,
  conTipo,
  cuantosReclaman,
  desdeComunicado,
  erroresDe,
  estaVencida,
  seguimiento,
  venceEn,
  type Borrador,
} from '@/lib/dashboard/v2/del-coach';

// Lo que se fija aquí es la parte de la pestaña «Del coach» que NO se ve en una
// captura: en qué carril cae cada comunicado, qué frase resume el estado del
// atleta y qué sale por el cable al publicar.
//
// Va sin base de datos a propósito: el reparto por carriles y el seguimiento son
// funciones puras sobre el DTO que ya devuelve la API (eso ya lo cubren los tests
// `.db` del cimiento). Lo que se rompería en silencio es el ORDEN y la COPIA, y
// eso se rompe igual con o sin Postgres delante.

const HOY = '2026-08-09';

function dto(over: Partial<CoachAthleteCommunicationDTO> = {}): CoachAthleteCommunicationDTO {
  return {
    id: '1',
    kind: 'task',
    title: 'Empieza la beta-alanina',
    body: null,
    final_note: null,
    anchor_kind: 'general',
    anchor_ref: null,
    due_date: null,
    expires_at: null,
    blocks: false,
    is_template: false,
    status: 'published',
    published_at: '2026-08-08T09:00:00.000Z',
    created_at: '2026-08-08T09:00:00.000Z',
    updated_at: '2026-08-08T09:00:00.000Z',
    items: [],
    tracking: { recipients: 1, seen: 0, done: 0, answered: 0 },
    athlete_state: {
      athlete_id: '63',
      state: 'published',
      seen_at: null,
      done_at: null,
      answered_item_id: null,
      answered_at: null,
      marked_item_ids: [],
      claims_attention: true,
    },
    ...over,
  };
}

describe('el plazo de una tarea', () => {
  it('se dice desde el día del coach, sin que el huso mueva la fecha civil', () => {
    expect(venceEn('2026-08-09', HOY)).toBe('Vence hoy');
    expect(venceEn('2026-08-10', HOY)).toBe('Vence mañana');
    expect(venceEn('2026-08-08', HOY)).toBe('Venció ayer');
    expect(venceEn('2026-08-14', HOY)).toBe('Vence en 5 días');
    expect(venceEn('2026-08-05', HOY)).toBe('Venció hace 4 días');
  });

  it('vencida es sólo la tarea viva y sin hacer', () => {
    const vencida = dto({ due_date: '2026-08-05' });
    expect(estaVencida(vencida, HOY)).toBe(true);

    const hecha = dto({
      due_date: '2026-08-05',
      athlete_state: { ...vencida.athlete_state, state: 'done', done_at: '2026-08-06T10:00:00.000Z' },
    });
    expect(estaVencida(hecha, HOY)).toBe(false);

    const retirada = dto({ due_date: '2026-08-05', status: 'archived' });
    expect(estaVencida(retirada, HOY)).toBe(false);
  });
});

describe('el seguimiento, dicho en una línea', () => {
  it('una tarea vencida manda sobre el estado y se pinta en ámbar', () => {
    const s = seguimiento(dto({ due_date: '2026-08-08' }), HOY);
    expect(s.tono).toBe('warn');
    expect(s.titular).toBe('Venció ayer, y sigue sin hacer');
    expect(s.nota).toBe('No lo ha abierto.');
  });

  it('una pregunta respondida enseña la RESPUESTA, no un acuse de recibo', () => {
    const c = dto({
      kind: 'question',
      items: [
        { id: '10', position: 1, label: null, content: 'Jueves 12', consequence: 'Todo se adelanta.' },
        { id: '11', position: 2, label: null, content: 'Sábado 14', consequence: 'El plan se queda como está.' },
      ],
      athlete_state: {
        ...dto().athlete_state,
        state: 'answered',
        answered_item_id: '11',
        answered_at: '2026-08-09T08:00:00.000Z',
        claims_attention: false,
      },
    });
    const s = seguimiento(c, HOY);
    expect(s.titular).toBe('Respondió «Sábado 14»');
    expect(s.nota).toBe('El plan se queda como está.');
    expect(s.tono).toBe('ok');
  });

  it('un protocolo a medias dice por dónde va, no sólo que lo abrió', () => {
    const c = dto({
      kind: 'protocol',
      items: [1, 2, 3, 4].map((n) => ({
        id: String(n),
        position: n,
        label: null,
        content: `Paso ${n}`,
        consequence: null,
      })),
      athlete_state: { ...dto().athlete_state, state: 'seen', seen_at: 'x', marked_item_ids: ['1', '2'] },
    });
    expect(seguimiento(c, HOY).titular).toBe('Visto, 2 de 4 pasos');
  });

  it('un foco no reclama nada: acompaña', () => {
    const c = dto({
      kind: 'focus',
      athlete_state: { ...dto().athlete_state, state: 'seen', seen_at: 'x', claims_attention: false },
    });
    expect(seguimiento(c, HOY).titular).toBe('Activo');
  });

  it('lo retirado lo dice antes que cualquier otra cosa', () => {
    const c = dto({ status: 'archived', due_date: '2026-08-01' });
    expect(seguimiento(c, HOY).titular).toBe('Retirado');
  });
});

describe('los tres carriles de la ficha', () => {
  it('lo que reclama va arriba, lo retirado al fondo y la pregunta que bloquea la primera', () => {
    const bloqueante = dto({
      id: '2',
      kind: 'question',
      blocks: true,
      published_at: '2026-08-01T09:00:00.000Z',
    });
    const tarea = dto({ id: '3', due_date: '2026-08-20' });
    const cerrado = dto({
      id: '4',
      kind: 'note',
      athlete_state: { ...dto().athlete_state, state: 'seen', seen_at: 'x', claims_attention: false },
    });
    const retirado = dto({ id: '5', status: 'archived' });

    const { reclama, alDia, historial } = carriles([retirado, cerrado, tarea, bloqueante]);
    expect(reclama.map((c) => c.id)).toEqual(['2', '3']);
    expect(alDia.map((c) => c.id)).toEqual(['4']);
    expect(historial.map((c) => c.id)).toEqual(['5']);
  });

  it('la insignia de la pestaña no cuenta lo retirado', () => {
    expect(cuantosReclaman([dto({ id: '1' }), dto({ id: '2', status: 'archived' })])).toBe(1);
  });
});

describe('el borrador que se escribe en el compositor', () => {
  const protocoloLleno = (): Borrador => ({
    ...borradorVacio('protocol'),
    title: 'Calentamiento del día de carrera',
    body: 'Los tiempos cuentan hacia atrás desde tu salida.',
    steps: [
      { key: 'a', label: "−40'", content: 'Movilidad de cadera.' },
      { key: 'b', label: '', content: 'Trote progresivo.' },
    ],
    final_note: '',
  });

  it('un campo opcional en blanco viaja ausente, nunca como cadena vacía', () => {
    const input = aInput(protocoloLleno());
    expect(input.kind).toBe('protocol');
    if (input.kind !== 'protocol') throw new Error('tipo inesperado');
    expect(input.final_note).toBeNull();
    expect(input.items[1]?.label).toBeNull();
    expect(input.items[0]?.label).toBe("−40'");
  });

  it('lo valida el MISMO esquema que el servidor, antes de enviar', () => {
    expect(erroresDe(protocoloLleno())).toEqual({});

    const sinTitulo = { ...protocoloLleno(), title: '   ' };
    expect(erroresDe(sinTitulo).title).toBeTruthy();

    const preguntaCoja = { ...borradorVacio('question'), title: '¿Jueves o sábado?', body: 'Contexto' };
    // Dos opciones vacías: el esquema exige contenido en cada una.
    expect(erroresDe(preguntaCoja)['items.0.content']).toBeTruthy();

    const tareaSinFecha = { ...borradorVacio('task'), title: 'Beta-alanina', body: 'Porque sí' };
    expect(erroresDe(tareaSinFecha).due_date).toBeTruthy();
  });

  it('cambiar de chip conserva lo escrito y sólo mueve el ancla si nadie la tocó', () => {
    const b = protocoloLleno();
    const comoNota = conTipo(b, 'note');
    expect(comoNota.title).toBe(b.title);
    expect(comoNota.anchor_kind).toBe('plan');

    const conAnclaElegida = conTipo({ ...b, anchor_kind: 'race' }, 'note');
    expect(conAnclaElegida.anchor_kind).toBe('race');
  });

  it('el molde se marca como plantilla; lo que se publica, nunca', () => {
    expect(aInput(protocoloLleno()).is_template).toBe(false);
    expect(aInput(protocoloLleno(), true).is_template).toBe(true);
  });

  it('retomar una plantilla trae sus items y no arrastra su condición de molde', () => {
    const plantilla = dto({
      kind: 'note',
      is_template: true,
      title: 'Semana de descarga: el porqué',
      anchor_kind: 'week',
      items: [{ id: '9', position: 1, label: 'Qué cambia', content: 'Baja el volumen.', consequence: null }],
    });
    const b = desdeComunicado(plantilla);
    expect(b.kind).toBe('note');
    expect(b.sections).toHaveLength(1);
    expect(b.sections[0]).toMatchObject({ label: 'Qué cambia', content: 'Baja el volumen.' });
    expect(b.anchor_kind).toBe('week');
    expect(b.save_to_library).toBe(false);
  });
});
