// Section registry — maps a section slug to the component that renders its body.
// The single config (components/v2/guia/config) owns the index + ordering; this
// owns the slug→component wiring. Each phase-2 agent owns ONE file in this folder;
// adding/replacing a section means editing that file + (if new) one line here.

import type { ComponentType } from 'react';
import type { GuiaSection } from '../config';

import Section01 from './01-que-es-esta-guia';
import Section02 from './02-tu-cuenta-y-tu-marca';
import Section03 from './03-tu-catalogo-de-ejercicios';
import Section04 from './04-tus-tipos-de-trabajo';
import Section05 from './05-tu-metodologia-y-tus-fases';
import Section06 from './06-como-se-estructura-un-plan';
import Section07 from './07-monta-la-semana';
import Section08 from './08-carga-e-intensidad';
import Section09 from './09-periodizacion-nombrar-fases';
import Section10 from './10-da-de-alta-e-invita';
import Section11 from './11-cuestionario-inicial-y-tests';
import Section12 from './12-asigna-el-plan';
import Section13 from './13-tu-pantalla-hoy';
import Section14 from './14-estado-de-cada-entreno';
import Section15 from './15-habla-con-tu-atleta';
import Section16 from './16-readiness-y-checkin';
import Section17 from './17-adherencia-y-constancia';
import Section18 from './18-carreras-y-objetivos';
import Section19 from './19-progreso-y-rendimiento';
// Tu negocio / Ciclo de vida / Dobles — todo lo que se construyó en producción estos días.
import Section20 from './20-leads-tu-embudo';
import Section21 from './21-la-videollamada';
import Section22 from './22-nurturing-de-leads';
import Section23 from './23-cupo-y-lista-de-espera';
import Section24 from './24-pagos';
import Section25 from './25-metricas-del-funnel';
import Section26 from './26-pausas-y-bajas';
import Section27 from './27-lesiones';
import Section28 from './28-revision-1a1';
import Section29 from './29-entrenar-en-dobles';
import Section30 from './30-importador-de-entrenos';
import Section31 from './31-objetivo-y-prediccion';
// Carrera — el editor de carrera, el cumplimiento por tramo y el modo cinta.
import Section32 from './32-editor-de-carrera';
import Section33 from './33-cumplimiento-por-serie';
import Section34 from './34-correr-en-cinta';
import Section35 from './35-correr-al-aire-libre';
import Section36 from './36-al-acabar-el-entreno';
// Dobles en directo + historial del atleta — la tanda "wow" (dobles en vivo, relevo
// dirigido, cierre juntos + el calendario del atleta).
import Section37 from './37-dobles-en-vivo-y-juntos';
import Section38 from './38-historial-del-atleta';

/** A section body component — receives its own config metadata. */
export type GuiaSectionComponent = ComponentType<{ meta: GuiaSection }>;

export const GUIA_SECTION_REGISTRY: Record<string, GuiaSectionComponent> = {
  'que-es-esta-guia': Section01,
  'tu-cuenta-y-tu-marca': Section02,
  'tu-catalogo-de-ejercicios': Section03,
  'tus-tipos-de-trabajo': Section04,
  'tu-metodologia-y-tus-fases': Section05,
  'como-se-estructura-un-plan': Section06,
  'monta-la-semana': Section07,
  'carga-e-intensidad': Section08,
  'periodizacion-nombrar-fases': Section09,
  'da-de-alta-e-invita': Section10,
  'cuestionario-inicial-y-tests': Section11,
  'asigna-el-plan': Section12,
  'tu-pantalla-hoy': Section13,
  'estado-de-cada-entreno': Section14,
  'habla-con-tu-atleta': Section15,
  'readiness-y-checkin': Section16,
  'adherencia-y-constancia': Section17,
  'carreras-y-objetivos': Section18,
  'progreso-y-rendimiento': Section19,
  'leads-tu-embudo': Section20,
  'la-videollamada': Section21,
  'nurturing-de-leads': Section22,
  'cupo-y-lista-de-espera': Section23,
  'pagos': Section24,
  'metricas-del-funnel': Section25,
  'pausas-y-bajas': Section26,
  'lesiones': Section27,
  'revision-1a1': Section28,
  'entrenar-en-dobles': Section29,
  'importador-de-entrenos': Section30,
  'objetivo-y-prediccion': Section31,
  'editor-de-carrera': Section32,
  'cumplimiento-por-serie': Section33,
  'correr-en-cinta': Section34,
  'correr-al-aire-libre': Section35,
  'al-acabar-el-entreno': Section36,
  'dobles-en-vivo-y-juntos': Section37,
  'historial-del-atleta': Section38,
};
