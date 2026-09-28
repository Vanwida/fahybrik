'use client';

// FUERA DE LA APP (I11) — la Live Activity en la pantalla de bloqueo y la
// Isla Dinámica, con el héroe, la posición y la acción primaria (interactiva,
// iOS 17+), como Apple Fitness y Strava. Consumen la MISMA lámina que el vivo:
// si cambia el héroe, cambia aquí.
//
// Lo que se pinta de iOS (la hora, la fecha, la isla) es el cromo del sistema
// y va en el gris del sistema, no en los tokens de la app.

import type { HeroeVista } from '../kit-reloj/lamina';
import { primariaDe, type PrimariaVista } from './accion';
import { Boton, Etiqueta, Icono, Numeral } from './piezas';
import { CI, RADIO, TI, estiloNumeral } from './tokens';

export interface FueraProps {
  heroe: HeroeVista;
  posicion: string;
  crono: string;
  primaria: PrimariaVista | null;
  /** «▲ rápido», «dentro»: la palabra del veredicto, si hay banda. */
  veredicto?: string | null;
}

/** La tarjeta de la Live Activity: el mismo formato en la pantalla de bloqueo y en la isla expandida. */
function Tarjeta({ heroe, posicion, crono, primaria, veredicto, isla = false }: FueraProps & { isla?: boolean }) {
  const vista = primaria ? primariaDe(primaria.clave) : null;
  return (
    <div
      style={{
        background: isla ? '#000' : 'rgba(20,20,20,0.86)',
        borderRadius: isla ? 44 : 28,
        padding: isla ? '18px 22px 16px' : '16px 18px 16px',
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: isla ? undefined : '0 10px 30px rgba(0,0,0,0.45)',
        backdropFilter: isla ? undefined : 'blur(20px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: CI.accion, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
            <span aria-hidden style={{ fontSize: 12, fontWeight: 900, fontStyle: 'italic', color: CI.sobreAccion }}>F</span>
          </span>
          <span style={{ fontSize: TI.cuerpo.cuerpo, fontWeight: 700, color: CI.tinta, whiteSpace: 'nowrap' }}>{posicion}</span>
        </span>
        <Numeral texto={crono} cuerpo={TI.cuerpo.cuerpo} tono={CI.tinta2} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
          {heroe.etiqueta ? <Etiqueta>{heroe.etiqueta}</Etiqueta> : null}
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <Numeral texto={heroe.texto} cuerpo={44} />
            {heroe.unidad ? <Etiqueta>{heroe.unidad}</Etiqueta> : null}
            {veredicto ? <Etiqueta tono={CI.tinta}>{veredicto}</Etiqueta> : null}
          </span>
        </span>
        {vista && primaria ? (
          <Boton etiqueta={vista.texto} variante={vista.peso === 'primaria' ? 'primaria' : 'superficie'} alto={TI.botonMenor.alto} ancho="auto" onPulsa={primaria.hacer} />
        ) : null}
      </div>
    </div>
  );
}

/** La pantalla de bloqueo: la hora del sistema arriba y la Live Activity abajo del todo, como Apple Fitness. */
export function PantallaBloqueo(p: FueraProps & { hora: string; fecha: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #1b1b1f 0%, #0a0a0b 60%, #000 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `calc(var(--twin-safe-top) + 26px) 16px calc(var(--twin-safe-bottom) + 12px)`, boxSizing: 'border-box' }}>
      <span style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{p.fecha}</span>
      <span style={{ ...estiloNumeral(88, 500), color: '#fff', marginTop: 4, letterSpacing: '-0.01em' }}>{p.hora}</span>
      <div style={{ marginTop: 'auto', width: '100%' }}>
        <Tarjeta {...p} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '18px 22px 0' }}>
        {['linterna', 'cámara'].map((n) => (
          <span key={n} aria-label={n} style={{ width: 50, height: 50, borderRadius: 25, background: 'rgba(255,255,255,0.14)' }} />
        ))}
      </div>
    </div>
  );
}

/** La Isla Dinámica: compacta (héroe a un lado, crono al otro) y expandida (la tarjeta). */
export function IslaDinamica(p: FueraProps & { expandida: boolean }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0b0c', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 11 }}>
      {p.expandida ? (
        <div style={{ width: 'calc(100% - 24px)', animation: 'iphone-entra 200ms ease-out' }}>
          <Tarjeta {...p} isla />
        </div>
      ) : (
        <div style={{ width: 236, height: 37, borderRadius: 20, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', boxSizing: 'border-box' }}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <Numeral texto={p.heroe.texto} cuerpo={17} />
            {p.heroe.unidad ? <span style={{ fontSize: TI.suelo, fontWeight: 600, color: CI.tinta2 }}>{p.heroe.unidad}</span> : null}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icono nombre="pulso" talla={12} tono={CI.accion} />
            <Numeral texto={p.crono} cuerpo={15} tono={CI.tinta2} />
          </span>
        </div>
      )}
      <div style={{ marginTop: 40, padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 22, width: '100%', boxSizing: 'border-box', opacity: 0.5 }}>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} aria-hidden style={{ aspectRatio: '1', borderRadius: RADIO.superficie, background: '#1c1c1f' }} />
        ))}
      </div>
    </div>
  );
}
