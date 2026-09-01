'use client';

// COMPARTIR EL ENTRENO — el vídeo del atleta, con el entreno en una esquina.
//
// CARD 132.
//
// ---------------------------------------------------------------------------
// EL VÍDEO MANDA. ESO DECIDE TODO LO DEMÁS
// ---------------------------------------------------------------------------
//
// Lo que hoy hace la gente que publica sus entrenos: una captura de pantalla de
// su app pegada en un rincón, y a veces algo escrito encima. Funciona porque no
// le quita el sitio al vídeo, que es lo único por lo que grabaron. A eso hay
// que ganarle, y NO se le gana ocupando más pantalla: se le gana con la misma
// esquina, pero legible, con el dato bien puesto y con marca.
//
// La primera versión de esta pantalla se equivocó justo en eso — un cartel a
// toda página que dejaba el vídeo de fondo decorativo. Eso no lo quiere nadie.
//
// ---------------------------------------------------------------------------
// QUÉ SE EXPORTA: UNA PEGATINA, NO UN FONDO
// ---------------------------------------------------------------------------
//
// La app genera un PNG de la TARJETA SOLA, con transparencia alrededor, y se lo
// entrega a Instagram como pegatina de story. Instagram deja al atleta moverla,
// girarla y escalarla: la pone donde no le tape la cara, que es exactamente lo
// que hoy hace a mano con la captura. Un PNG a pantalla completa sería una
// pegatina inmóvil que ocupa toda la story.
//
// El vídeo lo elige él dentro de Instagram, con su editor, sus filtros y su
// música. Nosotros no tocamos su cámara ni su carrete, ni exportamos ningún
// MP4. Componer el vídeo con AVFoundation sería varias veces el trabajo, pediría
// permisos, tardaría en exportar y encima quitaría el editor que ya sabe usar.
// Si Instagram no está instalado, cae al compartir del sistema con el mismo PNG.
//
// PENDIENTE DE VERIFICAR ANTES DE CONSTRUIR: el contrato de Instagram (esquema
// de URL, claves del portapapeles, App ID en el Info.plist). Es de ellos y
// cambia; se comprueba contra su documentación, no se da por sabido.
//
// ---------------------------------------------------------------------------
// LO QUE CABE EN UNA ESQUINA
// ---------------------------------------------------------------------------
//
// Una tarjeta de esquina no es la lista del entreno: es su titular. El recorte
// vive en `modelo.ts` y no en la maqueta — calentamiento y vuelta a la calma
// fuera por defecto (nadie publica su movilidad), presupuesto de ALTO en
// píxeles (no un número de líneas inventado), y lo que no entra SE DICE
// («+7 más»). Una tarjeta que recorta callando miente sobre el entreno.
//
// ---------------------------------------------------------------------------
// LA MARCA DEL CLUB — a decidir, por eso se ve con y sin
// ---------------------------------------------------------------------------
//
// El conmutador de arriba no es una preferencia del atleta: es la comparación
// que hay que hacer para decidir. CON el club, cada story de cada atleta es
// publicidad de su entrenador. SIN club, la tarjeta es del atleta y punto, y se
// lee más limpia. Cuando se decida, se queda una y el conmutador desaparece.
//
// Si se queda el club: color y nombre salen de `ClubThemeStore`, que ya viaja
// del servidor a la app y al reloj. Cero marca nuestra cableada.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { CLUB, ESCENAS } from './datos';
import { Lienzo, Tarjeta, TarjetaSemana, type Marca } from './cartel';
import { SEMANA } from './datos';
import { STORY, recortar, recortarSemana, type Entreno } from './modelo';

