'use client';

// HOY · EL PULSO: propuesta de la portada del atleta (29-09).
//
// TESIS. La pregunta con la que se abre la app cada mañana es «¿cómo estoy hoy?».
// El sujeto de la pantalla, lo primero que se ve y por mucho lo más grande, es la
// disposición: un dial de 300 pt con la cifra a 120 pt. Todo lo demás se ordena por
// las preguntas que vienen detrás: ¿qué toca? · ¿hacia dónde voy? · ¿qué me espera?
//
// DECISIONES DE JERARQUÍA (una línea cada una):
//  · Dial 300 pt / cifra 120 pt: es el sujeto (§6, regla 1); ningún otro elemento pasa de 60 pt.
//  · El color de zona vive SOLO en el arco, su marca y el halo: el color es un dato, y el
//    naranja de marca queda para acciones (§9.1). La palabra de estado va en tinta normal.
//  · Los cortes de las zonas salen de `BANDAS_DISPOSICION` (método del coach) y se dibujan
//    como muescas del arco: la vista no escribe ningún corte, solo los lee.
//  · La palabra, el cambio en 7 días y la salida van DENTRO de la abertura del arco: el dial
//    no arrastra una cola de texto y con «sin número» la misma abertura aloja la invitación.
//  · Las cuatro señales son celdas de instrumento (24 pt / 15 pt) con reglas finas: explican
//    el número sin tarjeta dentro de tarjeta; una apagada se dice, y el check-in por hacer es
//    un botón teñido con el naranja de acción (no tapa el dial).
//  · «Toca hoy» es UNA fila con el ESTADO de la sesión y lleva al Plan: jamás un «Empezar»
//    (el Plan es la única puerta, 6-ago). Con dos sesiones la cerrada baja a una línea.
//  · El entreno a medias se promueve sobre esa fila: es la misma sesión, empezada.
//  · El camino es una banda con los días como cifra (60 pt) y la fase del coach como texto;
//    la foto es textura bajo un velo del color del lienzo, y la regleta marca «estás aquí».
//  · Lo que reclama va PLEGADO en un bloque con contador, ordenado por urgencia; sin nada,
//    la banda no existe. Sin coach no hay ninguna pieza de coach, ni vacía.
//  · El pie es una marca reciente como prueba (el progreso vive en Analíticas) y los pasos.
//  · «¿Hoy lo tuyo?» es acción secundaria con coach y, sin coach, el hueco de «qué toca hoy».
//
// ALTURA (§6.1): `llena`. Las bandas son filas con regla fina y centran su contenido; el
// sobrante entra en ellas (el dial se lleva más), nunca en una cola. Si el contenido
// desborda, scrollea desde arriba. El dial y «toca hoy» caen sobre el pliegue en el caso lleno.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CASOS_HOY } from '../../kit-hoy/casos';
import { LECTURA_ZONA, zonaDe, type LecturaHoy } from '../../kit-hoy/contrato';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { Banda } from './atomos';
import { Cabecera, Saludo } from './cabecera';
import { Camino } from './camino';
import { Dial } from './dial';
import { Estilos } from './estilos';
import { Hoy, Retomar } from './hoy';
import { Libre, Pie } from './pie';
import { Reclamos } from './reclamos';
import { Senales } from './senales';
import { MARGEN } from './tokens';

