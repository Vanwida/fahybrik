import { describe, expect, it } from 'vitest';
import {
  buildRouteZonePoints,
  haversineDistanceM,
  paceZoneForSecPerKm,
  type LatLon,
} from '@fahybrid/shared/domain/running/route-zones';
import type { ResolvedZone } from '@fahybrid/shared/domain/methodology';

// El mapa de la ruta (#71) — casos fabricados, como el resto de esta tanda:
// no hay ninguna polilínea ni traza real en producción todavía (`workout_
// routes`/`workout_traces` a 0 filas, verificado contra prod), así que estos
// casos son el modelo roto contra escenarios de verdad, no contra el seed.

// Seis bandas realistas, per_km, sin solapes salvo el borde compartido entre
// zonas adyacentes (mismo patrón que produce `resolveZonesForAthlete`: el
// borde rápido de una zona ES el borde lento de la siguiente).
const ZONES: ResolvedZone[] = [
  { code: 'Z1', label: 'Recuperación', color: '#8aa', role: 'recovery', sort_order: 1, fast_s: 360, slow_s: null },
  { code: 'Z2', label: 'Base aeróbica', color: '#8a8', role: 'aerobic_base', sort_order: 2, fast_s: 330, slow_s: 360 },
  {
    code: 'Z3',
    label: 'Umbral aeróbico',
    color: '#aa8',
    role: 'aerobic_threshold',
    sort_order: 3,
    fast_s: 300,
    slow_s: 330,
  },
  { code: 'Z4', label: 'Umbral', color: '#da8', role: 'threshold', sort_order: 4, fast_s: 270, slow_s: 300 },
  { code: 'Z5', label: 'VO2max', color: '#d88', role: 'vo2max', sort_order: 5, fast_s: 240, slow_s: 270 },
  { code: 'Z6', label: 'Sprint', color: '#d55', role: 'sprint', sort_order: 6, fast_s: 200, slow_s: 240 },
];

describe('haversineDistanceM', () => {
  it('es 0 para el mismo punto', () => {
    expect(haversineDistanceM({ lat: 41.4, lon: 2.15 }, { lat: 41.4, lon: 2.15 })).toBe(0);
  });

  it('un grado de latitud en el ecuador ≈ 111.32 km — el radio ecuatorial WGS84 de `haversine-distance`', () => {
    const d = haversineDistanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeCloseTo(111319.49, 0);
  });

  it('es simétrica', () => {
    const a: LatLon = { lat: 41.3879, lon: 2.16 };
    const b: LatLon = { lat: 41.3912, lon: 2.1591 };
    expect(haversineDistanceM(a, b)).toBeCloseTo(haversineDistanceM(b, a), 9);
  });

  it('una separación corta y real da metros, no kilómetros ni milímetros', () => {
    // Dos puntos ~55.6 m separados en latitud (0.0005° ≈ 55.6 m).
    const d = haversineDistanceM({ lat: 41.4, lon: 2.15 }, { lat: 41.4005, lon: 2.15 });
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(60);
  });
});

describe('paceZoneForSecPerKm', () => {
  it('clasifica un ritmo muy lento en la zona más fácil', () => {
    expect(paceZoneForSecPerKm(400, ZONES)?.code).toBe('Z1');
  });

  it('clasifica cada banda intermedia correctamente', () => {
    expect(paceZoneForSecPerKm(345, ZONES)?.code).toBe('Z2');
    expect(paceZoneForSecPerKm(315, ZONES)?.code).toBe('Z3');
    expect(paceZoneForSecPerKm(285, ZONES)?.code).toBe('Z4');
    expect(paceZoneForSecPerKm(255, ZONES)?.code).toBe('Z5');
    expect(paceZoneForSecPerKm(220, ZONES)?.code).toBe('Z6');
  });

  it('en el borde EXACTO compartido entre dos zonas, gana la más fácil — mismo criterio que zoneForBpm', () => {
    // 360 es a la vez el borde rápido de Z1 y el borde lento de Z2.
    expect(paceZoneForSecPerKm(360, ZONES)?.code).toBe('Z1');
  });

  it('un ritmo más rápido que la zona más dura satura en esa zona, nunca null', () => {
    expect(paceZoneForSecPerKm(150, ZONES)?.code).toBe('Z6');
  });

  it('null para un ritmo no positivo o no finito', () => {
    expect(paceZoneForSecPerKm(0, ZONES)).toBeNull();
    expect(paceZoneForSecPerKm(-10, ZONES)).toBeNull();
    expect(paceZoneForSecPerKm(NaN, ZONES)).toBeNull();
    expect(paceZoneForSecPerKm(Infinity, ZONES)).toBeNull();
  });

  it('null cuando no hay bandas', () => {
    expect(paceZoneForSecPerKm(300, [])).toBeNull();
  });

  it('no depende del orden de entrada — reordena por sort_order internamente', () => {
    const shuffled = [...ZONES].reverse();
    expect(paceZoneForSecPerKm(315, shuffled)?.code).toBe('Z3');
  });
});

