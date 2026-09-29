'use client';

// LAS CARAS BASE, PINTADAS — cada una es su disposición (`caras.ts`,
// `paginas.ts`) sobre el reloj del contexto. Son las que una familia recibe
// por defecto y cambia si quiere (`VistaGarmin`: `cara`, `paginas`, `capa`):
//
//   CaraPaso · CaraRecupera · CaraDescanso · CaraCuenta · CaraKm
//   CaraPausa · CaraCompletada · CaraDescartada · FranjaDeshacer · CaraMenu
//   PaginaDatos · PaginaVueltas · PaginaEstructura
//   caraPorDefecto(seq) · capaPorDefecto(seq)   lo que el kit pinta si nadie dice otra cosa
//   CaraDelVivo                                 cara + capa + aro, sin estado propio
//                                               (la comparación de tamaños)
//
// Qué NO hacer: calcular aquí qué va en cada fila; pintar el héroe de otra
// cosa que lo que dice `laminaDelPaso`.

import type { ReactNode } from 'react';
import type { Completitud } from '../kit-reloj/despues';
import { estructuraDe } from '../kit-reloj/estructura';
import { esCarrera } from '../kit-reloj/reglas';
import { wodDe } from '../kit-reloj/tarea';
import type { Secuencia } from '../kit-reloj/gancho';
import { filasDeDatos, filasDeVueltas } from '../kit-reloj/listas';
import type { FilaEstructura, Lecturas, Paso, PasoBase, ReglasAviso, ZonasCoach } from '../kit-reloj/paso';
import { DESHACER_MS } from '../kit-reloj/tokens';
import { sesionDe, vueltasDe } from '../kit-reloj/vivo';
import { AroGarmin } from './aro';
import {
  CAJA_DESHACER,
  disponerCompletada,
  disponerCuenta,
  disponerDescanso,
  disponerDeshacer,
  disponerKm,
  disponerPasoDe,
  disponerPausa,
  disponerRecupera,
} from './caras';
import { PISTA } from './geometria';
import { ListaEstructura, filasDeEstructura } from './lista';
import { disponerDatos, disponerDescartada, disponerMenu, disponerVueltas, VUELTAS_VISIBLES, type OpcionMenu } from './paginas';
import { PintaDisposicion, Tapa, useGarmin } from './pintar';
import { CG } from './tokens';

export function CaraPaso({ paso, lecturas, zonas, reglas }: { paso: PasoBase; lecturas: Lecturas; zonas: ZonasCoach | null; reglas?: ReglasAviso }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerPasoDe(paso, lecturas, zonas, D, reglas).disposicion} />;
}

export function CaraRecupera({ paso, lecturas, zonas }: { paso: Paso; lecturas: Lecturas; zonas: ZonasCoach | null }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerRecupera(paso, lecturas, zonas, D)} />;
}

export function CaraDescanso({ paso, lecturas, viene }: { paso: Paso; lecturas: Lecturas; viene?: string | null }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={disponerDescanso(paso, lecturas, D, viene)} />;
}

/** 3-2-1 (n > 0) o GO (n = 0), a pantalla entera. */
export function CaraCuenta({ n, paso }: { n: number; paso: PasoBase }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerCuenta(n, paso, D)} />
    </>
  );
}

export function CaraKm({ banner }: { banner: { titulo: string; valor: string; pie: string } }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerKm(banner, D)} />
    </>
  );
}

export function CaraPausa({ sesionT, paso }: { sesionT: number; paso: PasoBase }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerPausa(sesionT, paso, D)} />
    </>
  );
}

export function CaraCompletada({ natural, t, completitud, metros }: { natural: boolean; t: number; completitud: Completitud; metros: number | null }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerCompletada(natural, t, completitud, metros, D)} />
    </>
  );
}

export function CaraDescartada() {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerDescartada(D)} />
    </>
  );
}

/**
 * EL DESHACER, en la franja del pie: tapa lo que hubiera (lo que falta, el
 * pulso) y NUNCA el héroe; una barra que se vacía en 5 s, qué se cerró y
 * «↶ UP · deshacer» en naranja. `n` remonta la barra en cada cierre.
 */
export function FranjaDeshacer({ aviso, n }: { aviso: string; n: number }) {
  const { D, pinta } = useGarmin();
  const d = disponerDeshacer(aviso, D);
  const barra = d.lineas[0]!;
  return (
    <div key={n}>
      <Tapa y={CAJA_DESHACER.y * D} />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: CAJA_DESHACER.y * D,
          height: Math.max(1, Math.round(PISTA.drena * D)),
          left: (D - barra.anchoUtil) / 2,
          width: barra.anchoUtil,
          background: pinta(CG.tinta2),
          transformOrigin: 'left',
          animation: `garmin-drena ${DESHACER_MS}ms linear forwards`,
        }}
      />
      <PintaDisposicion d={d} />
    </div>
  );
}

