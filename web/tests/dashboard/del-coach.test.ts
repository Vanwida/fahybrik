import { describe, expect, it } from 'vitest';
import type {
  CoachAthleteCommunicationDTO,
  CommunicationItemDTO,
} from '@fahybrid/shared/domain/coach-communications';
import {
  avisoPublicado,
  carriles,
  coincideComunicado,
  cuantosReclaman,
  estaVencida,
  paraQuien,
  porTipo,
  seguimiento,
  venceEn,
} from '@/lib/dashboard/v2/del-coach';
import {
  aInput,
  borradorVacio,
  conTipo,
  desdeComunicado,
  erroresDe,
  filaVacia,
  indicesEnviados,
  type Borrador,
} from '@/lib/dashboard/v2/del-coach-borrador';

// Lo que se fija aquí es la parte de la pestaña «Del coach» que NO se ve en una
// captura: en qué carril cae cada comunicado, qué frase resume el estado del
// atleta y qué sale por el cable al publicar.
//
// Va sin base de datos a propósito: el reparto por carriles y el seguimiento son
// funciones puras sobre el DTO que ya devuelve la API (eso ya lo cubren los tests
// `.db` del cimiento). Lo que se rompería en silencio es el ORDEN y la COPIA, y
// eso se rompe igual con o sin Postgres delante.

const HOY = '2026-08-09';

/** Un item del DTO. Nace CON casilla, que es como nacen las filas del coach. */
function item(over: Partial<CommunicationItemDTO> & { id: string }): CommunicationItemDTO {
  return {
    position: Number(over.id),
    label: null,
    content: `Paso ${over.id}`,
    consequence: null,
    checkable: true,
    display: 'texto',
    segments: [],
    camino: null,
    ...over,
  };
}

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
    linked: null,
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
        item({ id: '10', position: 1, content: 'Jueves 12', consequence: 'Todo se adelanta.' }),
        item({
          id: '11',
          position: 2,
          content: 'Sábado 14',
          consequence: 'El plan se queda como está.',
        }),
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
      items: [1, 2, 3, 4].map((n) => item({ id: String(n) })),
      athlete_state: { ...dto().athlete_state, state: 'seen', seen_at: 'x', marked_item_ids: ['1', '2'] },
    });
    expect(seguimiento(c, HOY).titular).toBe('Visto, 2 de 4 pasos');
  });

  it('un protocolo mixto cuenta las casillas, no las líneas de lectura', () => {
    const c = dto({
      kind: 'protocol',
      items: [
        item({ id: '1' }),
        item({ id: '2' }),
        item({ id: '3', checkable: false }),
        item({ id: '4', checkable: false }),
      ],
      athlete_state: { ...dto().athlete_state, state: 'seen', seen_at: 'x', marked_item_ids: ['1'] },
    });
    expect(seguimiento(c, HOY).titular).toBe('Visto, 1 de 2 pasos');
  });

  it('un protocolo de sólo lectura no promete un cierre que no existe', () => {
    const base = dto({
      kind: 'protocol',
      items: [item({ id: '1', checkable: false }), item({ id: '2', checkable: false })],
    });
    expect(seguimiento(base, HOY).titular).toBe('Sin abrir');

    const leido = dto({
      ...base,
      athlete_state: { ...base.athlete_state, state: 'seen', seen_at: 'x', claims_attention: false },
    });
    const s = seguimiento(leido, HOY);
    expect(s.titular).toBe('Leído');
    expect(s.nota).toBe('No lleva nada que marcar: es para leer.');
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
      { ...filaVacia(), key: 'a', label: "−40'", content: 'Movilidad de cadera.' },
      { ...filaVacia(), key: 'b', content: 'Trote progresivo.' },
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

  it('cada paso lleva su casilla en el payload, y quitarla viaja', () => {
    const b = protocoloLleno();
    b.steps[1]!.checkable = false;
    const input = aInput(b);
    if (input.kind !== 'protocol') throw new Error('tipo inesperado');
    expect(input.items.map((i) => i.checkable)).toEqual([true, false]);
  });

  it('un protocolo de sólo texto es válido: nada se obliga a marcarse', () => {
    const soloTexto: Borrador = {
      ...borradorVacio('protocol'),
      title: 'Día de carrera',
      body: 'Desayuna 3 h antes y bebe 500 ml en la hora previa.',
      // Las dos filas con las que nace el formulario, sin tocar.
    };
    expect(erroresDe(soloTexto)).toEqual({});
    const input = aInput(soloTexto);
    if (input.kind !== 'protocol') throw new Error('tipo inesperado');
    // Una fila en blanco no viaja como paso vacío: no es un paso.
    expect(input.items).toEqual([]);
  });

  it('un protocolo sin pasos y sin texto no dice nada, y lo dice en «los pasos»', () => {
    const vacio: Borrador = { ...borradorVacio('protocol'), title: 'Día de carrera' };
    expect(erroresDe(vacio).items).toBe('Escribe al menos un paso, o una línea de texto que leer.');
  });

  it('una fila en blanco por delante no le roba el error a la de al lado', () => {
    const b: Borrador = {
      ...borradorVacio('protocol'),
      title: 'Día de carrera',
      steps: [
        { ...filaVacia(), key: 'a' },
        // A medias: marca de tiempo sin texto. El error es de ESTA fila.
        { ...filaVacia(), key: 'b', label: "−40'" },
      ],
    };
    const errores = erroresDe(b);
    expect(indicesEnviados(b.steps).get('b')).toBe(0);
    expect(errores['items.0.content']).toBeTruthy();
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
      items: [item({ id: '9', position: 1, label: 'Qué cambia', content: 'Baja el volumen.' })],
    });
    const b = desdeComunicado(plantilla);
    expect(b.kind).toBe('note');
    expect(b.sections).toHaveLength(1);
    expect(b.sections[0]).toMatchObject({ label: 'Qué cambia', content: 'Baja el volumen.' });
    expect(b.anchor_kind).toBe('week');
    expect(b.save_to_library).toBe(false);
  });
});