export const meta: TwinMeta = {
  id: 'hoy-pulso',
  titulo: 'Hoy · El pulso',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'La portada contesta primero «¿cómo estoy hoy?»: un dial de 300 pt con la disposición a 120 pt, su palabra de estado y el cambio en 7 días dentro del arco, y debajo las cuatro señales que la alimentan. Después, en el orden de las preguntas: qué toca hoy (el estado, que lleva al Plan), el camino a la carrera, lo que te espera plegado con contador, el pie tranquilo y el entreno libre.',
  fuentes: [],
  enApp:
    'Hoy es InicioView.swift: una pila de tarjetas iguales (camino a la carrera, ¿cómo llegas hoy? con su detalle, progreso, entreno libre, pareja, pasos y proyección), más el aviso de entreno a medias, los tests y la revisión del coach. Aquí el progreso se queda en Analíticas (una marca como prueba) y la fila de «qué toca hoy» vuelve como estado que lleva al Plan.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = CASOS_HOY.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

/** Lo que se cuenta en la cronología al abrir el caso: lo que la portada sabe, en una línea. */
function resumen(l: LecturaHoy): string {
  if (l.cargando) return 'Arranque en frío: todo en esqueleto, sin invitaciones ni vacíos';
  const d = l.disposicion;
  const dial = d.tipo === 'medida' ? `disposición ${Math.round(d.score)} (${LECTURA_ZONA[zonaDe(d.score)]})` : `disposición sin número (${d.motivo})`;
  const hoy = l.hoy === null ? 'sin plan (sin coach)' : l.hoy.tipo === 'sesiones' ? `${l.hoy.sesiones.length} sesión(es) hoy` : `hoy: ${l.hoy.tipo}`;
  return `${l.nombre ?? 'Sin nombre'} · ${dial} · ${hoy}`;
}

const CONTENIDO: CSSProperties = {
  minHeight: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  padding: `8px ${MARGEN}px ${MARGEN}px`,
  overflowX: 'clip',
};

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const l = (CASOS_HOY.find((c) => c.id === escenario) ?? CASOS_HOY[0]).lectura;
  const [checkinHecho, setCheckinHecho] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onLog(resumen(l));
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
    // Se cuenta una vez por reproducción (el escenario remonta la pantalla).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkin = useCallback(() => {
    setCheckinHecho(true);
    onLog('Check-in → abre el check-in; al enviarlo, el número se recalcula en el servidor');
  }, [onLog]);

  const reintentar = useCallback(() => {
    setReintentando(true);
    onLog('Reintentar → vuelve a pedir el plan');
    temporizador.current = setTimeout(() => setReintentando(false), 1100);
  }, [onLog]);

  const aMedias = l.reclamos.find((r) => r.clave === 'a-medias');

  return (
    <div className="twin-screen-safe">
      <Estilos />
      <Pantalla estrategia="llena" tabBar={<TabBar activa="Inicio" />}>
        <div style={CONTENIDO}>
          <Cabecera l={l} appearance={appearance} onLog={onLog} />
          <Saludo l={l} />

          <Banda etiqueta="Cómo llegas hoy" orden={2} crece={3} regla={false} relleno={4}>
            <Dial
              l={l}
              appearance={appearance}
              checkinHecho={checkinHecho}
              onCheckin={checkin}
              onConectar={() => onLog('Conectar Apple Salud → Perfil')}
              onDetalle={() => onLog('¿Cómo llegas hoy? → abre el detalle: qué lo explica, tendencia y check-in')}
            />
            <div style={{ borderTop: l.disposicion.tipo === 'medida' || l.cargando ? '1px solid var(--twin-hairline)' : undefined, marginTop: 4 }}>
              <Senales l={l} checkinHecho={checkinHecho} onCheckin={checkin} />
            </div>
          </Banda>

          {l.conCoach ? (
            <>
              {aMedias && aMedias.clave === 'a-medias' ? <Retomar r={aMedias} orden={3} onIr={onLog} /> : null}
              <Hoy l={l} orden={4} reintentando={reintentando} onIr={onLog} onReintentar={reintentar} />
              <Camino l={l} orden={5} appearance={appearance} onIr={onLog} onBuscar={() => onLog('Busca tu carrera → abre el buscador de carreras')} />
              <Reclamos l={l} orden={6} onIr={onLog} />
            </>
          ) : (
            <Libre l={l} orden={4} onCrear={() => onLog('Crear entreno libre → abre el constructor')} />
          )}

          <Pie l={l} orden={7} onIr={onLog} />
          {l.conCoach ? <Libre l={l} orden={8} onCrear={() => onLog('Crear entreno libre → abre el constructor')} /> : null}
        </div>
      </Pantalla>
    </div>
  );
}