export const meta: TwinMeta = {
  id: 'compartir-entreno',
  titulo: 'Compartir el entreno — la story de Instagram',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-08-24',
  descripcion:
    'Card 132: manda el vídeo. La app genera un PNG de la TARJETA sola y se lo pasa a Instagram como pegatina — el atleta la mueve donde no le tape la cara, igual que hoy hace con una captura, pero legible y con marca. Con el conmutador de arriba se ve la misma tarjeta con el club y sin él, que es la decisión pendiente.',
  fuentes: [],
  enApp:
    'No existe nada de esto todavía: la app no tiene ninguna forma de compartir un entreno. El acento del club que usa la variante «con club» sí existe ya (ClubThemeStore) y viaja hasta el reloj. El vídeo de detrás es simulación del doble: lo pone el atleta en Instagram.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'dia-normal',
    titulo: '① Antes de entrenar · Fuerza B + Ski',
    descripcion:
      'Lo que toca hoy. Un día corriente cabe entero: tres ejercicios de fuerza y el ski. El calentamiento existe en el entreno pero NO sale en la tarjeta, y eso no se cuenta como recorte — no es que no quepa, es que no va. El vídeo se ve entero: la tarjeta ocupa dos tercios del ancho y un tercio del alto, y en Instagram se mueve.',
  },
  {
    id: 'no-cabe',
    titulo: '② El caso que NO cabe · Simulacro HYROX',
    descripcion:
      'Ocho estaciones más un core de seis. Es el caso que prueba la regla: entra lo que entra al tamaño en que se lee, y lo que sobra se declara con «+N más» en vez de desaparecer. Es el más apretado de los seis (698 px de 700 de tope). Si se ve denso, hay que bajar el tope de la tarjeta, nunca la letra.',
  },
  {
    id: 'ya-hecho',
    titulo: '③ Después de entrenar · lo que salió',
    descripcion:
      'El mismo martes, ya hecho. Cambia el sujeto: arriba el titular de lo que pasó (tiempo, volumen, pulso medio) y en cada línea el número REAL en vez del prescrito — las búlgaras salieron a 8 repeticiones, no a 10, y eso es lo que se enseña. Es el momento con más chicha, y es una decisión aparte: la card pedía el de antes.',
  },
  {
    id: 'series-400',
    titulo: '④ Series de 400 · el que más se comparte',
    descripcion:
      'Una tanda de series es lo que más se enseña, y lo que se enseña son LOS PARCIALES: cómo aguantó el ritmo, dónde se cayó y cómo cerró. Por eso un bloque de serie no es una línea de lista («8 × 400 m»), es una forma propia con sus ocho números en dos columnas y la mejor marcada sola desde el dato. Promediar una tanda hace que una clavada y una que se hundió a la cuarta se lean igual.',
  },
  {
    id: 'semana',
    titulo: '⑤ La semana entera',
    descripcion:
      'El resumen semanal, en la misma voz. La tira de los 7 días ES el titular: lleno = entrenado, aro = descanso prescrito, apagado = saltado — el viernes saltado se ve apagado a propósito, la tira cuenta la semana que fue y el atleta decide si la comparte. Sin fila de números grandes: los totales viajan en la cabecera de la lista, porque con héroe además de tira, lista y club la tarjeta no baja de 780 px y deja de ser una firma de esquina. El título es el nombre que el coach le puso a la semana (su foco), no uno nuestro.',
  },
];

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const [marca, setMarca] = useState<Marca>('club');
  const esSemana = escenario === 'semana';
  const entreno = ESCENAS[escenario] ?? ESCENAS['dia-normal']!;
  const { ocultos } = esSemana
    ? recortarSemana(SEMANA, { conClub: marca === 'club' })
    : recortar(entreno.bloques, { conClub: marca === 'club', conResultado: !!entreno.resultado });

  useEffect(() => {
    onLog(esSemana ? `${SEMANA.etiqueta} · ${SEMANA.totales}` : `${entreno.titulo} · ${entreno.bloques.length} bloques`);
    onLog(ocultos > 0 ? `No caben ${ocultos} → se declaran` : 'Cabe entero');
  }, [escenario, marca]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="twin-screen-safe">
      <div
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          gap: 14,
          padding: 14,
          boxSizing: 'border-box',
          background: 'var(--twin-bg)',
        }}
      >
        <Cabecera />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minHeight: 0 }}>
          <Conmutador marca={marca} onChange={(m) => { setMarca(m); onLog(m === 'club' ? 'Con la marca del club' : 'Sin marca'); }} />
          <Previsualizacion marca={marca}>
            {esSemana ? (
              <TarjetaSemana semana={SEMANA} marca={marca} club={CLUB} />
            ) : (
              <Tarjeta entreno={entreno} marca={marca} club={CLUB} />
            )}
          </Previsualizacion>
        </div>

        <Acciones onLog={onLog} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Cabecera() {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, fontStyle: 'italic', color: 'var(--twin-fg)' }}>
        Compartir
      </div>
      <div style={{ fontSize: 13, color: 'var(--twin-muted)', marginTop: 2 }}>
        Tu vídeo, con el entreno en una esquina
      </div>
    </div>
  );
}

