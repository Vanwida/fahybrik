'use client';

// TUS CARRERAS — el historial de running dentro de la pastilla Carrera.
//
// DE DÓNDE SALE (docs/analiticas-running-mapa.md, v2, sección HISTORIAL,
// PRIORIDAD 1). Hasta el 13-ago la v1 mandaba el histórico a Plan/Historial:
// Alex lo revocó con la app en la mano — «que pueda ver su histórico… todo el
// running va ahí dentro». Plan/Historial sigue siendo el calendario general de
// TODAS las modalidades; esto es la vista DE RUNNING, con sus agregados y su
// veredicto. Se entra por push desde el hub de Analíticas (nivel 0 → nivel 1),
// y cada fila empuja a la ficha de sesión (nivel 2), que ya existe
// (`lectura-carrera`) y no se reconstruye aquí.
//
// ARQUETIPO LISTA, ESTRATEGIA LLENA (CONTRATO-UI §6.2): el sujeto es «el
// conjunto y su estado de un vistazo» — los kilómetros del periodo y sus
// salidas, arriba, junto con la lista que los sostiene. Sin filas, degrada a
// Vacío y centra (§6.2 «un arquetipo se degrada, no se rompe»).
//
// LA VOZ ES LA DE `analiticas-correr`, estudiada mirándola: cero cajas, cero
// rayas divisorias, aire entre grupos (24 dentro, 48 entre semanas), cifras
// mono, etiquetas en versalita, el naranja reservado a lo interactivo activo
// (el segmentado y los chips, nunca un color de dato). Por eso esta pantalla
// NO usa `GrupoFilas`/`Card` del kit genérico: son cajas con hairline, y la
// familia de Analíticas no las lleva.
//
// LA CABECERA ES LA DE UNA VISTA EMPUJADA: `NavBar` con `atras` (‹ + título
// centrado), nunca la `TabBar` de pastillas — esta pantalla no es raíz de
// pestaña, es un nivel más adentro (mismo patrón que `ranking-box` y
// `tests-calibracion`, que ya usan el `NavBar` compartido del kit con `atras`).

import { useEffect, useState } from 'react';
import { EstadoCentrado } from '../../kit-composicion/estados';
import { NavBar, Pantalla } from '../../kit-composicion/chrome';
import { S } from '../../kit-composicion/tokens';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CONFIG_ESCENARIO, DATASETS, HOY } from './datos';
import {
  OPCIONES_PERIODO,
  PERIODO_LABEL,
  TIPO_LABEL,
  TIPO_LABEL_FILTRO,
  agregadoDe,
  agruparPorSemana,
  dentroDelPeriodo,
  diaCorto,
  type Periodo,
  type TipoRun,
} from './modelo';
import { Agregados, CabeceraSemana, FilaCarrera, FiltroTipo, SegmentadoPeriodo, SinCoincidencias } from './piezas';

