'use client';

// (b) TE TOCA A TI — el sujeto son los metros que te quedan de TU relevo.
//
// No el total conjunto (ese es el marcador, y vive abajo), no el reloj: los
// metros que faltan para soltar. Es la única cifra que decide lo que haces con
// el siguiente tirón, y baja sola, que es lo que hace que aprietes.
//
// Tu ritmo sí va contra el objetivo del tramo, porque aquí el objetivo es tuyo
// de verdad. Y si el monitor todavía no da ritmo (los primeros tirones), no se
// inventa uno: se dice que aún no lo hay (§7).

import { CTA, Label, Mono, Pantalla, RAD, SP } from '../../kit';
import { TopStrip } from '../entreno-vivo/piezas';
import { reloj } from '../../datos-reales';
import { useElapsed, useTimeline } from '../../sim';
import { BarraPareja, FranjaPareja, PulsoTuyo, Sujeto, UnidadRitmo, type EstadoPareja } from './atoms';
import {
  TRAMO,
  contraObjetivo,
  estimaSalidaS,
  metrosEn,
  metrosTexto,
  relojTramoS,
  ritmoCifras,
  ritmoS500,
  pulsoRemando,
  velocidad,
  type EscenaLegProps,
  type Segmento,
} from './data';

/**
 * Metros de TU relevo que hacen falta para que el monitor dé un ritmo con el
 * que se pueda contar (dos tirones largos).
 *
 * Se mide en metros y no en segundos desde que se abrió la pantalla a
 * propósito: lo que da o no da ritmo es la máquina, no el móvil. Si vuelves a
 * esta vista a mitad del relevo, el ritmo está ahí — que es lo que pasa de
 * verdad, porque el monitor lleva contando desde antes.
 */
const METROS_PARA_RITMO = 18;

export function EscenaRemas({ hechos, actual, desdeM, onRelevo, onLog }: EscenaLegProps) {
  const t = useElapsed();
  const metros = Math.min(actual.hastaM, metrosEn(desdeM, actual.quien, t));
  const restanteM = Math.max(0, actual.hastaM - metros);
  const hechoM = metros - actual.desdeM;
  const largoM = actual.hastaM - actual.desdeM;

  useTimeline([
    {
      at: Math.max(0, estimaSalidaS(actual.hastaM - desdeM, actual.quien) * 1000),
      run: () => onRelevo(actual.hastaM),
    },
  ]);

  const s500 = ritmoS500(actual.quien);
  const hayRitmo = hechoM >= METROS_PARA_RITMO;
  const delta = contraObjetivo(s500);

  return (
    <Pantalla
      accion={
        <CTA
          title="RELEVO ▸"
          height={96}
          onClick={() => {
            onLog(`Relevo a mano: sales con ${metrosTexto(metros)} m de tramo`);
            onRelevo(metros);
          }}
        />
      }
    >
      <TopStrip
        faseLabel={null}
        segmentoTitulo={`${TRAMO.titulo} · dobles`}
        indice={hechos.length + 1}
        total={TRAMO.totalM / TRAMO.relevoM}
      />

      <Sujeto
        quien="tu"
        label="Te quedan"
        valor={metrosTexto(restanteM)}
        unidad="m"
        resaltado
        nota={
          <span>
            llevas {metrosTexto(hechoM)} de tus {metrosTexto(largoM)} m
          </span>
        }
      />

      <BloqueRitmo cifras={hayRitmo ? ritmoCifras(s500) : null} delta={hayRitmo ? delta : null} />

      <FranjaPareja estado={descansoDe(hechos)} />

      <PulsoTuyo ppm={pulsoRemando(hechoM / largoM)} />

      <BarraPareja
        hechos={hechos}
        actual={actual}
        metros={metros}
        reloj={reloj(relojTramoS(hechos, actual, metros))}
      />
    </Pantalla>
  );
}

/**
 * Lo que se enseña de tu pareja mientras descansa: su ÚLTIMO relevo real, no el
 * que le tocaba. Si os habéis cambiado antes de los 250, aquí salen los metros
 * que de verdad hizo — y si aún no ha remado nada, no sale nada (§7).
 */
function descansoDe(hechos: Segmento[]): EstadoPareja {
  const suyo = [...hechos].reverse().find((s) => s.quien === 'pareja');
  if (!suyo) return { modo: 'descansa' };
  const metros = suyo.hastaM - suyo.desdeM;
  return {
    modo: 'descansa',
    ultimo: { metros, tiempo: reloj(metros / velocidad('pareja')) },
  };
}

/**
 * Tu ritmo contra el objetivo del tramo. `cifras` a null = el monitor todavía
 * no da un ritmo del que fiarse: se dice, no se rellena con un cero ni con un
 * hueco que parezca un dato.
 */
function BloqueRitmo({
  cifras,
  delta,
}: {
  cifras: string | null;
  delta: { texto: string; color: string } | null;
}) {
  // Dos filas y no una: el ritmo, su unidad, el objetivo y la diferencia no
  // caben en los 378 pt de ancho útil sin apretarse (medido en el lienzo del
  // doble). Arriba lo que decide el tirón siguiente; debajo, contra qué.
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: `9px ${SP.m}px 10px`,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s, minHeight: 26 }}>
        <Label size={9}>Tu ritmo</Label>
        <span style={{ flex: 1 }} />
        {cifras ? (
          <>
            <Mono size={24} weight={800}>
              {cifras}
            </Mono>
            <UnidadRitmo />
          </>
        ) : (
          <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            el monitor aún no da ritmo
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          objetivo
        </span>
        <Mono size={12} weight={700} color="var(--twin-muted)">
          {ritmoCifras(TRAMO.objetivoS500)}
        </Mono>
        <span style={{ flex: 1 }} />
        {delta && (
          <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: delta.color }}>
            {delta.texto}
          </span>
        )}
      </div>
    </div>
  );
}
