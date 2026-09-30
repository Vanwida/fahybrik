// LA SESIÓN TAL COMO LLEGA AL RELOJ — el plan: pasos planos, zonas del atleta,
// reglas de aviso y el método del coach. El contrato lo produce el servidor y lo
// consume el motor de la muñeca (`kit-reloj/secuencia.ts` lo re-exporta).

import type { Vocabulario, MetodoReloj } from './metodo';
import type { BandasRitmo, PasoBase, ReglasAviso, ZonasCoach } from './paso';

export interface PlanSesion {
  /** Los pasos en orden, planos. El anidado vive en la `posicion` de cada uno (M4). */
  pasos: PasoBase[];
  zonas: ZonasCoach | null;
  reglas: ReglasAviso;
  /** Nombres de clase y de formato, palabras del RPE del coach. Sin él, los defectos (`vocabularioDe`). */
  vocabulario?: Vocabulario;
  /** El método del resumen y el rango de la corona del coach. Sin él, los defectos (`metodoDe`). */
  metodo?: MetodoReloj;
  /** Zonas de ritmo del atleta por modalidad (km, 500 m), con su procedencia. Sin ellas, solo las de pulso. */
  bandasRitmo?: BandasRitmo[];
  /** El nombre de pila de la pareja en dobles: uno por sesión, no por paso. Sin él, «tu pareja». */
  pareja?: string;
}

