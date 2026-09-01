// GUÍA · 40 Zonas de pulso personales — área "Aparatos y sensores". Del lado del
// atleta + una lectura del coach. REESCRITA el 28-jul-2026, porque el modelo cambió
// de raíz: una zona de FC ya NO es un porcentaje de la FC máxima, es una FRACCIÓN de
// la FC de UMBRAL (Z1 ≤0,81 · Z2 0,82–0,88 · Z3 0,89–0,94 · Z4 0,95–1,02 · Z5 ≥1,03),
// y la resuelve SOLO el servidor, en ppm absolutas — el móvil ya no calcula ninguna.
// El ancla se busca por orden de evidencia: umbral MEDIDO en test → 0,88 × FC máx
// medida → 0,88 × Tanaka(edad) = 0,88 × (208 − 0,7 × edad). Sin ninguna de las tres NO
// HAY ZONAS: la app lo dice y ofrece salida, no fabrica bandas. Si el umbral es
// estimado, la etiqueta viaja pegada al número (resumen, "Mis zonas", el reloj se
// queda sin aviso de pulso, y el tiempo por zona del coach lleva el ancla). La FC máx
// sigue en el perfil (100–230) pero ya solo como ENTRADA para derivar un umbral.
// Verificado contra:
//   shared/domain/methodology/hr-zones.ts (HR_ZONE_FRACTIONS = la única fuente de una
//     fracción de zona; resolveThresholdHr: lthr_measured → from_max_hr (×0,88) →
//     from_age (Tanaka ×0,88); resolveHrZones → null sin ancla; zoneForBpm con Z5
//     abierta por arriba y Z1 sin suelo)
//   web/tests/methodology/hr-zones.test.ts (atleta 64, 44 años, sin máx medida: umbral
//     156 ppm y Z2 128–137; el modelo viejo daba 106–124, y a 130 ppm decía Z3)
//   web/lib/athlete/hr-zones.ts (loadHrAnchors: benchmark lthr_bpm + athletes.max_hr_bpm
//     + athletes.dob; buildHrZonesDTO: lthr_bpm/estimated/source/source_label +
//     range_label ya formateado; HR_ZONE_LABEL Recuperación…VO₂ máx)
//   web/app/api/athlete/zones/route.ts (`hr: null` honesto cuando no hay ancla)
//   web/app/api/athlete/profile/route.ts (max_hr_bpm int 100–230 nullable; dob ISO)
//   ios/FAHYBRIKCore/Theme/ZoneColors.swift (HRZone = identidad y color, nada más;
//     HRZoneProfile / HRZoneBand llegan del servidor; AthleteMaxHR 100–230 es solo el
//     rango del campo del perfil)
//   ios/FAHYBRIK/Profile/MyZonesView.swift (pulseSection: bandas + línea de ancla
//     "umbral 156 ppm · estimado por tu edad" en color de aviso cuando es estimada, y
//     "Aún no tenemos tus zonas de pulso" con las dos salidas reales)
//   ios/FAHYBRIK/Workout/PostWorkoutSummaryView.swift ("Umbral 156 ppm · estimado")
//   ios/FAHYBRIK/Wearables/AppleWorkoutMapper.swift (heartRateAlert: `guard !estimated`
//     → sin aviso de pulso en el reloj; al reloj le van ppm absolutas, nunca "Z4")
//   web/lib/coach/athlete-deep-dive.ts (loadZoneTime: null sin ancla; el tiempo por zona
//     viaja con lthr_bpm + estimated + source_label) + shared/domain/coach/
//     deep-dive-types.ts (ZoneTimeBlock)
//   web/lib/dashboard/coach/deep-dive-performance.ts (polarizationFrom clasifica contra
//     las bandas del propio atleta: low = Z1+Z2, mid = Z3+Z4, high = Z5)
//   web/components/v2/atleta-detalle/rendimiento/DiagnosticPanels.tsx (PolarizationPanel:
//     leyenda Baja/Media/Alta, "Objetivo 80 / 0 / 20", vacío "Sin distribución de
//     intensidad — faltan lecturas de frecuencia cardíaca")
//   web/components/v2/atleta-detalle/PerfilTab.tsx ("FC máx medida", honest-null)
//   infra/scripts/seed_methodology.ts (test lthr_30min: 30 min, FC media de los últimos
//     20 — el único que produce un umbral medido de verdad)

