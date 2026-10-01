import type { CoachAnalyticsMethod, BaseSesion, FuenteCarga } from '@fahybrid/shared/domain/analytics/metodo';
import { FAMILIA_ETIQUETA_ES, type Familia } from '@fahybrid/shared/domain/analytics/lectura';
import { DESCRIPTORES_METODO_ANALITICO } from './catalogo';
import { CAMPOS_POR_GRUPO, PELDANO_ETIQUETA, type GrupoId } from './descriptores';
import { formatearNumero, grupoDifiereDeDefecto } from './modelo';

/** Los valores se presentan con los mismos descriptores y unidades del editor. */
export function resumenGrupo(group: GrupoId, method: CoachAnalyticsMethod, defaults: CoachAnalyticsMethod): string {
  const values = CAMPOS_POR_GRUPO[group].slice(0, 2).map((key) => {
    const descriptor = DESCRIPTORES_METODO_ANALITICO[key];
    const value = method[key];
    let shown: string;
    if (descriptor.tipo === 'numero') shown = `${formatearNumero((value as number) / (descriptor.escalaDivisor ?? 1), descriptor.decimales)} ${descriptor.unidad}`;
    else if (descriptor.tipo === 'escalera') shown = (value as FuenteCarga[]).map((v) => PELDANO_ETIQUETA[v]).join(' → ');
    else if (descriptor.tipo === 'orden') shown = (value as BaseSesion[]).map((v) => descriptor.etiquetas[v]).join(' → ');
    else if (descriptor.tipo === 'familias') shown = (value as Familia[]).map((v) => FAMILIA_ETIQUETA_ES[v]).join(', ');
    else shown = descriptor.opciones.find((v) => v.value === value)?.label ?? String(value);
    return `${descriptor.etiqueta}: ${shown}`;
  });
  return `${values.join(' · ')} · ${grupoDifiereDeDefecto(group, method, defaults) ? 'Con ajustes propios' : 'Valores de partida'}`;
}
