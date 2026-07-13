// GUÍA · 40 Zonas de pulso personales — área "Aparatos y sensores". Del lado del
// atleta + una lectura del coach: antes las zonas de FC se estimaban (220−edad, y
// parte del motor usaba un valor fijo de 190). Ahora el atleta introduce su FC MÁXIMA
// MEDIDA en su perfil (100–230) y TODAS las zonas —en vivo en cinta/outdoor, en el
// reloj y en el desglose por zonas del resumen— usan la suya. Sin dato → se estima por
// edad (220−edad) y se etiqueta "estimada". Las bandas % (60/70/80/90) NO cambian:
// solo cambia el máximo sobre el que se aplican. El coach ve la FC máx medida en la
// ficha (pestaña "Perfil & objetivos"), con honest-null (si nunca se midió, no se
// muestra estimación). El coach no configura nada. Verificado contra:
//   infra/migrations/0129_athlete_max_hr.sql (athletes.max_hr_bpm int, CHECK 100–230)
//   web/app/api/athlete/profile/route.ts (z.number().int().min(100).max(230))
//   ios/FAHYBRIK/Profile/ProfileView.swift (fila "FC máx (ppm)", placeholder "100–230",
//     clamp a PersonalHRMax.min/maxMeasuredBpm; helper "…se estiman con 220 − edad
//     (marcadas 'estimada')")
//   ios/FAHYBRIK/Theme/ZoneColors.swift (PersonalHRMax.resolve → zone(forBpm:source:);
//     HRZoneClassifier bandas ..<0.60/0.70/0.80/0.90 SIN tocar; isEstimated)
//   WorkoutSession.swift / TreadmillHUDModel.swift / OutdoorRunHUDModel.swift /
//     WatchWorkoutCoordinator.swift (todas resuelven zona con PersonalHRMax; el viejo
//     190 fijo y el enum 220−edad se eliminaron — commit 9661174)
//   TreadmillHUDComponents.swift / PostWorkoutSummaryView.swift ("estimada" cuando es
//     el fallback 220−edad)
//   web/components/v2/atleta-detalle/PerfilTab.tsx ("FC máx medida", honest-null) en la
//     pestaña 'perfil' ("Perfil & objetivos", DetalleTabBar.tsx)

import { DocSection, QCWTriad, DocNote, MovilBand, PhoneMockup, DashboardMockup } from '../doc';
import type { GuiaSection } from '../config';

// Rampa de zona baja→alta usando SOLO tokens vivos (nada hardcodeado).
const ZONE_HUES = [
  'var(--v2-muted)',
  'var(--v2-ok)',
  'var(--v2-warn)',
  'var(--v2-accent)',
  'var(--v2-danger)',
] as const;

