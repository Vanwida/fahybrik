// El componente de cada artículo, por slug. El índice y el orden viven en
// ../config.ts; cada artículo es un fichero ./<slug>.tsx.

import type { ComponentType } from 'react';
import type { GuiaSection } from '../config';

import S_que_es_esta_guia from './que-es-esta-guia';
import S_tu_cuenta_y_tu_marca from './tu-cuenta-y-tu-marca';
import S_tu_metodologia_y_tus_fases from './tu-metodologia-y-tus-fases';
import S_tu_pantalla_hoy from './tu-pantalla-hoy';
import S_atletas from './atletas';
import S_habla_con_tu_atleta from './habla-con-tu-atleta';
import S_ficha_del_atleta from './ficha-del-atleta';
import S_como_se_estructura_un_plan from './como-se-estructura-un-plan';
import S_monta_un_programa from './monta-un-programa';
import S_biblioteca from './biblioteca';
import S_tu_catalogo_de_ejercicios from './tu-catalogo-de-ejercicios';
import S_carga_e_intensidad from './carga-e-intensidad';
import S_editor_de_carrera from './editor-de-carrera';
import S_importador_de_entrenos from './importador-de-entrenos';
import S_grupos from './grupos';
import S_tests from './tests';
import S_invita_a_tus_atletas from './invita-a-tus-atletas';
import S_altas_pendientes from './altas-pendientes';
import S_asigna_el_plan from './asigna-el-plan';
import S_readiness_y_checkin from './readiness-y-checkin';
import S_adherencia_y_constancia from './adherencia-y-constancia';
import S_progreso_y_rendimiento from './progreso-y-rendimiento';
import S_carreras_y_objetivos from './carreras-y-objetivos';
import S_objetivo_y_prediccion from './objetivo-y-prediccion';
import S_cumplimiento_por_serie from './cumplimiento-por-serie';
import S_zonas_de_pulso from './zonas-de-pulso';
import S_pausas_y_bajas from './pausas-y-bajas';
import S_lesiones from './lesiones';
import S_revision_1a1 from './revision-1a1';
import S_entrenar_en_dobles from './entrenar-en-dobles';
import S_dobles_en_vivo_y_juntos from './dobles-en-vivo-y-juntos';
import S_leads from './leads';
import S_la_videollamada from './la-videollamada';
import S_nurturing_de_leads from './nurturing-de-leads';
import S_cupo_y_lista_de_espera from './cupo-y-lista-de-espera';
import S_cobros from './cobros';
import S_embudo from './embudo';
import S_correr_en_cinta from './correr-en-cinta';
import S_correr_al_aire_libre from './correr-al-aire-libre';
import S_remo_y_ergometros from './remo-y-ergometros';
import S_al_acabar_el_entreno from './al-acabar-el-entreno';
import S_historial_del_atleta from './historial-del-atleta';
import S_el_conector_con_tu_asistente from './el-conector-con-tu-asistente';

/** Un artículo: recibe sus propios metadatos del índice. */
export type GuiaSectionComponent = ComponentType<{ meta: GuiaSection }>;

export const GUIA_SECTION_REGISTRY: Record<string, GuiaSectionComponent> = {
  'que-es-esta-guia': S_que_es_esta_guia,
  'tu-cuenta-y-tu-marca': S_tu_cuenta_y_tu_marca,
  'tu-metodologia-y-tus-fases': S_tu_metodologia_y_tus_fases,
  'tu-pantalla-hoy': S_tu_pantalla_hoy,
  'atletas': S_atletas,
  'habla-con-tu-atleta': S_habla_con_tu_atleta,
  'ficha-del-atleta': S_ficha_del_atleta,
  'como-se-estructura-un-plan': S_como_se_estructura_un_plan,
  'monta-un-programa': S_monta_un_programa,
  'biblioteca': S_biblioteca,
  'tu-catalogo-de-ejercicios': S_tu_catalogo_de_ejercicios,
  'carga-e-intensidad': S_carga_e_intensidad,
  'editor-de-carrera': S_editor_de_carrera,
  'importador-de-entrenos': S_importador_de_entrenos,
  'grupos': S_grupos,
  'tests': S_tests,
  'invita-a-tus-atletas': S_invita_a_tus_atletas,
  'altas-pendientes': S_altas_pendientes,
  'asigna-el-plan': S_asigna_el_plan,
  'readiness-y-checkin': S_readiness_y_checkin,
  'adherencia-y-constancia': S_adherencia_y_constancia,
  'progreso-y-rendimiento': S_progreso_y_rendimiento,
  'carreras-y-objetivos': S_carreras_y_objetivos,
  'objetivo-y-prediccion': S_objetivo_y_prediccion,
  'cumplimiento-por-serie': S_cumplimiento_por_serie,
  'zonas-de-pulso': S_zonas_de_pulso,
  'pausas-y-bajas': S_pausas_y_bajas,
  'lesiones': S_lesiones,
  'revision-1a1': S_revision_1a1,
  'entrenar-en-dobles': S_entrenar_en_dobles,
  'dobles-en-vivo-y-juntos': S_dobles_en_vivo_y_juntos,
  'leads': S_leads,
  'la-videollamada': S_la_videollamada,
  'nurturing-de-leads': S_nurturing_de_leads,
  'cupo-y-lista-de-espera': S_cupo_y_lista_de_espera,
  'cobros': S_cobros,
  'embudo': S_embudo,
  'correr-en-cinta': S_correr_en_cinta,
  'correr-al-aire-libre': S_correr_al_aire_libre,
  'remo-y-ergometros': S_remo_y_ergometros,
  'al-acabar-el-entreno': S_al_acabar_el_entreno,
  'historial-del-atleta': S_historial_del_atleta,
  'el-conector-con-tu-asistente': S_el_conector_con_tu_asistente,
};
