'use client';

// PERFIL · REHECHO — propuesta de la pestaña del atleta (29-sep), con el diseño
// de «Hoy · El día».
//
// TESIS: Perfil no es un panel de ajustes, es EL ATLETA. Al abrirlo se viene a
// una de dos cosas, y el orden sale de ahí: a ver quién eres en cifras (tu
// nombre, tu foto, tus métricas y tus cinco números) o a arreglar algo (una
// pregunta pendiente, un reloj, la suscripción). Los ajustes se quedan al fondo.
// Recibe una `LecturaPerfil` (kit-perfil/contrato) y solo PINTA: lo que se decide
// vive en kit-perfil/decision.ts y rendimiento.ts, puro y con test.
//
// La altura es `llena` (CONTRATO-UI §6.1): la barra de pestañas es fija, el cuerpo
// scrollea cuando desborda y, cuando NO llega al alto, el sobrante entra en el
// propio sujeto (entre su título y su acción), jamás en una cola muerta.
//
// LAS DECISIONES DE JERARQUÍA, una línea cada una:
//  1. El sujeto es el atleta: el único bloque que pasa de 40 px, con el tinte de
//     la marca, su foto con la chapita de cámara y su nombre en el display.
//  2. Un perfil recién creado no parece roto: el sujeto se vuelve la invitación
//     honesta a completarlo, con UNA acción (completar, o poner el nombre); la
//     foto nunca se obliga, se ofrece con la chapita del avatar.
//  3. El naranja sólido se reserva para «haz esto ahora» y Perfil no tiene ningún
//     momento así: la marca va en el tinte y en la regleta del test que falta.
//  4. «Pendiente» solo existe si hay algo que hacer, y solo entran actos: esperar
//     no es un acto. La pregunta de COROS se contesta dentro de su fila.
//  5. Rendimiento son teselas con la cifra a 32 px: un contador se pinta en cero,
//     un valor medido no existe hasta que se mide (entonces, su invitación).
//  6. Las puertas dicen qué saben del atleta antes que qué hay dentro; se pliegan
//     las que no tienen nada que decir, y una que dice algo NUNCA se pliega.
//  7. Cerrar sesión pesa lo mínimo: solo texto, con el peligro en el texto.
//
// Cada pieza resuelve sus cuatro estados: con datos, en frío (esqueletos con la
// forma final), vacío (invitación con su salida) y error («Reintentar»).

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { Estilos } from '../../kit-dia/estilos';
import { MARGEN } from '../../kit-dia/tokens';
import { CASOS_PERFIL, casoPerfil } from '../../kit-perfil/casos';
import { modoIdentidad, pendientesDe } from '../../kit-perfil/decision';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Ajustes } from './ajustes';
import { Aviso, type AvisoActivo } from './aviso';
import { Identidad } from './identidad';
import { PendienteSeccion, type RespuestaCoros } from './pendiente';
import { Pie } from './pie';
import { Rendimiento } from './rendimiento';

