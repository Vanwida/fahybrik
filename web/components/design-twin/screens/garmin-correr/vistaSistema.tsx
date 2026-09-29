'use client';

// LA TARJETA DE SISTEMA, PINTADA — mira las lecturas del reloj y, cuando el GPS
// o el pulso se pierden o vuelven, tapa la pantalla `SISTEMA_MS` con
// `disponerSistema` (`sistema.ts`). Vive en la capa a pantalla entera de
// `VistaGarmin` (`capa`), junto a las tarjetas del 3-2-1 y del km, y las deja
// pasar: si hay una cuenta atrás, esa manda.
//
// Es estado de PRESENTACIÓN (cuánto lleva la tarjeta a la vista): el aviso
// que vibra ya salió del motor (`sistemaDe`, avisos.ts). Aquí no se decide
// nada del dominio.
//
// Qué NO hacer: leer el GPS de otro sitio que `seq.lecturas`; guardar el
// «último valor bueno» (nada se congela: G1).

import { useEffect, useState } from 'react';
import { PintaDisposicion, Tapa, useGarmin } from '../../kit-garmin';
import type { Secuencia } from '../../kit-reloj/gancho';
import { SISTEMA_MS, avisoDeSistema, disponerSistema, type AvisoDeSistema, type LecturaDeSistema } from './sistema';

interface Visto {
  lectura: LecturaDeSistema;
  huboGps: boolean;
}

const claveDe = (l: LecturaDeSistema) => `${l.gps}|${l.pulso}`;

export function CapaSistema({ seq }: { seq: Secuencia }) {
  const { D } = useGarmin();
  const ahora: LecturaDeSistema = { gps: seq.lecturas.gps, pulso: seq.lecturas.ppm != null };
  const [visto, setVisto] = useState<Visto>({ lectura: ahora, huboGps: ahora.gps === 'listo' });
  const [aviso, setAviso] = useState<{ n: number; tipo: AvisoDeSistema } | null>(null);

  // Un cambio de lectura es un aviso nuevo (estado derivado, sin efecto).
  if (claveDe(ahora) !== claveDe(visto.lectura)) {
    const tipo = avisoDeSistema(visto.lectura, ahora, visto.huboGps);
    setVisto({ lectura: ahora, huboGps: visto.huboGps || ahora.gps === 'listo' });
    if (tipo) setAviso((a) => ({ n: (a?.n ?? 0) + 1, tipo }));
  }

  // La tarjeta se va sola.
  const n = aviso?.n ?? 0;
  useEffect(() => {
    if (n === 0) return;
    const t = setTimeout(() => setAviso((a) => (a?.n === n ? null : a)), SISTEMA_MS);
    return () => clearTimeout(t);
  }, [n]);

  if (!aviso) return null;
  return (
    <>
      <Tapa />
      <PintaDisposicion d={disponerSistema(aviso.tipo, seq.estado.sesionT, D)} />
    </>
  );
}
