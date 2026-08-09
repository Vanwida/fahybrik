import { describe, expect, it } from 'vitest';
import { escenarioPlan } from '@/components/design-twin/plan/datos';
import {
  hayHueco,
  nivelDeLoPublicado,
  nodosDelCiclo,
} from '@/components/design-twin/screens/plan-ciclo/espina';

// El ciclo del atleta se dibuja con LA ESPINA compartida, y estas pruebas fijan
// lo que la espina DICE — no cómo se ve. Se corren sobre los escenarios REALES
// (`plan/datos.ts`), que son filas de producción, no datos de juguete.
//
// Lo que se protege aquí es lo que, si alguien lo deshace en una pantalla, hace
// que la app mienta: los rótulos de semana, quién ha pasado ya, y el agujero del
// final. El precedente es `zonas.test.ts`: el reparto de zonas se separó de la
// app y hubo dos verdades.

describe('espina del ciclo · los rótulos de semana se acumulan sobre el plan entero', () => {
  const { ciclo } = escenarioPlan('secuencia');

  it('cada etapa dice su tramo de semanas dentro del ciclo, no dentro de sí misma', () => {
    // «Primer mes» → «Base 1» → «Testing», cuatro semanas cada una.
    expect(nodosDelCiclo(ciclo).filter((n) => n.clase === 'tramo').map((n) => n.semanas)).toEqual([
      'S1-S4',
      'S5-S8',
      'S9-S12',
    ]);
  });

  it('es la MISMA gramática que la del plan real: la del servidor', async () => {
    // Si esto se separara, el atleta leería «S5-S8» en la nota de su coach y otra
    // cosa en su propia pantalla del plan.
    const { weeksLabel } = await import('@fahybrid/shared/domain/plan-path');
    expect(nodosDelCiclo(ciclo)[1]!.semanas).toBe(weeksLabel(5, 4));
  });

  it('una etapa de una sola semana no se rotula «S2-S2»', async () => {
    const { weeksLabel } = await import('@fahybrid/shared/domain/plan-path');
    expect(weeksLabel(2, 1)).toBe('S2');
  });
});

describe('espina del ciclo · dónde estás, y qué queda detrás', () => {
  it('con cursor, lo anterior ya pasó y lo de hoy lleva su semana', () => {
    const { ciclo } = escenarioPlan('secuencia');
    const tramos = nodosDelCiclo(ciclo).filter((n) => n.clase === 'tramo');
    expect(tramos.map((n) => n.pasado)).toEqual([true, false, false]);
    expect(tramos.map((n) => n.actual)).toEqual([false, true, false]);
    expect(tramos[1]!.semanaActual).toBe(2);
  });

  it('SIN cursor no hay pasado: fechas atrás no bastan para afirmarlo', () => {
    // El atleta 67 hoy: su etapa acabó el 26-jul e `indiceActual` es -1. Sin
    // saber dónde cae hoy no se sabe qué queda detrás, y decirlo sería inventarlo.
    const { ciclo } = escenarioPlan('sin-publicar');
    const tramos = nodosDelCiclo(ciclo).filter((n) => n.clase === 'tramo');
    expect(tramos.every((n) => !n.pasado && !n.actual)).toBe(true);
  });

  it('el tono es la POSICIÓN, nunca lo que dice el nombre de la etapa', () => {
    const { ciclo } = escenarioPlan('secuencia');
    expect(nodosDelCiclo(ciclo).filter((n) => n.clase === 'tramo').map((n) => n.tono)).toEqual([0, 1, 2]);
  });

  it('una etapa se marca sólo cuando lleva algo DEMOSTRABLE en el calendario', () => {
    const { ciclo } = escenarioPlan('secuencia');
    // «Primer mes» no tiene ni un hito materializado; las otras dos sí.
    expect(nodosDelCiclo(ciclo).filter((n) => n.clase === 'tramo').map((n) => n.destacado)).toEqual([
      false,
      true,
      true,
    ]);
  });
});

