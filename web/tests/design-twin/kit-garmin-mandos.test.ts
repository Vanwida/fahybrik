// LA GRAMÁTICA DE BOTONES = §5 DEL MODELO, AL PIE DE LA LETRA.
//
// La tabla `MANDOS` se cruza con la tabla de docs/garmin-reloj/modelo.md §5,
// leída del propio documento: mismas filas, y en cada celda lo mismo (o «—»).
// Si alguien cambia el modelo o el código sin el otro, esto falla.

import { describe, expect, it } from 'vitest';
import {
  BOTONES_TABLA,
  FILA_MODELO,
  LUZ,
  MANDOS,
  REPETIR,
  REPOSO,
  accionDe,
  botonDeTecla,
  pasosDeRepeticion,
  type EstadoMandos,
} from '@/components/design-twin/kit-garmin';
import { normal, tablaDe } from './garmin-modelo';

const TABLA = tablaDe('## 5. Interacción');

describe('§5 — la tabla de botones', () => {
  it('tiene una fila por estado del documento, y ninguna más', () => {
    expect(TABLA.length).toBe(15);
    expect(TABLA.map((f) => f[0]).sort()).toEqual(Object.values(FILA_MODELO).sort());
  });

  it('cada celda dice lo mismo que el modelo (START/STOP · BACK/LAP · UP · DOWN · UP largo)', () => {
    const porNombre = new Map(Object.entries(FILA_MODELO).map(([e, n]) => [n, e as EstadoMandos]));
    for (const fila of TABLA) {
      const estado = porNombre.get(fila[0]!)!;
      BOTONES_TABLA.forEach((b, k) => {
        const celda = normal(fila[k + 1]!);
        const mando = MANDOS[estado][b];
        if (celda === '—') expect(mando, `${fila[0]} · ${b}`).toBeNull();
        else expect(mando?.dice, `${fila[0]} · ${b}`).toBe(celda);
      });
    }
  });

  it('BACK nunca sale de la app grabando: solo en el brief (antes de empezar)', () => {
    for (const [estado, fila] of Object.entries(MANDOS)) {
      if (fila.back?.accion === 'salir') expect(estado).toBe('brief');
    }
  });

  it('en el vivo BACK/LAP es la vuelta con deshacer, y durante los 5 s UP deshace', () => {
    expect(MANDOS.paso.back?.accion).toBe('siguiente-paso');
    expect(MANDOS.deshacer.up?.accion).toBe('deshacer');
    expect(MANDOS.paso.up?.accion).toBe('pagina-anterior');
    expect(MANDOS.recupera.back?.accion).toBe('empezar-ya');
    expect(MANDOS.pausa.back?.accion).toBe('controles');
    for (const e of ['paso', 'deshacer', 'recupera', 'fuerza', 'anotar', 'amrap', 'ventana', 'campana'] as const) expect(MANDOS[e].upLargo?.accion).toBe('controles');
  });

  it('una ventana que no se salta no tiene vuelta: BACK es «sin efecto», jamás cierra el paso', () => {
    expect(MANDOS.ventana.back?.accion).toBe('sin-efecto');
    expect(MANDOS.ventana.up?.accion).toBe('pagina-anterior');
  });

  it('la campana guarda con START (no con BACK); UP/DOWN cuentan reps y, mantenidos, aceleran', () => {
    expect(MANDOS.campana.start?.accion).toBe('guardar');
    expect(MANDOS.campana.back?.accion).toBe('ronda-hecha');
    expect(MANDOS.campana.up?.repite).toBe(true);
    expect(MANDOS.campana.down?.repite).toBe(true);
    expect(MANDOS.amrap.up?.repite).toBe(true);
  });

  it('el brief: UP cambia el entorno, DOWN abre la estructura completa; la lista del día tiene sus flechas', () => {
    expect(MANDOS.brief.up?.accion).toBe('cambiar-entorno');
    expect(MANDOS.brief.down?.accion).toBe('estructura-completa');
    expect(MANDOS['lista-del-dia'].up?.accion).toBe('sesion-anterior');
    expect(MANDOS['lista-del-dia'].down?.accion).toBe('sesion-siguiente');
    expect(MANDOS['lista-del-dia'].start?.accion).toBe('elegir');
  });

  it('LIGHT es la luz del sistema en todo estado', () => {
    for (const e of Object.keys(MANDOS) as EstadoMandos[]) expect(accionDe(e, 'light')).toBe(LUZ);
  });

  it('los rótulos de tecla, solo en reposo (brief, pausa, controles, resumen)', () => {
    expect([...REPOSO].sort()).toEqual(['brief', 'controles', 'lista-del-dia', 'pausa', 'resumen', 'rpe']);
  });
});

describe('mantener UP o DOWN en una fila de reps', () => {
  it('acelera por escalones: 1, 5 y 10 reps por golpe, y nunca menos que las de antes', () => {
    const golpes = [0, 1000, 1500, 3000, 3500, 9000].map(pasosDeRepeticion);
    expect(golpes).toEqual([1, 1, 5, 5, 10, 10]);
    expect(golpes).toEqual([...golpes].sort((a, b) => a - b));
    expect(REPETIR.arranqueMs).toBeGreaterThan(REPETIR.cadaMs);
  });
});

describe('el teclado del doble', () => {
  it('Enter = START, ⌫/Esc = BACK/LAP, ↑ ↓, ⇧↑ = UP largo, L = LIGHT', () => {
    expect(botonDeTecla({ key: 'Enter', shiftKey: false })).toBe('start');
    expect(botonDeTecla({ key: 'Backspace', shiftKey: false })).toBe('back');
    expect(botonDeTecla({ key: 'Escape', shiftKey: false })).toBe('back');
    expect(botonDeTecla({ key: 'ArrowUp', shiftKey: false })).toBe('up');
    expect(botonDeTecla({ key: 'ArrowUp', shiftKey: true })).toBe('upLargo');
    expect(botonDeTecla({ key: 'ArrowDown', shiftKey: false })).toBe('down');
    expect(botonDeTecla({ key: 'l', shiftKey: false })).toBe('light');
    expect(botonDeTecla({ key: 'a', shiftKey: false })).toBeNull();
  });
});
