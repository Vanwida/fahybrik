import { describe, expect, it } from 'vitest';
import { escenarioPlan } from '@/components/design-twin/plan/datos';
import {
  cuandoElHito,
  cuentaSesiones,
  estadoDia,
  minutosMedidos,
  proximoHito,
  repartoSemana,
  semanaDelCiclo,
  semanasQueQuedan,
} from '@/components/design-twin/plan/modelo';

// La ley de honestidad del plan no se sostiene con un comentario: se sostiene
// aquí. Estas pruebas fijan las decisiones que, si alguien las deshace en una
// pantalla, hacen que la app mienta — y lo hacen sobre los ESCENARIOS REALES,
// no sobre datos de juguete.
//
// El precedente es `zonas.test.ts`: el reparto de zonas se separó de la app y
// hubo dos verdades. Aquí se corta antes.

describe('plan · el estado de un día lo decide la EJECUCIÓN, no el status guardado', () => {
  // En producción la asignación 244 sigue en `scheduled` mientras su ejecución
  // 59 existe y marcó 1:13:00. El estado guardado se queda viejo; la medida no.
  const { semana } = escenarioPlan('coach');

  it('un día con ejecución está hecho aunque su asignación siga programada', () => {
    // Viernes 17: Simulación HYROX, asignación 239 «scheduled», ejecución 66.
    expect(estadoDia(semana.dias[4], 4, semana.indiceHoy)).toBe('hecha');
  });

  it('un día prescrito y ya pasado sin ejecución está saltado', () => {
    // Martes 14: Series de carrera, sin ninguna ejecución.
    expect(estadoDia(semana.dias[1], 1, semana.indiceHoy)).toBe('saltada');
  });

  it('un día sin nada en el plan es descanso, no una sesión que falta', () => {
    expect(estadoDia(semana.dias[5], 5, semana.indiceHoy)).toBe('descanso');
  });

  it('en una semana que no es la de hoy ningún día se juzga como saltado', () => {
    const suelta = { ...semana, indiceHoy: -1 };
    expect(estadoDia(suelta.dias[1], 1, suelta.indiceHoy)).toBe('pendiente');
  });
});

describe('plan · un contador se pinta en cero; un valor medido no existe hasta medirse', () => {
  it('la semana sin publicar cuenta 0 de 0 y NO inventa minutos', () => {
    const { semana } = escenarioPlan('sin-publicar');
    expect(cuentaSesiones(semana)).toEqual({ hechas: 0, total: 0 });
    // Cero minutos medidos es «no se ha medido nada», y eso es null, no 0:
    // un 0 se leería como «entrenaste cero», que es un veredicto.
    expect(minutosMedidos(semana)).toBeNull();
  });

  it('el atleta recién dado de alta tampoco tiene minutos que enseñar', () => {
    const { semana } = escenarioPlan('alta-nueva');
    expect(minutosMedidos(semana)).toBeNull();
  });

  it('la semana real del coach cuenta lo hecho sobre lo asignado', () => {
    const { semana } = escenarioPlan('coach');
    // Ocho asignaciones en seis días, seis con ejecución.
    expect(cuentaSesiones(semana)).toEqual({ hechas: 6, total: 8 });
    expect(minutosMedidos(semana)).toBeGreaterThan(0);
  });
});

describe('plan · el reparto por modalidad cuenta SESIONES, nunca minutos', () => {
  it('ordena por peso y no pierde ninguna modalidad', () => {
    const { semana } = escenarioPlan('coach');
    const reparto = repartoSemana(semana);
    expect(reparto.length).toBeGreaterThan(1);
    for (let i = 1; i < reparto.length; i += 1) {
      expect(reparto[i - 1].sesiones).toBeGreaterThanOrEqual(reparto[i].sesiones);
    }
    const total = reparto.reduce((n, r) => n + r.sesiones, 0);
    // Cada trabajo aporta sus modalidades declaradas (como mucho dos).
    const declaradas = semana.dias.reduce(
      (n, d) => n + d.trabajos.reduce((m, t) => m + t.modalidades.length, 0),
      0,
    );
    expect(total).toBe(declaradas);
  });

  it('una semana vacía no tiene reparto que enseñar', () => {
    const { semana } = escenarioPlan('alta-nueva');
    expect(repartoSemana(semana)).toEqual([]);
  });
});