describe('espina del ciclo · el agujero del final se declara, no se disimula', () => {
  it('lo publicado se acabó antes de hoy: el camino se rompe y dice desde cuándo', () => {
    const { ciclo } = escenarioPlan('sin-publicar');
    expect(hayHueco(ciclo)).toBe(true);
    const hueco = nodosDelCiclo(ciclo).find((n) => n.clase === 'hueco');
    expect(hueco?.titulo).toBe('Aquí acaba lo publicado');
    expect(hueco?.detalle).toBe('Lo que tu coach ha montado se termina antes de hoy.');
    expect(hueco?.semanas).toBe('');
  });

  it('estás dentro pero no hay siguiente: el agujero es lo que viene DESPUÉS', () => {
    const { ciclo } = escenarioPlan('coach');
    expect(nodosDelCiclo(ciclo).find((n) => n.clase === 'hueco')?.detalle).toBe(
      'Después de esta etapa no hay nada montado todavía.',
    );
  });

  it('cuando la secuencia SÍ declara qué pasa al acabar, no hay agujero', () => {
    const { ciclo } = escenarioPlan('secuencia');
    expect(hayHueco(ciclo)).toBe(false);
    expect(nodosDelCiclo(ciclo).some((n) => n.clase === 'hueco')).toBe(false);
  });

  it('sin ninguna etapa publicada no hay camino: se devuelve vacío, no un camino de cero pasos', () => {
    const { ciclo } = escenarioPlan('alta-nueva');
    expect(nodosDelCiclo(ciclo)).toEqual([]);
  });
});

describe('espina del ciclo · la carrera cierra el camino', () => {
  it('la meta va al final, sin semanas y con el objetivo que el atleta se puso', () => {
    const { ciclo } = escenarioPlan('secuencia');
    const nodos = nodosDelCiclo(ciclo);
    const ultimo = nodos[nodos.length - 1]!;
    expect(ultimo.clase).toBe('carrera');
    expect(ultimo.titulo).toBe('HYROX Barcelona');
    expect(ultimo.semanas).toBe('');
    expect(ultimo.detalle).toBe('Tu carrera · objetivo 1:10:00');
  });

  it('sin carrera objetivo el camino cierra sin meta', () => {
    const { ciclo } = escenarioPlan('alta-nueva');
    expect(nodosDelCiclo(ciclo).some((n) => n.clase === 'carrera')).toBe(false);
  });
});

describe('espina del ciclo · el nivel se dice UNA vez', () => {
  it('cuando todas las etapas declaran el mismo nivel, ninguna lo repite', () => {
    const { ciclo } = escenarioPlan('secuencia');
    expect(nivelDeLoPublicado(ciclo)).toBe('Rendimiento');
    expect(nodosDelCiclo(ciclo).filter((n) => n.clase === 'tramo').every((n) => n.detalle === null)).toBe(
      true,
    );
  });
});

describe('espina del ciclo · el rótulo en voz alta dice lo que se ve', () => {
  it('nombra la etapa, cuánto dura, dónde estás y qué hay marcado dentro', () => {
    const { ciclo } = escenarioPlan('secuencia');
    const actual = nodosDelCiclo(ciclo).find((n) => n.actual)!;
    expect(actual.etiqueta).toContain('Base 1, 4 semanas (S5-S8)');
    expect(actual.etiqueta).toContain('estás en la semana 2');
    expect(actual.etiqueta).toContain('Batería 1RM');
  });

  it('sin cursor no afirma ni «ya pasó» ni «estás aquí»', () => {
    const { ciclo } = escenarioPlan('sin-publicar');
    const tramo = nodosDelCiclo(ciclo)[0]!;
    expect(tramo.etiqueta).not.toContain('ya pasó');
    expect(tramo.etiqueta).not.toContain('estás en la semana');
  });
});