describe('publicar a uno o a varios', () => {
  const marta = 'Marta Ruiz';

  it('con uno se le nombra; con varios se cuentan, que es lo que el coach necesita ver', () => {
    expect(paraQuien([marta])).toBe('Para Marta Ruiz');
    expect(paraQuien([marta, 'Jon Sanz'])).toBe('Para 2 atletas');
  });

  it('el aviso de publicado concuerda en número', () => {
    expect(avisoPublicado([marta])).toBe('Publicado. Le llega a Marta Ruiz.');
    expect(avisoPublicado([marta, 'Jon Sanz', 'Ane Gil'])).toBe('Publicado. Les llega a 3 atletas.');
  });
});

describe('la biblioteca de comunicados', () => {
  const plantilla = (over: Partial<CoachAthleteCommunicationDTO> = {}) =>
    dto({ is_template: true, status: 'draft', published_at: null, ...over });

  it('se busca por el título y por lo que se escribió arriba, sin distinguir mayúsculas', () => {
    const c = plantilla({ title: 'Calentamiento de carrera', body: 'Cuenta atrás desde tu salida.' });
    expect(coincideComunicado(c, '')).toBe(true);
    expect(coincideComunicado(c, 'calentamiento')).toBe(true);
    expect(coincideComunicado(c, 'cuenta atrás')).toBe(true);
    expect(coincideComunicado(c, 'remo')).toBe(false);
  });

  it('un cuerpo vacío no rompe la búsqueda', () => {
    expect(coincideComunicado(plantilla({ title: 'Foco', body: null }), 'foco')).toBe(true);
  });

  it('se reparten por tipo en el orden del dominio y los tipos sin nada no salen', () => {
    const grupos = porTipo([
      plantilla({ id: '1', kind: 'note' }),
      plantilla({ id: '2', kind: 'protocol' }),
      plantilla({ id: '3', kind: 'note' }),
    ]);
    expect(grupos.map((g) => g.kind)).toEqual(['protocol', 'note']);
    expect(grupos[1]?.items.map((c) => c.id)).toEqual(['1', '3']);
  });
});