/**
 * La comparación que hay que decidir. NO es una preferencia del atleta: cuando
 * se elija, se queda una y esto desaparece de la pantalla.
 */
function Conmutador({ marca, onChange }: { marca: Marca; onChange: (m: Marca) => void }) {
  const opciones: { id: Marca; texto: string }[] = [
    { id: 'club', texto: 'Con el club' },
    { id: 'sin', texto: 'Sin marca' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        padding: 2,
        borderRadius: 9,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            appearance: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '7px 16px',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            background: marca === o.id ? 'var(--twin-surface-elevated)' : 'transparent',
            color: marca === o.id ? 'var(--twin-fg)' : 'var(--twin-muted)',
          }}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/**
 * El cartel a escala. Se dibuja a 1080×1920 REALES y se encoge: así los cuerpos
 * de letra que se juzgan aquí son EXACTAMENTE los del PNG que se exporta.
 *
 * La escala se MIDE del hueco que queda, no se cablea: el cartel es lo único
 * que hay que mirar en esta pantalla, así que se lleva todo el alto que sobre
 * en vez de dejar medio móvil en negro.
 */
function Previsualizacion({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  const hueco = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);

  useLayoutEffect(() => {
    const el = hueco.current;
    if (!el) return;
    const medir = () => {
      const { height, width } = el.getBoundingClientRect();
      if (height <= 0) return;
      // El que se quede corto manda: alto normalmente, ancho en un móvil estrecho.
      setEscala(Math.min(height / STORY.alto, width / STORY.ancho));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    // `alignSelf: stretch` no es cosmético: el padre centra en horizontal, así
    // que sin esto el hueco mide 0 de ancho mientras el cartel no exista, la
    // escala sale 0 y el cartel no llega a existir nunca.
    <div
      ref={hueco}
      style={{ flex: 1, minHeight: 0, alignSelf: 'stretch', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
    >
      {escala > 0 && <Lienzo escala={escala}>{children}</Lienzo>}
    </div>
  );
}

function Acciones({ onLog }: { onLog: (l: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={() => onLog('Instagram abierto con el cartel de pegatina')}
        style={{
          appearance: 'none',
          border: 'none',
          cursor: 'pointer',
          height: 48,
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 800,
          fontFamily: 'inherit',
          background: 'var(--twin-accent)',
          color: 'var(--twin-accent-on)',
        }}
      >
        Abrir Instagram
      </button>
      {/* La salida honesta cuando Instagram no está: el mismo PNG por el
          compartir del sistema. No se esconde el botón — se ofrece la otra vía. */}
      <button
        onClick={() => onLog('Compartir del sistema con el mismo PNG')}
        style={{
          appearance: 'none',
          cursor: 'pointer',
          height: 44,
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'inherit',
          background: 'transparent',
          border: '1px solid var(--twin-hairline-strong)',
          color: 'var(--twin-fg)',
        }}
      >
        Compartir de otra forma
      </button>
    </div>
  );
}