describe('plan · fuera de un tramo no hay posición, y eso NO es cero', () => {
  it('el atleta cuyo plan acabó no tiene semana del ciclo ni semanas restantes', () => {
    const { ciclo } = escenarioPlan('sin-publicar');
    expect(ciclo.indiceActual).toBe(-1);
    // null = «no se sabe dónde estás». Un 0 sería «acabas hoy», que es otra cosa.
    expect(semanaDelCiclo(ciclo)).toBeNull();
    expect(semanasQueQuedan(ciclo)).toBeNull();
  });

  it('el atleta recién dado de alta no tiene ni tramos', () => {
    const { ciclo } = escenarioPlan('alta-nueva');
    expect(ciclo.tramos).toEqual([]);
    expect(ciclo.carrera).toBeNull();
    // Sin secuencia no se sabe qué viene después, y se dice en vez de suponerlo.
    expect(ciclo.alAcabar).toBeNull();
  });

  it('dentro de una secuencia sí hay posición y sí quedan semanas', () => {
    const { ciclo } = escenarioPlan('secuencia');
    // Tramo 2 («Base 1»), semana 2 → semana 6 de 12.
    expect(semanaDelCiclo(ciclo)).toBe(6);
    expect(semanasQueQuedan(ciclo)).toBe(6);
  });
});

describe('plan · un hito sin fecha nunca adelanta a uno con fecha', () => {
  const { ciclo } = escenarioPlan('secuencia');

  it('el próximo hito es el que tiene fecha más cercana', () => {
    const proximo = proximoHito(ciclo);
    expect(proximo?.hito.nombre).toBe('Batería 1RM');
    expect(proximo?.hito.enDias).toBe(1);
  });

  it('un hito con posición se dice por su posición, jamás con una fecha inventada', () => {
    const testing = ciclo.tramos[2].hitos[1];
    expect(testing.enDias).toBeNull();
    expect(cuandoElHito(testing)).toBe('semana 1 · miércoles');
  });

  it('un hito con fecha se dice en días', () => {
    expect(cuandoElHito({ clase: 'test', nombre: 'x', enDias: 1, semanaDelTramo: null, diaInicial: null })).toBe(
      'mañana',
    );
    expect(cuandoElHito({ clase: 'test', nombre: 'x', enDias: 12, semanaDelTramo: null, diaInicial: null })).toBe(
      'en 12 días',
    );
  });
});

describe('plan · una duración prevista solo existe si la prescripción la deja calcular', () => {
  it('las sesiones sin dosis en su bloque de trabajo NO traen estimación', () => {
    const { semana } = escenarioPlan('coach');
    const porTitulo = new Map(
      semana.dias.flatMap((d) => d.trabajos).map((t) => [t.titulo, t] as const),
    );
    // El Metcon llega con los dos ítems de trabajo vacíos; la simulación es
    // `for_time`, donde la duración ES el resultado; el circuito de pierna
    // tiene cuatro ítems sin cuánto. Ninguno se puede estimar.
    expect(porTitulo.get('Metcon')?.previstoMin).toBeNull();
    expect(porTitulo.get('Simulación HYROX')?.previstoMin).toBeNull();
    expect(porTitulo.get('Fuerza · circuito de pierna')?.previstoMin).toBeNull();
    // El rodaje sí: todos sus tramos llevan tiempo escrito.
    expect(porTitulo.get('Rodaje Z2')?.previstoMin).toBe(68);
  });

  it('un trabajo medido enseña la medida, no la estimación', () => {
    const { semana } = escenarioPlan('coach');
    const hyrox = semana.dias[4].trabajos[0];
    expect(hyrox.medidoMin).toBe(16);
    expect(hyrox.previstoMin).toBeNull();
  });
});

describe('plan · el entreno libre no es un anexo del plan del coach', () => {
  it('el martes del atleta 64 tiene cinco trabajos y cuatro son suyos', () => {
    const { semana, diaAbierto } = escenarioPlan('libre');
    const dia = semana.dias[diaAbierto];
    expect(dia.trabajos).toHaveLength(5);
    expect(dia.trabajos.filter((t) => t.origen === 'libre')).toHaveLength(4);
    expect(dia.trabajos.filter((t) => t.esTest)).toHaveLength(1);
  });
});