import type { ReactNode } from 'react';

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

// Rampa de zona baja→alta usando SOLO tokens vivos (nada hardcodeado). Espeja
// ZoneColors.swift: gris · azul · verde · ámbar · rojo. El naranja de marca queda
// fuera a propósito, igual que en la app.
const ZONE_HUES = [
  'var(--v2-muted)',
  'var(--v2-info)',
  'var(--v2-ok)',
  'var(--v2-warn)',
  'var(--v2-danger)',
] as const;

// El ejemplo trabajado de toda la sección: atleta de 44 años sin FC máx medida.
// Tanaka(44) = 177,2 → umbral = 0,88 × 177,2 ≈ 156 ppm. Las bandas de abajo son las
// que devuelve resolveHrZones con ese ancla (verificadas en el test del modelo).
const EJEMPLO_UMBRAL = '156';

// Una fila de la tabla de referencia del coach: Zn · nombre · fracción del umbral ·
// ppm resueltas. Vive en la crónica clara del documento, así que usa tokens --v2-*.
function ZoneRow({
  z,
  name,
  fraction,
  bpm,
}: {
  z: number;
  name: string;
  fraction: string;
  bpm: string;
}) {
  const hue = ZONE_HUES[z - 1];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '26px 1fr auto auto',
        gap: '12px',
        alignItems: 'center',
        padding: '9px 2px',
        borderTop: '1px solid var(--v2-border)',
        fontSize: '13px',
      }}
    >
      <span
        style={{
          fontSize: '10px',
          fontWeight: 800,
          color: hue,
          border: `1px solid ${hue}`,
          borderRadius: '5px',
          padding: '2px 0',
          textAlign: 'center',
        }}
      >
        Z{z}
      </span>
      <span style={{ color: 'var(--v2-fg)' }}>{name}</span>
      <span
        style={{
          fontFamily: 'var(--v2-font-mono)',
          fontSize: '11.5px',
          color: 'var(--v2-muted)',
          minWidth: '86px',
          textAlign: 'right',
        }}
      >
        {fraction}
      </span>
      <span
        style={{
          fontFamily: 'var(--v2-font-mono)',
          fontSize: '12.5px',
          fontWeight: 700,
          color: 'var(--v2-fg)',
          minWidth: '74px',
          textAlign: 'right',
        }}
      >
        {bpm}
      </span>
    </div>
  );
}

// Una fila de "Mis zonas · Pulso" tal cual la pinta hrZoneRow en MyZonesView: barra
// de color, código + nombre, y el rango YA formateado por el servidor a la derecha.
function PulseRow({ z, name, range }: { z: number; name: string; range: string }) {
  const hue = ZONE_HUES[z - 1];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr auto',
        gap: '11px',
        alignItems: 'center',
        padding: '9px 2px',
        borderTop: '1px solid var(--hair)',
      }}
    >
      <span style={{ background: hue, borderRadius: '2px', height: '26px' }} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)' }}>Z{z}</span>
        <span style={{ fontSize: '10px', color: 'var(--faint)' }}>{name}</span>
      </span>
      <span className="num" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>
        {range}
      </span>
    </div>
  );
}

