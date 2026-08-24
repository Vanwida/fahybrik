import { describe, expect, it } from 'vitest';
import { nodosDeCadena, type EslabonCadena } from '@/components/v2/periodizacion/secuencias/cadena';

// La cadena de una secuencia se dibuja con LA MISMA espina que ve el atleta, así
// que sus rótulos tienen que salir de la misma gramática que el plan real. Estas
// pruebas fijan lo que la cadena DICE, que es lo que el coach lee mientras la
// monta y lo que su atleta va a leer después.

function eslabon(parcial: Partial<EslabonCadena> & { clave: string }): EslabonCadena {
  return {
    month_template_id: parcial.clave,
    nombre: 'Microciclo',
    semanas: 4,
    ...parcial,
  };
}

describe('cadena · los rótulos de semana se acumulan a lo largo de la secuencia', () => {
  it('cada microciclo dice el tramo que ocupa dentro de la cadena entera', () => {
    const nodos = nodosDeCadena([
      eslabon({ clave: 'a', nombre: 'Primer mes', semanas: 4 }),
      eslabon({ clave: 'b', nombre: 'Base 1', semanas: 4 }),
      eslabon({ clave: 'c', nombre: 'Choque', semanas: 2 }),
    ]);
    expect(nodos.map((n) => n.semanas)).toEqual(['S1-S4', 'S5-S8', 'S9-S10']);
  });

  it('un microciclo de una sola semana se rotula «S5», no «S5-S5»', () => {
    const nodos = nodosDeCadena([
      eslabon({ clave: 'a', semanas: 4 }),
      eslabon({ clave: 'b', semanas: 1 }),
    ]);
    expect(nodos[1]!.semanas).toBe('S5');
  });

  it('es la misma gramática que la del plan real', async () => {
    const { weeksLabel } = await import('@fahybrid/shared/domain/plan-path');
    const nodos = nodosDeCadena([eslabon({ clave: 'a', semanas: 3 }), eslabon({ clave: 'b', semanas: 5 })]);
    expect(nodos[1]!.semanas).toBe(weeksLabel(4, 5));
  });
});

describe('cadena · un microciclo sin semanas no desplaza a los que vienen detrás', () => {
  const nodos = nodosDeCadena([
    eslabon({ clave: 'a', nombre: 'Primer mes', semanas: 4 }),
    eslabon({ clave: 'b', nombre: 'Recién creado', semanas: 0 }),
    eslabon({ clave: 'c', nombre: 'Base 1', semanas: 4 }),
  ]);

  it('se rotula sin fingir una semana que no tiene', () => {
    expect(nodos[1]!.semanas).toBe('—');
    expect(nodos[1]!.detalle).toBe('Todavía no tiene ninguna semana montada');
  });

  it('el siguiente sigue arrancando en la semana 5', () => {
    // Contarle una semana de mentira correría TODOS los rótulos siguientes.
    expect(nodos[2]!.semanas).toBe('S5-S8');
  });
});

describe('cadena · un microciclo que ya no está se dice, no se dibuja vacío', () => {
  const nodos = nodosDeCadena([
    eslabon({ clave: 'a', nombre: 'Primer mes', semanas: 4 }),
    eslabon({ clave: 'b', nombre: null, semanas: 0 }),
  ]);

  it('se nombra el hecho y se dice qué hacer con él', () => {
    expect(nodos[1]!.falta).toBe(true);
    expect(nodos[1]!.titulo).toBe('Ciclo eliminado');
    expect(nodos[1]!.detalle).toBe('Ya no está en tu biblioteca · quítalo de la cadena');
  });

  it('no recibe tono de la paleta: no es una parada del camino, es un error', () => {
    expect(nodos[1]!.tono).toBe(null);
  });
});

describe('cadena · el tono es la POSICIÓN, y el reuso se declara', () => {
  it('el tono sale del sitio que ocupa, nunca del nombre del microciclo', () => {
    const nodos = nodosDeCadena([
      eslabon({ clave: 'a', nombre: 'Descarga' }),
      eslabon({ clave: 'b', nombre: 'Descarga' }),
      eslabon({ clave: 'c', nombre: 'Acumulación' }),
    ]);
    expect(nodos.map((n) => n.tono)).toEqual([0, 1, 2]);
  });

  it('un microciclo usado en más celdas lo dice en su propia parada', () => {
    const nodos = nodosDeCadena([
      eslabon({ clave: 'a', usos: 1 }),
      eslabon({ clave: 'b', usos: 2 }),
      eslabon({ clave: 'c', usos: 4 }),
    ]);
    expect(nodos[0]!.detalle).toBe(null);
    expect(nodos[1]!.detalle).toBe('También en otra secuencia');
    expect(nodos[2]!.detalle).toBe('También en otras 3 secuencias');
  });
});

describe('cadena · el rótulo en voz alta', () => {
  it('dice el sitio, el nombre y lo que dura', () => {
    const nodos = nodosDeCadena([eslabon({ clave: 'a', nombre: 'Base 1', semanas: 4 })]);
    expect(nodos[0]!.etiqueta).toBe('1. Base 1, 4 semanas (S1-S4)');
  });

  it('un microciclo que falta no finge una duración', () => {
    const nodos = nodosDeCadena([eslabon({ clave: 'a', nombre: null, semanas: 0 })]);
    expect(nodos[0]!.etiqueta).toBe(
      '1. Ciclo eliminado, Ya no está en tu biblioteca · quítalo de la cadena',
    );
  });
});