describe('buildRouteZonePoints', () => {
  // Distancia acumulada real de los tres puntos del caso de punta a punta,
  // de abajo (vía `haversine-distance`): P0→P1 y P1→P2 son ~55.66 m cada uno
  // (0.0005° de latitud), así que en t=60 la traza debe marcar 55.66 (no
  // 111.32 — ese es P0→P2).
  const distance = { offsets_s: [0, 60, 120], values: [0, 55.6597453964917, 111.31949079369151] };
  // 500 s/km en t=0 (Z1), 333.33 s/km en t=60 (Z2), 250 s/km en t=120 (Z5).
  const speed = { offsets_s: [0, 60, 120], values: [2.0, 3.0, 4.0] };

  it('menos de 2 puntos no es una ruta dibujable', () => {
    expect(buildRouteZonePoints({ points: [], distance, speed, pace_zones: ZONES })).toEqual([]);
    expect(
      buildRouteZonePoints({ points: [{ lat: 41.4, lon: 2.15 }], distance, speed, pace_zones: ZONES }),
    ).toEqual([]);
  });

  it('caso de punta a punta: tres puntos reales, clasificados por su ritmo real', () => {
    // Mismos tres puntos y traza que el fixture de haversineDistanceM — el
    // primero a 55.6 m del segundo, el segundo a otros 55.6 m del tercero.
    const points: LatLon[] = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
      { lat: 41.401, lon: 2.15 },
    ];
    const result = buildRouteZonePoints({ points, distance, speed, pace_zones: ZONES });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ lat: 41.4, lon: 2.15, zone_code: 'Z1' });
    expect(result[1]).toMatchObject({ lat: 41.4005, lon: 2.15, zone_code: 'Z2' });
    expect(result[2]).toMatchObject({ lat: 41.401, lon: 2.15, zone_code: 'Z5' });
  });

  it('el primer punto es SIEMPRE el instante 0 — nunca se busca en la traza de distancia', () => {
    // Una traza de distancia que NO cubre 0 (empieza en t=10, valor 5 — si el
    // punto 0 se buscara como cualquier otro, `timeAtValue` lo rechazaría por
    // caer antes de la primera muestra). El punto 0 debe seguir resolviendo,
    // porque su instante es 0 por definición, no por búsqueda.
    const lateStart = { offsets_s: [10, 70], values: [5, 65] };
    const speedFromStart = { offsets_s: [0, 70], values: [2.0, 2.0] }; // 500 s/km constante
    const points: LatLon[] = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
    ];
    const result = buildRouteZonePoints({ points, distance: lateStart, speed: speedFromStart, pace_zones: ZONES });
    expect(result[0]!.zone_code).toBe('Z1'); // se resolvió — no null por "falta cobertura en 0"
  });

  it('un hueco alrededor de un punto lo deja en null sin tocar los demás — honestidad granular', () => {
    // Cuatro puntos; el tercero cae en un hueco de la traza de distancia
    // (100 s → 260 s, 160 s de silencio, por encima de MAX_INTERPOLATION_GAP_S).
    const gappy = { offsets_s: [0, 100, 260, 320], values: [0, 200, 900, 1000] };
    const steadySpeed = { offsets_s: [0, 320], values: [2.0, 2.0] };
    const points: LatLon[] = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4002, lon: 2.15 }, // ~22 m — cae dentro del tramo limpio
      { lat: 41.4045, lon: 2.15 }, // ~500 m — cae DENTRO del hueco
      { lat: 41.4082, lon: 2.15 }, // ~910 m — después del hueco, cubierto de nuevo
    ];
    const result = buildRouteZonePoints({ points, distance: gappy, speed: steadySpeed, pace_zones: ZONES });
    expect(result).toHaveLength(4);
    expect(result[0]!.zone_code).not.toBeNull();
    expect(result[2]!.zone_code).toBeNull(); // el que cae en el hueco, y SOLO ese
  });

  it('sin zonas del atleta, la ruta sale con sus puntos pero todo el color en null', () => {
    const points: LatLon[] = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
    ];
    const result = buildRouteZonePoints({ points, distance, speed, pace_zones: null });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.zone_code === null)).toBe(true);
    // Las coordenadas SÍ viajan — la ruta no desaparece por no tener con qué colorearla.
    expect(result[0]).toMatchObject({ lat: 41.4, lon: 2.15 });
  });

  it('velocidad cero o negativa en el instante resuelto no produce un ritmo infinito ni inventado', () => {
    const stoppedSpeed = { offsets_s: [0, 60], values: [0, 0] };
    const points: LatLon[] = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
    ];
    const result = buildRouteZonePoints({ points, distance, speed: stoppedSpeed, pace_zones: ZONES });
    expect(result[0]!.zone_code).toBeNull();
  });

  it('sin traza de distancia ni de velocidad, la ruta sale con sus puntos y todo en null — nunca lanza', () => {
    const points: LatLon[] = [
      { lat: 41.4, lon: 2.15 },
      { lat: 41.4005, lon: 2.15 },
      { lat: 41.401, lon: 2.15 },
    ];
    const empty = { offsets_s: [], values: [] };
    expect(() =>
      buildRouteZonePoints({ points, distance: empty, speed: empty, pace_zones: ZONES }),
    ).not.toThrow();
    const result = buildRouteZonePoints({ points, distance: empty, speed: empty, pace_zones: ZONES });
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.zone_code === null)).toBe(true);
  });
});