export const meta: TwinMeta = {
  id: 'correr-historial',
  titulo: 'Tus carreras — el historial de running',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-08-13',
  descripcion:
    'El histórico de running dentro de la pastilla Carrera: los kilómetros del periodo arriba, el filtro por tipo plegado, y las salidas agrupadas por semana con su subtotal — como Garmin, con el veredicto de tu coach cuando la sesión venía prescrita.',
  fuentes: [],
  enApp:
    'No existe: hoy el historial general vive en Plan/Historial y la pastilla Carrera no tiene ninguna lista de sesiones navegable. Los datos ya están (ejecuciones, tramos, récords, veredictos).',
  dispositivo: 'iphone',
  soportaHorizontal: false,
  // Sin `composicion`: propuesta pura, no hay vista «hoy» que alternar (hoy no
  // existe nada parecido). Arquetipo lista, estrategia llena.
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'mes-lleno',
    titulo: '① El mes lleno',
    descripcion:
      '4 semanas, 14 salidas, los siete tipos representados: una serie bate un récord, dos vienen del reloj sin veredicto (una tirada larga, una cinta) y un tempo sale con el punto ámbar.',
  },
  {
    id: 'filtrado',
    titulo: '② Filtrado a Series',
    descripcion:
      'El mismo mes, con el filtro desplegado y «Series» activo: solo dos filas, y el agregado de arriba (2 salidas, 19,5 km) se recalcula sobre ESE filtro, no sobre el mes entero.',
  },
  {
    id: 'nuevo',
    titulo: '③ Tres semanas · escaso',
    descripcion: 'El recién llegado: 2 semanas, 3 salidas, todas rodaje suave. El caso mínimo del §6.3.',
  },
  {
    id: 'vacio',
    titulo: '④ Cero carreras',
    descripcion: 'Sin una sola salida: la Lista degrada a Vacío y centra, con la salida declarada — sin inventar un CTA de tests.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const config = CONFIG_ESCENARIO[escenario] ?? CONFIG_ESCENARIO['mes-lleno']!;
  const dataset = DATASETS[config.datasetId] ?? DATASETS['mes-lleno']!;

  const [periodo, setPeriodo] = useState<Periodo>(config.periodoInicial);
  const [tipoFiltro, setTipoFiltro] = useState<TipoRun | 'todos'>(config.tipoInicial);
  const [filtroAbierto, setFiltroAbierto] = useState(config.filtroAbiertoInicial);

  const enPeriodo = dataset.filter((f) => dentroDelPeriodo(f.fecha, periodo, HOY));
  const filtradas = tipoFiltro === 'todos' ? enPeriodo : enPeriodo.filter((f) => f.tipo === tipoFiltro);
  const agregado = agregadoDe(filtradas);
  const grupos = agruparPorSemana(filtradas);

  useEffect(() => {
    onLog(
      `${dataset.length} carreras en total · ${filtradas.length} visibles en «${PERIODO_LABEL[periodo]}»${
        tipoFiltro !== 'todos' ? ` · ${TIPO_LABEL_FILTRO[tipoFiltro]}` : ''
      }`,
    );
    // Solo al montar: cada interacción del atleta ya se registra en su propio
    // manejador, y el remount por `key` al cambiar de escenario reinicia esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sin una sola carrera en TODA la base — no solo con el filtro actual — el
  // arquetipo Lista degrada a Vacío entero (§6.2): fuera agregados y filtro,
  // no hay nada que repartir ni que filtrar.
  if (dataset.length === 0) {
    return (
      <div className="twin-screen-safe">
        <Pantalla estrategia="centra" cabecera={<NavBar titulo="Tus carreras" atras />}>
          <EstadoCentrado
            titulo="Aún no hay carreras"
            cuerpo="En cuanto corras tu primera salida —o la traiga tu reloj— aparece aquí, con sus kilómetros y su ritmo."
            salida={{
              tipo: 'depende',
              quien: 'Tu próxima carrera',
              cuando: 'aparece sola en cuanto la registres.',
            }}
          />
        </Pantalla>
      </div>
    );
  }

  return (
    <div className="twin-screen-safe">
      <Pantalla estrategia="llena" cabecera={<NavBar titulo="Tus carreras" atras />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxxl, padding: `${S.m}px ${S.l}px ${S.xxl}px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S.l }}>
            <SegmentadoPeriodo
              opciones={OPCIONES_PERIODO}
              activo={periodo}
              onChange={(p) => {
                setPeriodo(p);
                onLog(`Periodo → ${PERIODO_LABEL[p]}`);
              }}
            />
            <Agregados agregado={agregado} />
          </div>

          <FiltroTipo
            abierto={filtroAbierto}
            activo={tipoFiltro}
            onToggle={() => setFiltroAbierto((v) => !v)}
            onSeleccionar={(t) => {
              setTipoFiltro(t);
              onLog(`Filtro → ${t === 'todos' ? 'Todos los tipos' : TIPO_LABEL_FILTRO[t]}`);
            }}
          />

          {grupos.length === 0 ? (
            <SinCoincidencias>Sin carreras con este filtro en este periodo. Prueba con «Todo».</SinCoincidencias>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S.xxxl }}>
              {grupos.map((g) => (
                <div key={g.lunes} style={{ display: 'flex', flexDirection: 'column', gap: S.xs }}>
                  <CabeceraSemana lunes={g.lunes} km={g.km} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {g.filas.map((f, i) => (
                      <FilaCarrera
                        key={`${f.fecha}-${i}`}
                        fila={f}
                        onTap={() => onLog(`→ ficha: ${f.nombre ?? TIPO_LABEL[f.tipo]} del ${diaCorto(f.fecha)}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Pantalla>
    </div>
  );
}
