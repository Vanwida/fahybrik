'use client';

// EL SUJETO DE PERFIL: EL ATLETA. Un bloque editorial con el tinte de la marca,
// su foto, su nombre en el display de la marca y, debajo, sus propias métricas.
// Es lo único grande de la pantalla; todo lo demás se le subordina.
//
// Cuatro momentos, que decide `modoIdentidad` (kit-perfil/decision.ts):
//  · completo       nombre + al menos una métrica: subtítulo y «Editar perfil».
//  · por-completar  recién dado de alta, o sin nombre aún: el sujeto se vuelve
//                   la invitación honesta a completarlo, con UNA salida.
//  · cargando       esqueleto con la MISMA forma (nada salta al llegar el dato).
//  · error          «No pudimos cargar tu perfil» con su «Reintentar».
//
// La acción es una pastilla de tinta invertida y sola: el sujeto es lo que
// miras, la acción es lo que tocas. La foto NO es una segunda acción del sujeto
// sino la chapita de su avatar: nunca se obliga a poner la cara.

import { useState, type ReactNode } from 'react';
import { Hero, Abajo, Accion, Apoyo, Arriba, Kicker, TONOS, type TonoClave } from '../../kit-dia/hero';
import { IcoReintentar } from '../../kit-dia/iconos';
import { Esqueleto } from '../../kit-dia/piezas';
import { fuente, velo } from '../../kit-dia/tokens';
import type { LecturaPerfil } from '../../kit-perfil/contrato';
import {
  accionIdentidad,
  apoyoDeIdentidad,
  iniciales,
  modoIdentidad,
  subtituloIdentidad,
  tamNombre,
  tituloIdentidad,
} from '../../kit-perfil/decision';
import { IcoCoach, IcoLapiz, IcoPareja } from '../../kit-perfil/iconos';
import { Avatar } from './avatar';

interface Props {
  l: LecturaPerfil;
  onLog: (linea: string) => void;
}

/** Un botón con la acción visual dentro (el sujeto lleva controles, así que no es un botón entero). */
function BotonAccion({ onClick, children, icono, deshabilitado }: { onClick: () => void; children: ReactNode; icono?: ReactNode; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      disabled={deshabilitado}
      aria-busy={deshabilitado}
      style={{ width: 'auto', alignSelf: 'flex-start' }}
    >
      <Accion icono={icono}>{children}</Accion>
    </button>
  );
}

/** El nombre: display de marca, pesado e inclinado. Un nombre largo baja de tamaño, no gana una tercera línea. */
function Nombre({ tono, children }: { tono: TonoClave; children: string }) {
  return (
    <h1
      style={{
        margin: 0,
        display: 'block',
        ...fuente(800, tamNombre(children), 1.02, true),
        letterSpacing: '-0.025em',
        color: TONOS[tono].tinta,
        textWrap: 'balance',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </h1>
  );
}

/** Una marca de quién eres: tu coach, tu pareja de Dobles. Si el nombre es largo, parte en dos líneas: nunca se corta. */
function Marca({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 32,
        padding: '4px 12px',
        boxSizing: 'border-box',
        maxWidth: '100%',
        borderRadius: 16,
        background: velo('var(--twin-fg)', 9),
        color: 'var(--twin-fg)',
        ...fuente(700, 15, 1.2),
      }}
    >
      {icono}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </span>
  );
}

function Completo({ l, onLog }: Props) {
  const id = l.identidad;
  const titulo = tituloIdentidad(id);
  const subtitulo = subtituloIdentidad(id);
  const texto = subtitulo ?? apoyoDeIdentidad(l);
  const pareja = l.dobles?.tipo === 'con-pareja' ? l.dobles.nombre : null;
  const coach = l.conCoach ? l.coach : null;
  return (
    <Hero tono="acento" etiqueta="Tu perfil">
      <Arriba>
        <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar
            iniciales={iniciales(id.nombre)}
            foto={id.foto}
            onClick={() => onLog(id.foto ? 'Avatar → hoja de la foto: elegir, verla antes y quitarla' : 'Avatar → hoja de la foto: elegir una y verla antes de confirmar')}
          />
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, minWidth: 0, flex: 1 }}>
            <Kicker tono="acento">Tu perfil</Kicker>
            {coach ? <Marca icono={<IcoCoach tam={16} />}>Con {coach}</Marca> : null}
            {pareja ? <Marca icono={<IcoPareja tam={16} />}>Dobles · con {pareja}</Marca> : null}
          </span>
        </span>
        <Nombre tono="acento">{titulo}</Nombre>
        {texto ? <Apoyo tono="acento">{texto}</Apoyo> : null}
      </Arriba>
      <Abajo>
        <BotonAccion
          onClick={() => onLog(`${accionIdentidad(l)} → hoja de edición del perfil`)}
          icono={<IcoLapiz tam={20} />}
        >
          {accionIdentidad(l)}
        </BotonAccion>
      </Abajo>
    </Hero>
  );
}

function Cargando() {
  return (
    <Hero tono="neutro" etiqueta="Cargando tu perfil">
      <Arriba>
        <span style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Esqueleto ancho={88} alto={88} radio={44} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
              <Esqueleto ancho={96} alto={15} radio={5} />
            </span>
            <Esqueleto ancho={112} alto={32} radio={16} />
          </span>
        </span>
        <Esqueleto ancho="72%" alto={44} radio={10} />
        <Esqueleto ancho="94%" alto={17} radio={6} />
        <Esqueleto ancho="58%" alto={17} radio={6} />
      </Arriba>
      <Abajo>
        <Esqueleto ancho={190} alto={52} radio={26} />
      </Abajo>
    </Hero>
  );
}

function ConError({ onLog }: { onLog: Props['onLog'] }) {
  const [reintentando, setReintentando] = useState(false);
  const reintenta = () => {
    if (reintentando) return;
    setReintentando(true);
    onLog('Reintentar → volvería a pedir tu perfil y tus cifras');
    setTimeout(() => setReintentando(false), 1400);
  };
  return (
    <Hero tono="peligro" vivo="alert" etiqueta="No pudimos cargar tu perfil">
      <Arriba>
        <Kicker tono="peligro">Tu perfil</Kicker>
        <Nombre tono="peligro">No pudimos cargar tu perfil</Nombre>
        <Apoyo tono="peligro">Revisa tu conexión e inténtalo de nuevo.</Apoyo>
      </Arriba>
      <Abajo>
        <BotonAccion
          onClick={reintenta}
          deshabilitado={reintentando}
          icono={
            <span className={reintentando ? 'hd-gira' : undefined} style={{ display: 'inline-flex' }}>
              <IcoReintentar tam={20} />
            </span>
          }
        >
          {reintentando ? 'Reintentando' : 'Reintentar'}
        </BotonAccion>
      </Abajo>
    </Hero>
  );
}

export function Identidad({ l, onLog }: Props) {
  switch (modoIdentidad(l)) {
    case 'cargando':
      return <Cargando />;
    case 'error':
      return <ConError onLog={onLog} />;
    default:
      return <Completo l={l} onLog={onLog} />;
  }
}
