'use client';

// El detalle del ejercicio — la capa que se pone encima al tocar una miniatura.
//
// Cubre la ficha pero NO la acción: «Empezar» sigue abajo y visible, porque
// entrar a ver cómo se hace una sentadilla no es salirse del entreno (§6,
// regla 3).
//
// El hueco del Detalle se gana con lo que da sentido al dato (§6.2): el gesto,
// las claves del coach y tu última vez. Cuando no hay medida se dice; cuando
// solo hay una, se dice también, porque con una sola no existe récord y
// fabricar uno sería justo lo que prohíbe el §7.

import { useEffect, useState } from 'react';
import { COLOR_MODALIDAD, reloj, type ItemReal } from '../../datos-reales';
import { haceCuanto } from '../../kit-composicion/formato';
import { Card, IconChevron, Label, RoundButton, SP } from '../../kit';
import { fichaDe, ultimaVezDe, type UltimaVez } from './data';
import { Claves, LineaDosis, PuntoModalidad } from './atoms';
import { FrameVideo } from './siluetas';

export function DetalleEjercicio({ item, onVolver }: { item: ItemReal; onVolver: () => void }) {
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDentro(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const ficha = fichaDe(item.nombre);
  const ultima = ultimaVezDe(item.nombre);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--twin-bg)',
        display: 'flex',
        flexDirection: 'column',
        opacity: dentro ? 1 : 0,
        transform: dentro ? 'none' : 'translateY(18px)',
        transition: 'opacity 240ms ease-out, transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        zIndex: 3,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SP.m,
          padding: `${SP.m}px ${SP.l}px`,
          flex: '0 0 auto',
        }}
      >
        <RoundButton onClick={onVolver} label="Volver a la sesión">
          <span style={{ color: 'var(--twin-fg)', display: 'inline-flex' }}>
            <IconChevron dir="left" size={13} />
          </span>
        </RoundButton>
        <PuntoModalidad item={item} size={7} />
        <span
          style={{
            font: '600 15px/1.2 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.nombre}
        </span>
      </div>

      <div
        className="twin-scroll"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.xl,
          padding: `0 ${SP.l}px ${SP.xl}px`,
        }}
      >
        <FrameVideo
          pose={ficha.pose}
          videoS={ficha.videoS}
          tinte={COLOR_MODALIDAD[item.modalidad]}
          grande
          style={{ boxShadow: 'var(--twin-shadow-card)' }}
        />

        <Hoy item={item} />
        <Claves claves={ficha.claves} />
        {ultima ? <Ultima ultima={ultima} /> : <SinMedida />}
      </div>
    </div>
  );
}

/** Lo que te toca HOY de este ejercicio, con la misma grafía que la ficha. */
function Hoy({ item }: { item: ItemReal }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <Label size={10}>Hoy te toca</Label>
      <LineaDosis item={item} grande />
    </div>
  );
}

function Ultima({ ultima }: { ultima: UltimaVez }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SP.s }}>
        <Label size={10}>Tu última vez</Label>
        <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {haceCuanto(ultima.haceDias)}
        </span>
      </div>
      <Card padding={SP.l}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.l }}>
          <span
            style={{
              font: '700 24px/1.1 var(--twin-font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--twin-fg)',
            }}
          >
            {ultima.resumen}
          </span>
          <div style={{ display: 'flex', gap: SP.xl }}>
            <Celda etiqueta="Duración" valor={reloj(ultima.duracionS)} />
            {ultima.fcMediaPpm !== null && <Celda etiqueta="FC media" valor={`${ultima.fcMediaPpm} ppm`} />}
          </div>
        </div>
      </Card>
      {ultima.medidas === 1 && (
        <p style={{ margin: 0, font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          Es la única vez que te hemos medido aquí, así que todavía no hay récord que batir.
        </p>
      )}
    </div>
  );
}

function Celda({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label size={9} color="var(--twin-faint)">
        {etiqueta}
      </Label>
      <span
        style={{
          font: '700 17px/1 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * Sin medida no se pinta un guion ni una barra a cero: se dice qué falta y qué
 * lo llena. La salida existe y es hacer la sesión, así que el hueco se declara
 * (§6.2 bis) en vez de callarse.
 */
function SinMedida() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <Label size={10}>Tu última vez</Label>
      <Card padding={SP.l}>
        <p style={{ margin: 0, font: '400 14px/1.45 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Todavía no te hemos medido aquí. En cuanto lo hagas hoy, se queda guardado y la próxima vez lo tienes
          en esta pantalla.
        </p>
      </Card>
    </div>
  );
}
