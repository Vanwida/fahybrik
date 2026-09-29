'use client';

// ANALÍTICAS · LA PORTADA — propuesta del rediseño de la pestaña del atleta
// (29-09). Modelo: docs/analiticas/modelo.md (§3 las preguntas, §4 la carga
// única, §5 el contrato, A1–A10). Kit: `kit-analiticas/` sobre el lenguaje del
// vivo firmado el 28-09 (negro, SF tabular, naranja solo acción, suelo 15 pt).
//
// Un panel único con ocho bloques en el orden de las preguntas: el Estado fijo
// arriba (¿cómo estoy hoy?), la ventana única (A4), y debajo Forma y fatiga
// con la proyección a la carrera, Semana a semana plan frente a hecho por
// familia, Intensidad, Progreso con una fila por familia, Récords, Carrera y
// Recuperación. Cada bloque resuelve sus cuatro estados; cinco atletas de
// ejemplo los recorren todos.

import { useEffect, useMemo, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { BLOQUE_TITULO, FAMILIA_GRANDE, FAMILIA_GRANDE_NOMBRE, FAMILIAS_GRANDES, type FamiliaGrande, type Ventana } from '../../kit-analiticas/contrato';
import { ESCENARIOS_PORTADA, panelDe, type EscenarioPortada } from '../../kit-analiticas/casos/atletas';
import { BloqueCarrera, BloqueForma, BloqueIntensidad, BloqueProgreso, BloqueRecords, BloqueRecuperacion, BloqueSemanas, CeldaClave, useEstados, valorEstado } from '../../kit-analiticas/bloques';
import { lectura } from '../../kit-analiticas/derivados';
import { fechaLegible } from '../../kit-analiticas/fmt';
import { METODO_DEFECTO } from '../../kit-analiticas/metodo';
import { EstadoFijo, Etiqueta, Glosa, Lista, FilaRecord, PantallaAnaliticas, Seccion, Segmento, useGlosa } from '../../kit-analiticas/piezas';
import { LIENZO } from '../../kit-iphone-vivo/tokens';
import { useMedidaLienzo } from '../../kit-iphone-vivo/piezas';
import { MARGEN_A } from '../../kit-analiticas/tokens';

export const meta: TwinMeta = {
  id: 'analiticas-portada',
  titulo: 'Analíticas · la portada',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'Un panel único en el orden de las ocho preguntas: el Estado fijo (Forma · Fatiga · Frescura · disposición), una sola ventana, Forma y fatiga con la proyección hasta la carrera, Semana a semana plan frente a hecho por familia, Intensidad por zonas y reparto, Progreso con una marca por familia, Récords, Carrera con el hueco por tramo y Recuperación contra una basal. Cada cifra con su ancla y su comparación.',
  fuentes: [],
  enApp:
    'Hoy la pestaña son siete contratos y seis ventanas (AnalyticsView + running.ts + lecturas + drilldown): solo correr tiene analítica de verdad, la carga casi no existe (8 % del tiempo) y hay series normalizadas sin eje. Esto la sustituye entera: un panel (`/api/athlete/analytics/panel?ventana=`) que iOS pinta sin calcular.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'lleno',
    titulo: '① Marta · un año dentro, carrera en 39 días',
    descripcion:
      'El caso LLENO en los ocho bloques: umbral medido, reloj, HYROX Madrid a 39 días. Estado «Cargando bien» en la tercera semana de carga; la curva de forma y fatiga sigue en trazo discontinuo hasta el día de la carrera con la carga planificada (A7); plan (contorno) frente a hecho (relleno) por familia; el reparto contra el 80 % suave que pide el coach; una marca por familia con su delta en la unidad que lo juzga; seis récords nuevos; el hueco por tramo; la recuperación contra su basal. Cambia la ventana arriba: todo obedece.',
  },
  {
    id: 'mixto',
    titulo: '② Pau · correr medido, ergo declarado, sin reloj',
    descripcion:
      'El caso real (§7 del modelo): correr con umbral medido, ergo con umbral DECLARADO, fuerza con carga por esfuerzo, estaciones sin intensidad prescrita, ningún WOD, sin reloj. Cada ancla se ve en su chip; el veredicto dice cuánto de la carga va estimada; la previsión de carrera es PARCIAL (11 de 17 tramos) y no inventa un tiempo; Recuperación vacía con su salida (conectar el reloj); las filas de bici y WOD dicen por qué no están.',
  },
  {
    id: 'poco',
    titulo: '③ Jordi · tres semanas',
    descripcion:
      'POCO DATO: sin forma ni frescura hasta las 6 semanas (el plazo dibujado, la fatiga de 7 días sí), tres de doce semanas en Semana a semana, zonas estimadas desde el pulso máximo declarado (con su salida: el test de zonas), dos marcas y la basal de recuperación a 5 de 14 noches. Sin carrera: «Elige tu carrera».',
  },
  {
    id: 'vacio',
    titulo: '④ Recién dado de alta',
    descripcion:
      'VACÍO en los ocho bloques, cada uno con su salida obligatoria (§6.2 bis): empezar un entreno, conectar la banda, conectar el reloj, elegir carrera. Ningún bloque desaparece: el atleta ve qué existe y qué lo llena. Es el caso que ve todo el mundo el primer día (§6.3).',
  },
  {
    id: 'viejo',
    titulo: '⑤ Lucía · parada 23 días, reloj sin sincronizar 19',
    descripcion:
      'DATO VIEJO: la curva sigue (la forma baja, la frescura sube: es lo que pasa al parar) y cada bloque dice desde cuándo y qué lo reanuda; las semanas sin sesión se ven como huecos, no como ceros; la recuperación enseña la última noche con su edad. Sin veredicto de forma: no se juzga a quien no entrena.',
  },
  {
    id: 'glosa',
    titulo: 'La glosa a un toque (A5)',
    descripcion:
      'Nombres, no siglas: tocar Forma, Fatiga o Frescura en el Estado abre la hoja con lo que significa cada número y su sigla de TrainingPeaks para quien la busque (CTL, ATL, TSB, TSS, EF). Se abre sola a los 0,8 s.',
  },
  {
    id: 'variante-pastillas',
    titulo: 'VARIANTE §11.2 · pastillas por familia (lo de hoy)',
    descripcion:
      'La alternativa a la portada única: el Estado igual, y debajo una pastilla por familia (Correr · Ergo · Fuerza · Estaciones y WOD) que filtra el resto de bloques a esa familia. Gana profundidad por familia, pierde la foto entera y esconde el «¿hago lo que toca?» de la semana. Para decidir Alex.',
  },
  {
    id: 'variante-progreso',
    titulo: 'VARIANTE §11.1 · la pestaña se llama «Progreso»',
    descripcion: 'El mismo panel con el otro nombre en la barra y en el título. Para decidir Alex: «Analíticas» (propuesto) o «Progreso».',
  },
];