// Un peldaño de la cadena de anclas. `strength` pinta el borde: medido (ok) vs
// estimado (neutro punteado), que es exactamente la distinción que importa.
function AnchorRung({
  n,
  title,
  detail,
  measured,
}: {
  n: string;
  title: string;
  detail: ReactNode;
  measured?: boolean;
}) {
  const tone = measured ? 'var(--v2-ok)' : 'var(--v2-muted)';
  return (
    <div
      style={{
        display: 'flex',
        gap: '13px',
        alignItems: 'flex-start',
        background: 'var(--v2-surface)',
        border: measured ? `1px solid ${tone}` : '1px dashed var(--v2-border)',
        borderRadius: 'var(--v2-r-m)',
        padding: '13px 15px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--v2-font-mono)',
          fontSize: '12px',
          fontWeight: 800,
          color: tone,
          border: `1px solid ${tone}`,
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: '13.5px',
            fontWeight: 700,
            color: 'var(--v2-fg)',
            marginBottom: '2px',
          }}
        >
          {title}
        </span>
        <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--v2-muted)', lineHeight: 1.5 }}>
          {detail}
        </span>
      </span>
    </div>
  );
}

export default function Section({ meta }: { meta: GuiaSection }) {
  return (
    <DocSection
      area={meta.area}
      num={meta.num}
      title={meta.title}
      lead={
        <>
          Una zona de pulso solo significa algo si cuelga de un número que tu atleta ha{' '}
          <b>medido</b>. Hasta ahora colgaban de su <b>FC máxima</b>, y como casi nadie la ha medido,
          la app la estimaba por la edad y sacaba porcentajes de una estimación. Desde el <b>28 de
          julio</b> una zona es una <b>fracción de su FC de umbral</b>: lo que un test mide y contra lo
          que tú prescribes. Y si no hay nada que la ancle, <b>no hay zonas</b>: la app lo dice, no se
          las inventa.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Cinco zonas de FC en <b>ppm absolutas</b>, calculadas como fracción de la <b>FC de
            umbral</b> del atleta: Z1 hasta <span className="num">0,81</span> · Z2{' '}
            <span className="num">0,82–0,88</span> · Z3 <span className="num">0,89–0,94</span> · Z4{' '}
            <span className="num">0,95–1,02</span> · Z5 desde <span className="num">1,03</span>.
          </>
        }
        como={
          <>
            Tú no configuras nada. El umbral sale, <b>por este orden</b>: del <b>test de umbral</b>, de
            su <b>FC máx medida</b> en el perfil, o de su <b>fecha de nacimiento</b>. Las <b>resuelve el
            servidor</b> y el móvil solo las pinta.
          </>
        }
        porque={
          <>
            Porque el umbral es lo único que se <b>mide</b> y contra lo que <b>prescribes</b>. Un
            porcentaje de un máximo estimado por la edad son <b>dos suposiciones apiladas</b>, y daban
            bandas que no coincidían con las tuyas.
          </>
        }
      />

      <h3>1 · Antes: dos Z2 que no se tocaban</h3>
      <p>
        No es una mejora cosmética, es un <b>error corregido</b>. Un atleta real de <b>44 años</b> sin
        FC máxima medida tenía, el mismo día y para la misma sesión, <b>dos Z2 distintas</b>: la del
        servidor (la que se cruzaba con tu prescripción) y la que el móvil calculaba solo, como
        porcentaje de un máximo estimado por su edad. <b>No se solapaban en un solo latido.</b>
      </p>

      <div style={{ display: 'flex', gap: '12px', margin: '12px 0 4px', flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 210px',
            background: 'var(--v2-surface)',
            border: '1px dashed var(--v2-border)',
            borderRadius: 'var(--v2-r-m)',
            padding: '13px 15px',
          }}
        >
          <div
            style={{
              fontSize: '9.5px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--v2-danger)',
            }}
          >
            Antes · % de la máxima
          </div>
          <div
            className="num"
            style={{ fontSize: '19px', fontWeight: 800, color: 'var(--v2-fg)', margin: '4px 0 3px' }}
          >
            Z2 106–124 ppm
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--v2-muted)', lineHeight: 1.5 }}>
            El <span className="num">60–70 %</span> de una FC máxima que <b>nadie midió</b>: salía de su
            edad.
          </div>
        </div>
        <div
          style={{
            flex: '1 1 210px',
            background: 'var(--v2-surface)',
            border: '1px solid var(--v2-ok)',
            borderRadius: 'var(--v2-r-m)',
            padding: '13px 15px',
          }}
        >
          <div
            style={{
              fontSize: '9.5px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--v2-ok)',
            }}
          >
            Ahora · fracción del umbral
          </div>
          <div
            className="num"
            style={{ fontSize: '19px', fontWeight: 800, color: 'var(--v2-fg)', margin: '4px 0 3px' }}
          >
            Z2 128–137 ppm
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--v2-muted)', lineHeight: 1.5 }}>
            El <span className="num">0,82–0,88</span> de su umbral (
            <span className="num">{EJEMPLO_UMBRAL} ppm</span>). La misma banda que usas tú.
          </div>
        </div>
      </div>

      <p>
        Traducido a la calle: a <b>130 ppm</b> ese atleta estaba <b>exactamente donde tú lo querías</b>{' '}
        (Z2), y su móvil le decía <b>Z3</b>: «estás apretando de más». Peor todavía, los segundos por
        zona que te llegaban a ti estaban repartidos con <b>ese</b> criterio, así que la evidencia con
        la que decidías la semana siguiente venía de un número que nadie había medido.
      </p>

      <DocNote variant="bad" title="El máximo no es un ancla de entrenamiento">
        <ul>
          <li>
            <span className="k">Casi nadie la ha medido.</span> Llegar a la máxima de verdad exige un
            esfuerzo maximal que duele y no entrena nada, por eso la inmensa mayoría de las fichas la
            tienen vacía.
          </li>
          <li>
            <span className="k">Estimarlo por la edad y luego sacar un porcentaje</span> es apilar dos
            suposiciones: el error de la fórmula multiplica al de la banda.
          </li>
          <li>
            <span className="k">El umbral sí se mide</span>, y es el punto contra el que prescribes de
            verdad. Por eso es el ancla.
          </li>
        </ul>
      </DocNote>

      <h3>2 · Las cinco bandas, en fracciones del umbral</h3>
      <p>
        Las bandas se expresan como <b>fracción del umbral</b>, no como porcentaje de un máximo. Z4{' '}
        <b>abraza</b> el <span className="num">1,00</span>: el umbral <b>es</b> la Z4, igual que en las
        zonas de ritmo el resultado del test es el borde inferior de Z4. Z1 <b>no tiene suelo</b> (no
        hay un mínimo para ir suave) y Z5 <b>no tiene techo</b>. Aquí, resueltas para un atleta con un
        umbral de <span className="num">{EJEMPLO_UMBRAL} ppm</span>:
      </p>

      <div
        style={{
          background: 'var(--v2-surface)',
          border: '1px solid var(--v2-border)',
          borderRadius: 'var(--v2-r-m)',
          padding: '4px 16px 12px',
          margin: '12px 0 6px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '26px 1fr auto auto',
            gap: '12px',
            padding: '11px 2px 6px',
            fontSize: '9.5px',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--v2-faint)',
          }}
        >
          <span>Z</span>
          <span>Zona</span>
          <span style={{ minWidth: '86px', textAlign: 'right' }}>× umbral</span>
          <span style={{ minWidth: '74px', textAlign: 'right' }}>ppm</span>
        </div>
        <ZoneRow z={1} name="Recuperación" fraction="≤ 0,81" bpm="< 126" />
        <ZoneRow z={2} name="Aeróbico suave" fraction="0,82–0,88" bpm="128–137" />
        <ZoneRow z={3} name="Aeróbico intenso" fraction="0,89–0,94" bpm="139–147" />
        <ZoneRow z={4} name="Umbral" fraction="0,95–1,02" bpm="148–159" />
        <ZoneRow z={5} name="VO₂ máx" fraction="≥ 1,03" bpm="> 161" />
      </div>

      <DocNote variant="log" title="Cinco, no siete">
        <p>
          El pulso <b>no distingue</b> un VO₂ máx de un esprint: los dos le disparan la FC al techo. Por
          eso el modelo se para en <b>cinco</b> zonas. Lo que va por encima se prescribe por{' '}
          <b>ritmo o potencia</b>, que es donde sí se ve la diferencia.
        </p>
      </DocNote>

      <h3>3 · De dónde sale el umbral: tres peldaños</h3>
      <p>
        El servidor busca el ancla <b>por orden de evidencia</b> y se queda con el primero que
        encuentra. Solo el primero es un dato <b>medido</b>; los otros dos son inferencias, y como tales
        se etiquetan.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', margin: '12px 0 6px' }}>
        <AnchorRung
          n="1"
          measured
          title="Su umbral medido, del test"
          detail={
            <>
              El <b>test de umbral de 30 minutos</b> (la FC media de los últimos 20). Es la única ancla
              que no es una estimación, así que gana siempre que exista. Se guarda como marca del atleta
              y desde ese momento todas sus zonas son <b>reales</b>.
            </>
          }
        />
        <AnchorRung
          n="2"
          title="0,88 × su FC máxima medida"
          detail={
            <>
              Si midió su máxima de verdad y la escribió en su perfil (<span className="num">100–230</span>),
              el umbral se deriva de ella. <b>Una</b> inferencia: se marca como estimado.
            </>
          }
        />
        <AnchorRung
          n="3"
          title="0,88 × Tanaka(edad)"
          detail={
            <>
              Con solo su fecha de nacimiento: <span className="num">208 − 0,7 × edad</span> da un máximo
              aproximado y de ahí el umbral. <b>Dos</b> inferencias: es lo más flojo que la app acepta,
              y lo dice cada vez que lo usa.
            </>
          }
        />
      </div>

      <DocNote variant="log" title="La FC máxima sigue ahí, pero ya no manda">
        <p>
          Tu atleta puede seguir escribiendo su <b>FC máx</b> en el perfil, y a ti te sigue apareciendo
          en su ficha. Pero ha cambiado de papel: ahora es una <b>entrada</b> para derivar un umbral (el
          peldaño 2), <b>nunca</b> el número del que cuelgan las zonas. Si tu atleta hace el test de
          umbral, su máxima deja de intervenir.
        </p>
      </DocNote>

      <h3>4 · Lo que ve tu atleta: tres estados, sin trampa</h3>
      <p>
        En <b>«Mis zonas»</b>, debajo de sus bandas de ritmo, tu atleta tiene su bloque de <b>Pulso</b>.
        Solo puede estar en uno de estos tres estados, y los tres son honestos:
      </p>

      <ul className="clean">
        <li>
          <b>Zonas reales</b>: hizo el test. La línea de ancla dice «umbral 168 ppm · medido en tu test
          de umbral», en gris, sin avisos.
        </li>
        <li>
          <b>Zonas estimadas</b>: hay bandas, pero salen de su máxima o de su edad. El ancla se pinta en{' '}
          <b>color de aviso</b> y debajo se le explica cómo convertirlas en reales.
        </li>
        <li>
          <b>Sin zonas</b>: no hay ancla de ningún tipo. No se pinta ninguna banda: se le dice, y se le
          dan las <b>dos salidas</b> que existen.
        </li>
      </ul>

      <MovilBand
        title="Estimadas y sin zonas, en su móvil"
        subtitle={
          <>
            Las bandas llegan del servidor <b>ya en ppm</b> y con su rango escrito. Cuando el umbral es
            estimado, la etiqueta va <b>pegada al número</b>; cuando no hay ancla, no hay tarjeta que
            rellenar.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Zonas estimadas.</b> Un atleta de 44 años sin test y sin máxima medida: umbral{' '}
              {EJEMPLO_UMBRAL} ppm por su edad, marcado como estimado.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Mis zonas
            </div>
            <div className="avatar">L</div>
          </div>

          <div className="lbl" style={{ margin: '4px 0 7px' }}>
            Pulso
          </div>

          <div className="logcard">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: 'var(--v2-font-display)',
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: '15px',
                  color: 'var(--fg)',
                }}
              >
                Zonas de FC
              </span>
              <span className="num" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                ppm
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--warn)', margin: '3px 0 6px' }}>
              umbral {EJEMPLO_UMBRAL} ppm · estimado por tu edad
            </div>

            <PulseRow z={1} name="Recuperación" range="< 126 ppm" />
            <PulseRow z={2} name="Aeróbico suave" range="128–137 ppm" />
            <PulseRow z={3} name="Aeróbico intenso" range="139–147 ppm" />
            <PulseRow z={4} name="Umbral" range="148–159 ppm" />
            <PulseRow z={5} name="VO₂ máx" range="> 161 ppm" />
          </div>

          <div style={{ fontSize: '10px', color: 'var(--muted)', padding: '0 2px', lineHeight: 1.5 }}>
            Son una estimación mientras no midas tu umbral. Un test de 30 min las ajusta a lo que
            aguantas de verdad.
          </div>
        </PhoneMockup>

        <PhoneMockup
          caption={
            <>
              <b>Sin zonas.</b> Ni test, ni máxima, ni fecha de nacimiento. Cero bandas inventadas, y
              las dos salidas reales, escritas.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Mis zonas
            </div>
            <div className="avatar">L</div>
          </div>

          <div className="lbl" style={{ margin: '4px 0 7px' }}>
            Pulso
          </div>

          <div className="logcard" style={{ padding: '15px 14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', marginBottom: '6px' }}>
              Aún no tenemos tus zonas de pulso
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.55 }}>
              Se calculan desde tu umbral, y todavía no lo sabemos. Pon tu fecha de nacimiento o tu FC
              máxima en el perfil para una primera estimación, o haz el test de umbral para tenerlas de
              verdad.
            </div>
          </div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="bad" title="Sin ancla no hay zonas, y eso es lo correcto">
        <ul>
          <li>
            <span className="k">Una banda inventada no se distingue de una real</span> de un vistazo: se
            lee igual, se obedece igual y acaba convertida en evidencia.
          </li>
          <li>
            <span className="k">Es un estado frecuente, no un fallo.</span> Un atleta nuevo sin test, sin
            máxima y sin fecha de nacimiento sencillamente no tiene zonas todavía.
          </li>
          <li>
            <span className="k">Y siempre lleva salida:</span> dos datos en su perfil para una
            estimación, o el test de umbral para las de verdad.
          </li>
        </ul>
      </DocNote>

      <h3>5 · Lo estimado viaja pegado al número</h3>
      <p>
        Una banda estimada y una medida <b>no dicen lo mismo</b>, así que la app nunca las enseña
        iguales. La etiqueta acompaña al dato <b>en todos los sitios donde aparece</b>:
      </p>

      <ul className="clean">
        <li>
          Al cerrar la sesión, el resumen escribe <b>«Umbral {EJEMPLO_UMBRAL} ppm · estimado»</b> junto
          al reparto por zonas.
        </li>
        <li>
          En «Mis zonas», el ancla se pinta en <b>color de aviso</b> y se explica qué hacer para
          convertirla en real.
        </li>
        <li>
          Al <b>Apple Watch</b> no se le manda <b>ningún aviso de pulso</b> si el umbral es estimado: un
          reloj vibrando en la muñeca por un número que nadie midió es peor que no avisar. Y cuando sí
          avisa, recibe <b>ppm absolutas</b>, nunca «Z4»: si le mandaras la zona, el reloj aplicaría{' '}
          <b>sus</b> zonas, calculadas con su propia estimación de FC máxima.
        </li>
        <li>
          El <b>tiempo por zona</b> que se calcula para tu ficha <b>viaja con su ancla</b>: el umbral
          usado, si era estimado y de dónde salió. Un «18 % en Z4» nunca queda suelto del número contra
          el que se midió.
        </li>
      </ul>

      <h3>6 · Lo que cambia en tu panel</h3>
      <p>
        La lectura de intensidad de tu panel ya <b>no usa un número fijo para todos</b>. Hasta ahora la{' '}
        <b>polarización</b> partía el pulso en tres franjas contra un máximo de <b>200 ppm escrito a
        mano</b>, idéntico para un atleta de 20 y para uno de 44: las líneas caían en 140 y 170 ppm para
        todo el mundo. Ahora se clasifica contra <b>las bandas de ese atleta</b>: baja es Z1+Z2, media
        Z3+Z4, alta Z5; y si no tiene ancla el panel <b>no enseña nada</b> en vez de un reparto falso.
      </p>

      <DashboardMockup url="tu-panel / atletas / laia · rendimiento">
        <div className="ath-hd">
          <div className="av">L</div>
          <div className="nm">
            Laia M.
            <small>Rendimiento</small>
          </div>
        </div>

        <div className="wk-head">
          <div className="wk-title" style={{ fontSize: '14px' }}>
            Polarización <small>· distribución por intensidad</small>
          </div>
          <span className="num2" style={{ fontSize: '10.5px', color: 'var(--faint)' }}>
            Objetivo 80 / 0 / 20
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hair)',
            borderRadius: '10px',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {[
              ['Baja', 'var(--ok)'],
              ['Media', 'var(--warn)'],
              ['Alta', 'var(--acc)'],
            ].map(([label, tone]) => (
              <span
                key={label}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: 'var(--muted)' }}
              >
                <span className="mdot" style={{ background: tone }} />
                {label}
              </span>
            ))}
          </div>

          {[
            ['7 días', 74, 9, 17],
            ['28 días', 79, 5, 16],
          ].map(([win, low, mid, high]) => (
            <div
              key={String(win)}
              style={{ display: 'grid', gridTemplateColumns: '58px 1fr', gap: '10px', alignItems: 'center', marginBottom: '8px' }}
            >
              <span className="num2" style={{ fontSize: '10px', color: 'var(--faint)' }}>
                {win}
              </span>
              <span style={{ display: 'flex', height: '9px', borderRadius: '99px', overflow: 'hidden' }}>
                <span style={{ width: `${low}%`, background: 'var(--ok)' }} />
                <span style={{ width: `${mid}%`, background: 'var(--warn)' }} />
                <span style={{ width: `${high}%`, background: 'var(--acc)' }} />
              </span>
            </div>
          ))}
        </div>
      </DashboardMockup>

      <p>
        Y en su ficha, pestaña <b>«Perfil &amp; objetivos»</b>, sigues viendo su <b>FC máx medida</b>{' '}
        cuando la introdujo, con el mismo matiz honesto de siempre: si nunca la midió, <b>la fila no
        aparece</b>. Nunca verás una estimación disfrazada de dato medido.
      </p>

      <DocNote variant="cue" title="Lo único que puedes pedirle">
        <p>
          Si quieres que las zonas de un atleta sean <b>reales</b>, hay un solo camino: el <b>test de
          umbral de 30 minutos</b>. Pídeselo por chat y prográmaselo como cualquier otro test. Mientras
          tanto, con su fecha de nacimiento en el perfil ya tiene una <b>referencia etiquetada</b>, y
          sin ella, ni eso.
        </p>
      </DocNote>
    </DocSection>
  );
}