/** Un menú (Controles, confirmar, entorno). Fuera del vivo, en un reloj táctil, tocar una opción la elige. */
export function CaraMenu({ titulo, opciones, foco, onTocar }: { titulo: string[]; opciones: OpcionMenu[]; foco: number; onTocar?: (k: number) => void }) {
  const { D } = useGarmin();
  return (
    <>
      <Tapa />
      <PintaDisposicion
        d={disponerMenu(titulo, opciones, foco, D)}
        alTocar={
          onTocar
            ? (rol: string) => {
                const k = opciones.findIndex((o) => `opcion:${o.id}` === rol);
                if (k >= 0) onTocar(k);
              }
            : undefined
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Las páginas (UP/DOWN): Datos, Vueltas, Estructura
// ---------------------------------------------------------------------------

export function PaginaDatos({ seq }: { seq: Secuencia }) {
  const { D } = useGarmin();
  // filasDeDatos da [total, distancia, ritmo medio, pulso]: sin GPS ni cinta en toda la sesión (un WOD de fuerza) no se pintan «— km» ni «— /km medio».
  const conDistancia = seq.plan.pasos.some(seCorreDeVerdad);
  const filas = filasDeDatos(sesionDe(seq.estado), seq.lecturas, seq.paso.entorno === 'cinta' ? 'cinta' : undefined).filter((_, k) => conDistancia || (k !== 1 && k !== 2));
  return <PintaDisposicion d={disponerDatos(filas, seq.plan.zonas, D)} />;
}

/** ¿Un AMRAP (o su campana)? Sus «vueltas» son las rondas. */
export const esAmrap = (paso: Paso): boolean => {
  const f = wodDe(paso)?.formato;
  return f === 'amrap' || f === 'puntuacion';
};

/** ¿Se corre de verdad en este paso (GPS o cinta)? Un paso de WOD solo si su tarea es correr; el 5K For Time, sí. */
export function seCorreDeVerdad(p: PasoBase): boolean {
  const w = wodDe(p);
  if (!w) return esCarrera(p);
  if (w.formato === 'emom') return !!w.tarea.corre;
  return w.formato === 'fortime' && !w.tarea;
}

export function PaginaVueltas({ seq }: { seq: Secuencia }) {
  const { D } = useGarmin();
  const { objetivo, enCurso } = vueltasDe(seq);
  const { titulo, filas } = filasDeVueltas(seq.estado.vueltas, objetivo, enCurso ? VUELTAS_VISIBLES - 1 : VUELTAS_VISIBLES);
  // En un AMRAP las vueltas son las rondas, y se llaman así.
  return <PintaDisposicion d={disponerVueltas(esAmrap(seq.paso) ? ['Rondas'] : titulo, filas, enCurso, D)} />;
}

export function PaginaEstructura({ seq, estructura }: { seq: Secuencia; estructura?: (i: number) => FilaEstructura[] }) {
  return <ListaEstructura filas={filasDeEstructura((estructura ?? estructuraDe(seq.plan.pasos))(seq.estado.i))} />;
}

// ---------------------------------------------------------------------------
// Lo de por defecto
// ---------------------------------------------------------------------------

/** La cara de un paso si la familia no pone la suya: recupera, descanso o el paso (todo lo que se corre, P10). */
export function caraPorDefecto(seq: Secuencia, paso: Paso = seq.paso): ReactNode {
  const { lecturas, plan } = seq;
  if (paso.rol === 'recuperacion') return <CaraRecupera paso={paso} lecturas={lecturas} zonas={plan.zonas} />;
  if (paso.rol === 'descanso') return <CaraDescanso paso={paso} lecturas={lecturas} />;
  return <CaraPaso paso={paso} lecturas={lecturas} zonas={plan.zonas} reglas={plan.reglas} />;
}

/** La capa a pantalla entera: el 3-2-1 antes de un paso de trabajo, el GO, el km recién hecho. */
export function capaPorDefecto(seq: Secuencia): ReactNode | null {
  const { paso, estado } = seq;
  if (seq.cuenta != null && paso.siguiente) return <CaraCuenta n={seq.cuenta} paso={paso.siguiente} />;
  if (seq.go) return <CaraCuenta n={0} paso={paso} />;
  if (estado.banner) return <CaraKm banner={estado.banner} />;
  return null;
}

/** El vivo sin estado propio (sin páginas, menús ni deshacer): la cara, la capa y el aro. */
export function CaraDelVivo({ seq, destello }: { seq: Secuencia; destello?: number | null }) {
  return (
    <>
      {caraPorDefecto(seq)}
      {capaPorDefecto(seq)}
      <AroGarmin pasos={seq.plan.pasos} i={seq.estado.i} paso={seq.paso} lecturas={seq.lecturas} destello={destello} />
    </>
  );
}
