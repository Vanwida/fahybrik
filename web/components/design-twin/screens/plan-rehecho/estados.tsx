'use client';

// LOS ESTADOS SIN DÍA QUE MOSTRAR — cada uno con SU motivo dicho y su salida
// (CONTRATO-UI §5: un vacío siempre lleva salida, o una frase que declare por qué
// no la hay). La acción de cada uno vive en la acción anclada de abajo, no aquí:
// la misma puerta, en el mismo sitio, en todos los estados.
//
//   · cargando  → esqueleto con la forma de la card (no un vacío: aún no sabemos)
//   · error     → sin semana y sin caché; «Reintentar»
//   · pausa     → el coach paró el plan: ni error ni vacío; el progreso está guardado
//   · sin plan  → EMPIEZA DESPUÉS (con la fecha exacta) o SE ESTÁ PREPARANDO; ninguno
//                 afirma qué hará el coach ni cuándo (DECISIONS 7-ago)
//   · semana que viene: falla o llegó vacía

import { IcoPausa } from '../../kit-dia/iconos';
import { Esqueleto, Pastilla } from '../../kit-dia/piezas';
import { RADIO } from '../../kit-dia/tokens';
import type { LecturaPlan } from '../../kit-plan/contrato';
import { faltanParaEmpezar, tamanoDeTitulo, type TonoPlan, type Vista } from '../../kit-plan/modelo';
import { TEXTOS } from '../../kit-plan/textos';
import { Abajo, ApoyoPlan, Arriba, KickerPlan, ShellSujeto, TituloPlan } from './shell';

function Bloque({
  tono,
  kicker,
  titulo,
  apoyo,
  nota,
  aparte,
  vivo,
}: {
  tono: TonoPlan;
  kicker: string;
  titulo: string;
  apoyo: string;
  nota?: string;
  aparte?: React.ReactNode;
  vivo?: 'alert' | 'status';
}) {
  return (
    <ShellSujeto tono={tono} etiqueta={titulo} vivo={vivo} crece={false}>
      <Arriba>
        <KickerPlan tono={tono} aparte={aparte}>
          {kicker}
        </KickerPlan>
        <TituloPlan tono={tono} px={tamanoDeTitulo(titulo)}>
          {titulo}
        </TituloPlan>
        <ApoyoPlan tono={tono}>{apoyo}</ApoyoPlan>
      </Arriba>
      <Abajo>{nota ? <ApoyoPlan tono={tono}>{nota}</ApoyoPlan> : null}</Abajo>
    </ShellSujeto>
  );
}

export function SujetoEstado({ v, l, tono }: { v: Vista; l: LecturaPlan; tono: TonoPlan }) {
  switch (v.tipo) {
    case 'error':
      return <Bloque tono={tono} vivo="alert" {...TEXTOS.error} />;
    case 'pausa':
      return (
        <Bloque
          tono={tono}
          kicker={TEXTOS.pausa.kicker}
          titulo={TEXTOS.pausa.titulo}
          apoyo={TEXTOS.pausa.apoyo(l.coach)}
          nota={TEXTOS.pausa.nota(v.desde)}
          aparte={<IcoPausa tam={30} />}
        />
      );
    case 'sin-plan':
      return v.motivo === 'empieza-despues' && v.inicio ? (
        <Bloque
          tono={tono}
          kicker={TEXTOS.empiezaDespues.kicker}
          titulo={TEXTOS.empiezaDespues.titulo(v.inicio)}
          apoyo={TEXTOS.empiezaDespues.apoyo}
          // Sin semana que ver, la frase dice por qué no hay salida.
          nota={l.actual?.hayMasAdelante ? undefined : TEXTOS.empiezaDespues.nota}
          aparte={
            faltanParaEmpezar(l.hoyIso, v.inicio) ? (
              <Pastilla fondo="var(--twin-fg)" tinta="var(--twin-bg)">
                {faltanParaEmpezar(l.hoyIso, v.inicio)}
              </Pastilla>
            ) : undefined
          }
        />
      ) : (
        <Bloque tono={tono} kicker={TEXTOS.preparando.kicker} titulo={TEXTOS.preparando.titulo} apoyo={TEXTOS.preparando.apoyo(l.coach)} />
      );
    case 'semana':
      switch (v.cuerpo.tipo) {
        case 'semana-falla':
          return <Bloque tono={tono} vivo="alert" {...TEXTOS.semanaFalla} />;
        case 'semana-vacia':
          return <Bloque tono={tono} {...TEXTOS.semanaVacia} />;
        default:
          return null;
      }
    default:
      return null;
  }
}

/** La card en frío: la MISMA silueta que la de un día con sesión (fecha, título de dos líneas, pastillas, tres partes). */
export function SujetoEsqueleto() {
  return (
    <ShellSujeto tono="neutro" etiqueta="Cargando tu plan">
      <Arriba>
        <span style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={150} alto={15} radio={5} />
        </span>
        <Esqueleto ancho="78%" alto={44} radio={10} />
        <Esqueleto ancho="52%" alto={44} radio={10} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Esqueleto ancho={96} alto={32} radio={RADIO.pastilla} />
          <Esqueleto ancho={120} alto={32} radio={RADIO.pastilla} />
        </div>
      </Arriba>
      <Abajo>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 12, borderTop: '1px solid var(--twin-hairline-strong)' }}>
            <Esqueleto ancho={i === 1 ? '44%' : '60%'} alto={17} radio={5} />
            {i === 1 ? <Esqueleto ancho="36%" alto={15} radio={5} /> : null}
          </div>
        ))}
      </Abajo>
    </ShellSujeto>
  );
}