function escenarioBase(id: string): EscenarioPortada {
  return (ESCENARIOS_PORTADA as readonly string[]).includes(id) ? (id as EscenarioPortada) : 'lleno';
}

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const base = escenarioBase(escenario);
  const metodo = METODO_DEFECTO;
  const [ventana, setVentana] = useState<Ventana>(metodo.ventana_por_defecto);
  const p = useMemo(() => panelDe(base, ventana, metodo), [base, ventana, metodo]);
  const estados = useEstados(p, metodo);
  const glosa = useGlosa(onLog);
  const { ref, lienzo } = useMedidaLienzo();
  const ancho = (lienzo.ancho || LIENZO.ancho) - 2 * MARGEN_A;
  const pestana = escenario === 'variante-progreso' ? 'Progreso' : 'Analíticas';
  const [familia, setFamilia] = useState<FamiliaGrande>('correr');

  useEffect(() => {
    onLog(`${p.atleta.nombre} · ventana ${p.ventana.ventana} (${p.ventana.desde} → ${p.ventana.hasta}) · anterior ${p.ventana.anterior.desde} → ${p.ventana.anterior.hasta}`);
    onLog(`Estado: ${p.estado.palabra_es ?? 'sin palabra'} · bloques: ${Object.entries(estados).map(([b, e]) => `${BLOQUE_TITULO[b as keyof typeof BLOQUE_TITULO]}=${e}`).join(' · ')}`);
    if (p.forma.veredicto) onLog(`Veredicto: ${p.forma.veredicto.clase} — ${p.forma.veredicto.frase_es}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  useEffect(() => {
    if (escenario !== 'glosa') return;
    const t = setTimeout(() => glosa.abrir(), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escenario]);

  const disposicion = lectura(p.estado.lecturas, 'estado.disposicion');
  const formaEstado = lectura(p.estado.lecturas, 'estado.forma');
  const ultimaSesion = p.semanas.sesiones.find((s) => s.cumplimiento !== 'no-hecha')?.fecha ?? null;
  const notaEstado =
    estados.estado === 'vacio'
      ? 'Con tu primer entreno aparecen aquí tu forma, tu fatiga y tu frescura.'
      : estados.estado === 'viejo' && ultimaSesion
        ? `Sin entrenar desde el ${fechaLegible(ultimaSesion, p.atleta.hoy)} · la fatiga ya cayó y la forma baja un poco cada día`
        : formaEstado?.estado === 'sin_dato' && formaEstado.cobertura.falta?.por === 'historia'
          ? `Forma y frescura a partir de la semana ${formaEstado.cobertura.falta.hacen} · llevas ${formaEstado.cobertura.falta.llevas}`
          : null;
  const estadoFijo = (
    <EstadoFijo
      palabra={p.estado.palabra_es}
      forma={valorEstado(p, 'estado.forma')}
      fatiga={valorEstado(p, 'estado.fatiga')}
      frescura={valorEstado(p, 'estado.frescura')}
      disposicion={disposicion?.dato ? { valor: disposicion.dato.valor, palabra: disposicion.procedencia.explica_es } : null}
      nota={notaEstado}
      onGlosa={glosa.abrir}
    />
  );

  const comunes = { p, metodo, estados, onLog, ancho };

  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <PantallaAnaliticas
        titulo={pestana}
        pestana={pestana}
        ventana={ventana}
        onVentana={(v) => {
          setVentana(v);
          onLog(`Ventana → ${v}`);
        }}
        cabeceraFija={estadoFijo}
      >
        {escenario === 'variante-pastillas' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Etiqueta>Variante §11.2 · una pastilla por familia</Etiqueta>
              <Segmento
                items={FAMILIAS_GRANDES.map((f) => ({ id: f, texto: f === 'estaciones-wod' ? 'Estaciones' : FAMILIA_GRANDE_NOMBRE[f] }))}
                valor={familia}
                onCambio={(f) => {
                  setFamilia(f);
                  onLog(`Pastilla → ${FAMILIA_GRANDE_NOMBRE[f]}`);
                }}
                etiqueta="Familia"
              />
            </div>
            <Seccion titulo={FAMILIA_GRANDE_NOMBRE[familia]} pregunta="¿Mejoro en esta familia?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.progreso.filter((l) => l.familia !== 'todas' && FAMILIA_GRANDE[l.familia] === familia && l.dato).map((l) => (
                  <CeldaClave key={l.id} l={l} hoy={p.atleta.hoy} />
                ))}
              </div>
            </Seccion>
            <BloqueSemanas {...comunes} familia={familia} />
            <Seccion titulo="Récords" pregunta={`Solo ${FAMILIA_GRANDE_NOMBRE[familia].toLowerCase()}`}>
              <Lista>
                {p.records.filter((r) => FAMILIA_GRANDE[r.familia] === familia).map((r) => (
                  <FilaRecord key={r.id} r={r} hoy={p.atleta.hoy} />
                ))}
              </Lista>
            </Seccion>
            {familia === 'correr' ? <BloqueIntensidad {...comunes} /> : null}
            {familia === 'estaciones-wod' ? <BloqueCarrera {...comunes} /> : null}
          </>
        ) : (
          <>
            <BloqueForma {...comunes} />
            <BloqueSemanas {...comunes} />
            <BloqueIntensidad {...comunes} />
            <BloqueProgreso {...comunes} />
            <BloqueRecords {...comunes} />
            <BloqueCarrera {...comunes} />
            <BloqueRecuperacion {...comunes} />
          </>
        )}
      </PantallaAnaliticas>
      <Glosa abierta={glosa.abierta} onCerrar={glosa.cerrar} />
    </div>
  );
}