// Una fila de zona: Zn · descriptor · banda % · bpm calculados sobre la FC máx.
function ZoneRow({
  z,
  name,
  band,
  bpm,
}: {
  z: number;
  name: string;
  band: string;
  bpm: string;
}) {
  const hue = ZONE_HUES[z - 1];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 1fr auto auto',
        gap: '9px',
        alignItems: 'center',
        padding: '8px 2px',
        borderTop: '1px solid var(--hair)',
        fontSize: '11.5px',
      }}
    >
      <span
        style={{
          fontSize: '9px',
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
      <span style={{ color: 'var(--fg)' }}>{name}</span>
      <span className="num" style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
        {band}
      </span>
      <span className="num" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--fg)', minWidth: '58px', textAlign: 'right' }}>
        {bpm}
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
          Las zonas de pulso solo sirven si son <b>las de tu atleta</b>. Antes se estimaban con la
          fórmula de la edad —<span className="num">220 − edad</span>—, que a un atleta entrenado se le
          queda corta o larga. Ahora tu atleta puede meter su <b>FC máxima real, medida</b>, y{' '}
          <b>todas</b> sus zonas —en la cinta, al aire libre, en el reloj y en el desglose del
          resumen— pasan a calcularse sobre la suya. Sin dato, se estima por edad y se <b>etiqueta</b>{' '}
          como tal. Tú no configuras nada.
        </>
      }
    >
      <QCWTriad
        que={
          <>
            Zonas de FC <b>personalizadas</b>: el atleta guarda su <b>FC máxima medida</b> (100–230) en
            su perfil y todas sus zonas se calculan sobre ella, no sobre <span className="num">220 −
            edad</span>.
          </>
        }
        como={
          <>
            Tu atleta abre <b>Perfil</b> y escribe su <b>FC máx</b>. Desde ese momento, la cinta, la
            calle, el reloj y el <b>desglose por zonas</b> del resumen usan su máximo real. Sin dato,
            caen a la estimación por edad, <b>marcada «estimada»</b>.
          </>
        }
        porque={
          <>
            Porque una Z4 calculada sobre un máximo equivocado manda entrenar a la intensidad
            equivocada. Con su FC real, «Z2» significa <b>de verdad</b> Z2 — y tu prescripción por
            zonas <b>aterriza</b> donde querías.
          </>
        }
      />

      <h3>1 · Tu atleta mete su FC máxima real</h3>
      <p>
        En su <b>Perfil</b>, tu atleta tiene un campo <b>«FC máx (ppm)»</b>. Ahí escribe la máxima que{' '}
        <b>ha medido de verdad</b> —un test máximo, una carrera a tope, lo que su reloj le ha marcado
        como techo—, entre <b>100 y 230</b>. Es un dato <b>fisiológico</b>, no una opinión: por eso lo
        pone él, que es quien lo ha visto en su pecho, y no se estima a la ligera.
      </p>

      <MovilBand
        title="La FC máxima, en su perfil"
        subtitle={
          <>
            Un solo campo, con su rango honesto (100–230) y una línea que explica qué pasa si lo deja
            vacío. Es el <b>único</b> sitio que personaliza sus zonas.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Perfil del atleta.</b> «FC máx (ppm)» — su máximo medido. Vacío, las zonas se estiman
              por edad y se marcan como tal.
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Perfil
            </div>
            <div className="avatar">L</div>
          </div>
          <div className="ph-title sm" style={{ marginBottom: '10px' }}>
            Fisiología
          </div>

          <div className="field">
            <span className="fl">FC máx (ppm)</span>
            <span className="fv num">191</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--faint)', padding: '2px 2px 0', lineHeight: 1.5 }}>
            Tu FC máxima real personaliza las zonas de pulso. Si la dejas vacía, se estiman con{' '}
            <span className="num">220 − edad</span> (marcadas «estimada»).
          </div>
        </PhoneMockup>
      </MovilBand>

      <h3>2 · Sus zonas, no las de un libro</h3>
      <p>
        Con su FC máxima, la app recalcula sus <b>cinco zonas</b>. Y aquí está lo importante: las{' '}
        <b>bandas de porcentaje no cambian</b> —Z2 sigue siendo del 60 al 70&nbsp;% de tu máximo, Z4
        del 80 al 90&nbsp;%, como en todo el deporte—; lo que cambia es <b>el máximo sobre el que se
        aplican</b>. Así que las mismas bandas de siempre, pero apuntando a <b>sus</b> pulsaciones. Esto
        vale para el pulso <b>en vivo</b> (cinta y calle), para el <b>reloj</b> y para el <b>desglose
        por zonas</b> del resumen de cada sesión.
      </p>

      <MovilBand
        title="El desglose por zonas, con su máximo"
        subtitle={
          <>
            Las bandas del 60/70/80/90&nbsp;% de siempre, pero calculadas sobre su FC máx real — aquí,
            191 ppm. Cambia el techo, no las bandas.
          </>
        }
      >
        <PhoneMockup
          caption={
            <>
              <b>Zonas del atleta.</b> Cada zona, su banda % y las pulsaciones que le tocan con su FC
              máxima medida (191).
            </>
          }
        >
          <div className="ph-hd">
            <div />
            <div className="ph-mark" style={{ fontSize: '13px' }}>
              Tus zonas
            </div>
            <div className="avatar">L</div>
          </div>

          <div
            className="logcard"
            style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}
          >
            <div className="lh" style={{ marginBottom: 0 }}>FC máx</div>
            <div className="num" style={{ fontSize: '18px', fontWeight: 900, color: 'var(--fg)' }}>
              191 <span style={{ fontSize: '10px', color: 'var(--muted)' }}>ppm · medida</span>
            </div>
          </div>

          <div className="logcard">
            <ZoneRow z={1} name="Recuperación" band="<60%" bpm="<115" />
            <ZoneRow z={2} name="Fondo" band="60–70%" bpm="115–133" />
            <ZoneRow z={3} name="Tempo" band="70–80%" bpm="134–152" />
            <ZoneRow z={4} name="Umbral" band="80–90%" bpm="153–171" />
            <ZoneRow z={5} name="Máxima" band="≥90%" bpm="≥172" />
          </div>
        </PhoneMockup>
      </MovilBand>

      <DocNote variant="log" title="Las bandas no se tocan">
        <p>
          El feature <b>no cambia</b> qué es cada zona: los cortes del <b>60/70/80/90&nbsp;%</b> del
          máximo son los de siempre. Lo único que se personaliza es <b>el máximo</b>. Nadie tiene que
          reaprender qué significa una Z3.
        </p>
      </DocNote>

      <h3>3 · Sin dato, se estima y se dice</h3>
      <p>
        Si tu atleta <b>no</b> ha metido su FC máxima, las zonas no desaparecen: caen a la estimación
        por edad —<span className="num">220 − edad</span>— para que siga teniendo una referencia. Pero
        la app <b>no disimula</b>: allí donde muestra el máximo (en la cinta, en el resumen) lo etiqueta{' '}
        <b>«estimada»</b>, para que ni tu atleta ni tú confundáis una zona calculada sobre un dato
        real con una calculada sobre una fórmula.
      </p>

      {/* Comparativa medida vs estimada — dos chips honestos */}
      <div style={{ display: 'flex', gap: '10px', margin: '10px 0 2px', flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 180px',
            background: 'var(--surface)',
            border: '1px solid var(--v2-ok)',
            borderRadius: '11px',
            padding: '11px 13px',
          }}
        >
          <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--v2-ok)' }}>
            Con dato
          </div>
          <div className="num" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--fg)', marginTop: '3px' }}>
            FC máx 191
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            Zonas sobre su máximo <b>medido</b>.
          </div>
        </div>
        <div
          style={{
            flex: '1 1 180px',
            background: 'var(--surface)',
            border: '1px dashed var(--muted)',
            borderRadius: '11px',
            padding: '11px 13px',
          }}
        >
          <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Sin dato
          </div>
          <div className="num" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--fg)', marginTop: '3px' }}>
            FC máx 189 · <span style={{ color: 'var(--muted)', fontWeight: 700 }}>estimada</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            <span className="num">220 − 31</span> por edad, marcada como tal.
          </div>
        </div>
      </div>

      <h3>4 · Tú la ves en su ficha</h3>
      <p>
        En la ficha de tu atleta, pestaña <b>«Perfil &amp; objetivos»</b>, tienes su <b>FC máx
        medida</b> a la vista, junto al resto de sus datos. Con un matiz honesto: <b>solo aparece si la
        midió</b>. Si nunca la introdujo, la fila <b>no se muestra</b> —no te enseñamos una estimación
        por edad disfrazada de dato medido—. Así, cuando la ves, sabes que es real.
      </p>

      <DashboardMockup url="tu-panel / atletas / laia · perfil & objetivos">
        <div className="ath-hd">
          <div className="av">L</div>
          <div className="nm">
            Laia M.
            <small>Perfil &amp; objetivos</small>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '9px',
            marginTop: '10px',
          }}
        >
          {[
            ['Edad', '31'],
            ['FC máx medida', '191 bpm'],
            ['Objetivo', 'HYROX Pro'],
            ['Nivel', 'Avanzado'],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hair)',
                borderRadius: '10px',
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  fontSize: '8.5px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--faint)',
                }}
              >
                {k}
              </div>
              <div className="num2" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--fg)', marginTop: '3px' }}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </DashboardMockup>

      <DocNote variant="cue" title="Honest-null: si no está medida, no está">
        <p>
          La ficha muestra la <b>FC máx medida</b> solo cuando tu atleta la ha introducido. Un hueco no
          es un olvido de la app: es que <b>aún no la ha medido</b>. Puedes pedírsela por chat — es el
          único sitio que personaliza sus zonas.
        </p>
      </DocNote>
    </DocSection>
  );
}
