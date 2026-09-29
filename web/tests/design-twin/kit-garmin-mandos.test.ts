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
  REPOSO,
  accionDe,
  botonDeTecla,
  type EstadoMandos,
} from '@/components/design-twin/kit-garmin';
import { normal, tablaDe } from './garmin-modelo';

const TABLA = tablaDe('## 5. Interacción');

describe('§5 — la tabla de botones', () => {
  it('tiene una fila por estado del documento, y ninguna más', () => {
    expect(TABLA.length).toBe(11);
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
    for (const e of ['paso', 'deshacer', 'recupera', 'fuerza', 'amrap'] as const) expect(MANDOS[e].upLargo?.accion).toBe('controles');
  });

  it('LIGHT es la luz del sistema en todo estado', () => {
    for (const e of Object.keys(MANDOS) as EstadoMandos[]) expect(accionDe(e, 'light')).toBe(LUZ);
  });

  it('los rótulos de tecla, solo en reposo (brief, pausa, controles, resumen)', () => {
    expect([...REPOSO].sort()).toEqual(['brief', 'controles', 'pausa', 'resumen']);
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
