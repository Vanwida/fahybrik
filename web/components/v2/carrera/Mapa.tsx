'use client';

// EL MAPA — el recorrido, coloreado por la zona de ritmo del atleta.
//
// EL COLOR ES DATO, NO ADORNO (mockup, §9.1; pantalla del atleta ya aprobada,
// `design-twin/screens/lectura-carrera/piezas.tsx#Mapa`). Un tramo ámbar tiene
// que significar lo mismo aquí que en el resto de la app — así que el color de
// cada segmento es literalmente `ResolvedZone.color`, la misma banda que el
// atleta ya ve en su reloj y en su móvil, nunca una rampa ni una paleta fija
// inventada para este componente. Las bandas son método del coach (Regla Nº0):
// otro entrenador las corta y las colorea distinto, así que el color viaja
// como dato del servidor, no como constante de aquí.
//
// SIN BASEMAP, A PROPÓSITO. El mockup y la pantalla del atleta ya resuelven
// esto con SVG plano —una polilínea ajustada a una caja, sin mosaicos de mapa
// de por medio— y las dos están aprobadas. Introducir Leaflet/MapLibre aquí
// sería un mapa DISTINTO del que ya se validó, no el mismo mapa con más
// dependencias: no hay tampoco ningún paquete de mapas ya instalado en el
// repo. La distancia entre dos GPS reales, más el ajuste de proyección de
// abajo, sí son matemática cerrada — igual que la propia referencia aprobada
// las escribe a mano, no hay paquete que resuelva "encajar ESTA forma en ESTA
// caja".
//
// LA PROYECCIÓN corrige lo que un mapa fake no necesitaba: un grado de
// longitud NO mide lo mismo que uno de latitud salvo en el ecuador (mide
// cos(latitud) menos). Sin corregirlo, un recorrido real saldría más ancho o
// más estrecho de lo que es. Se corrige con un factor único (el coseno de la
// latitud media de la ruta) — suficiente a la escala de una carrera (unos
// pocos km), donde una proyección más sofisticada no cambiaría el dibujo.
//
// LAS TRES HONESTIDADES, tal y como las sirve el servidor
// (`shared/domain/running/route-zones.ts`) — este componente no añade una
// cuarta, solo las pinta:
//   1 · Sin recorrido en absoluto (`route.available` false): el componente
//       devuelve null. No hay tarjeta, no hay «sin mapa» — no hay nada que el
//       coach pueda hacer para tenerlo (cinta, o sesión de antes de #64).
//   2 · Recorrido sin zonas medidas del atleta (`route.pace_zones` null): la
//       forma se dibuja igual, en gris — un mapa sin color es honesto, uno
//       con color inventado no.
//   3 · Un punto sin cobertura de velocidad (`zone_code` null) dentro de una
//       ruta que SÍ tiene color: ESE segmento sale gris, el resto no.

import type { AssignmentDetailRoute } from '@/lib/execution/session-trace';

/** Ancho de referencia del viewBox — unidad interna arbitraria, el SVG se
 *  estira a `width="100%"` del contenedor real. Solo fija la RELACIÓN entre
 *  el ancho y el resto de medidas (padding, grosor de trazo). */
const VIEWBOX_W = 400;
/** La altura se deriva de la forma REAL del recorrido (más abajo), pero
 *  nunca fuera de este rango — un recorrido casi recto no se aplasta a una
 *  línea de unos pocos px, y uno casi vertical no se estira a una columna. */
const ALTO_MIN = VIEWBOX_W * 0.32;
const ALTO_MAX = VIEWBOX_W * 0.78;
const PADDING = VIEWBOX_W * 0.035;

interface PuntoProyectado {
  x: number;
  y: number;
  color: string | null;
}

/**
 * Lat/lon reales → puntos en el viewBox, con la corrección de coseno de la
 * cabecera y el eje Y invertido (norte arriba: latitud creciente = y
 * decreciente, al revés que SVG). Devuelve también la altura que le
 * corresponde a ESTA forma, ya fijada al rango declarado arriba.
 */