export const meta: TwinMeta = {
  id: 'perfil-rehecho',
  titulo: 'Perfil · El atleta',
  zona: 'Perfil y ajustes',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Perfil deja de ser una lista de ajustes: manda el atleta (foto, nombre en display de marca y sus métricas) en un bloque editorial con el tinte de la marca; debajo, «Pendiente» solo si hay algo que responder (la pregunta de COROS se contesta ahí mismo), después Rendimiento como cinco teselas con la cifra grande y, al fondo, las seis puertas con lo que dicen del atleta (dispositivo conectado, decisión sobre el reloj, suscripción) y las mudas plegadas. El perfil recién creado se vuelve la invitación a completarlo. Prueba a contestar la pregunta de COROS y a abrir «Más ajustes».',
  fuentes: [],
  enApp:
    'Perfil es ProfileView.swift: una tarjeta de identidad (avatar, nombre, subtítulo, lápiz), seis puertas planas (Identidad, Entreno, Dispositivos y apps, Cuenta, Privacidad, Ayuda y legal) con la sección Rendimiento (RendimientoSection.swift, cinco filas con su cifra) entre la primera y la segunda, «Cerrar sesión» con contorno rojo y la versión con siete toques. La pregunta de COROS sale como diálogo del sistema al abrir. Esto reordena y rediseña esa misma raíz, sin cambiar de dónde sale cada dato; las pantallas que cuelgan de las puertas no se tocan.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = CASOS_PERFIL.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

/** Cuánto dura un aviso pasajero antes de irse solo. */
const AVISO_MS = 3800;

const AVISO_COROS: Record<RespuestaCoros, string> = {
  si: 'Hecho: esa actividad es tu entreno de hoy.',
  no: 'La actividad queda en el historial. El plan no se toca.',
  'ahora-no': 'Vale. Te lo volvemos a preguntar la próxima vez que abras Perfil.',
};

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const l = casoPerfil(escenario).lectura;
  // La pregunta de COROS se contesta aquí mismo: contestada, la fila se va.
  const [coros, setCoros] = useState<RespuestaCoros | null>(null);
  // El aviso de COROS que trae la propia lectura (importó entrenos, o falló) sale al abrir; las respuestas, al pulsarlas.
  const [aviso, setAviso] = useState<AvisoActivo | null>(l.corosAviso);

  const items = useMemo(() => pendientesDe(l).filter((p) => !(p.clave === 'coros' && coros !== null)), [l, coros]);

  useEffect(() => {
    onLog(`Sujeto: ${modoIdentidad(l)}${l.conCoach ? '' : ' · sin coach'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escenario]);

  // Un fallo se queda hasta descartarlo; lo demás se va solo.
  useEffect(() => {
    if (!aviso || aviso.tono === 'fallo') return;
    const t = setTimeout(() => setAviso(null), AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  const respondeCoros = (r: RespuestaCoros) => {
    setCoros(r);
    setAviso({ tono: 'ok', texto: AVISO_COROS[r] });
    onLog(`COROS «¿esto es el entreno?» → ${r === 'si' ? 'Sí' : r === 'no' ? 'No' : 'Ahora no (se vuelve a preguntar)'}`);
  };

  return (
    <div className="twin-screen-safe">
      <Estilos />
      <Pantalla estrategia="llena" tabBar={<TabBar activa="Perfil" />}>
        <div
          style={{
            minHeight: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 22,
            padding: `12px ${MARGEN}px 32px`,
          }}
        >
          {/* La `key` por modo: al cambiar de momento el bloque nuevo entra, no se reescribe. */}
          <div
            key={modoIdentidad(l)}
            className="hd-sube"
            style={{ '--i': 0, display: 'flex', flexDirection: 'column', flex: '1 0 auto' } as CSSProperties}
          >
            <Identidad l={l} onLog={onLog} />
          </div>

          {items.length > 0 ? (
            <div className="hd-sube" style={{ '--i': 1 } as CSSProperties}>
              <PendienteSeccion items={items} onLog={onLog} onCoros={respondeCoros} />
            </div>
          ) : null}

          <div className="hd-sube" style={{ '--i': 2 } as CSSProperties}>
            <Rendimiento l={l} onLog={onLog} />
          </div>

          <div className="hd-sube" style={{ '--i': 3 } as CSSProperties}>
            <Ajustes l={l} onLog={onLog} />
          </div>

          <div className="hd-sube" style={{ '--i': 4 } as CSSProperties}>
            <Pie version={l.version} onLog={onLog} onDiagnostico={() => setAviso({ tono: 'ok', texto: 'Diagnóstico del reloj: se abriría la pantalla escondida.' })} />
          </div>
        </div>
      </Pantalla>
      {aviso ? <Aviso aviso={aviso} onCierra={() => setAviso(null)} /> : null}
    </div>
  );
}