function proyectar(
  points: readonly { lat: number; lon: number; zone_code: string | null }[],
  colorDeZona: (codigo: string | null) => string | null,
): { puntos: PuntoProyectado[]; alto: number } {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const latMedia = (Math.min(...lats) + Math.max(...lats)) / 2;
  const correccionLon = Math.cos((latMedia * Math.PI) / 180);

  // Espacio intermedio: longitud corregida, latitud invertida — antes de
  // encajar en la caja, para que el aspect ratio salga de la forma real.
  const xs = lons.map((lon) => lon * correccionLon);
  const ys = lats.map((lat) => -lat);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const anchoForma = x1 - x0 || 1e-9;
  const altoForma = y1 - y0 || 1e-9;

  const cajaW = VIEWBOX_W - PADDING * 2;
  // La altura del viewBox sigue la proporción real de la ruta (alto/ancho de
  // su forma), clamped al rango declarado.
  const alto = Math.min(ALTO_MAX, Math.max(ALTO_MIN, VIEWBOX_W * (altoForma / anchoForma)));
  const cajaH = alto - PADDING * 2;

  // Una única escala para los dos ejes (el menor de los dos encajes) — la
  // misma regla que el mockup: nunca deformar la forma para llenar la caja.
  const escala = Math.min(cajaW / anchoForma, cajaH / altoForma);
  const offsetX = PADDING + (cajaW - anchoForma * escala) / 2;
  const offsetY = PADDING + (cajaH - altoForma * escala) / 2;

  const puntos = points.map((p, i) => ({
    x: offsetX + (xs[i]! - x0) * escala,
    y: offsetY + (ys[i]! - y0) * escala,
    color: colorDeZona(p.zone_code),
  }));

  return { puntos, alto };
}

export function Mapa({ route }: { route: AssignmentDetailRoute }) {
  if (!route.available || route.points.length < 2) return null;

  const colorPorCodigo = new Map((route.pace_zones ?? []).map((z) => [z.code, z] as const));
  const colorDeZona = (codigo: string | null): string | null => {
    if (!codigo) return null;
    return colorPorCodigo.get(codigo)?.color ?? null;
  };

  const { puntos, alto } = proyectar(route.points, colorDeZona);

  // La leyenda la escriben las zonas que de verdad se han pintado — nunca
  // escrita a mano, que es cómo un pie de mapa acaba nombrando un color que
  // no está en NINGÚN segmento de esta ruta concreta.
  const codigosUsados = [...new Set(route.points.map((p) => p.zone_code).filter((z): z is string => z != null))];
  const zonasUsadas = codigosUsados.map((c) => colorPorCodigo.get(c)).filter((z): z is NonNullable<typeof z> => z != null);
  zonasUsadas.sort((a, b) => a.sort_order - b.sort_order);

  const sinZonasDelAtleta = route.pace_zones == null;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]">
        <svg
          role="img"
          aria-label="Recorrido de la sesión, coloreado por la zona de ritmo del atleta"
          viewBox={`0 0 ${VIEWBOX_W} ${alto}`}
          width="100%"
          height={alto}
          style={{ display: 'block' }}
        >
          {puntos.slice(1).map((p, i) => {
            const a = puntos[i]!;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={p.x}
                y2={p.y}
                stroke={p.color ?? 'var(--v2-muted)'}
                strokeWidth={2.6}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {zonasUsadas.map((z) => (
          <span
            key={z.code}
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: z.color, background: `color-mix(in srgb, ${z.color} 16%, transparent)` }}
          >
            {z.code}
          </span>
        ))}
        <span className="text-[11px] text-[color:var(--v2-faint)]">
          {sinZonasDelAtleta
            ? 'el atleta todavía no tiene zonas de ritmo medidas, así que el recorrido no se puede colorear'
            : 'por su zona de ritmo'}
        </span>
      </div>
    </div>
  );
}
