'use client';

// IMPORTAR CARRERA — la hoja que trae tu historial de HYROX. Camino principal:
// buscas tu NOMBRE → eliges tu perfil de la lista (país y nº de carreras te
// ayudan con los homónimos) → confirmas «¿Eres tú?» → se importa TODO (individual
// y dobles). El paso de confirmar es la guarda que impide importar el historial de
// un desconocido, y «No soy yo» es su salida. Camino secundario: pegar el enlace
// de UNA carrera de results.hyrox.com.
//
// Estados de cada paso: buscar (reposo, buscando, candidatos, sin resultados,
// error) · confirmar (listo, importando, error) · enlace (vacío, enlace que no es
// de HYROX, importando, error). Los textos de error son los de la app.

import { useEffect, useRef, useState } from 'react';
import type { AnalisisCarrera, CandidatoHyresult, CarreraPasada } from '../../kit-carreras/contrato';
import { buscarCandidatos, HISTORIAL_IMPORTABLE, HOST_RESULTADOS, pareceEnlaceHyrox, SLUG_QUE_FALLA, INDIVIDUAL_2026_VLC, analisisSoloTiempos, type ResultadoBusqueda } from '../../kit-carreras/datos';
import { IcoChevron, IcoLupa } from '../../kit-dia/iconos';
import { fuente, RADIO, TAM, TOQUE, tinte, velo } from '../../kit-dia/tokens';
import { Hoja } from './hojas';
import { Aviso, BotonPrimario, BotonTexto, Campo, IcoCerrar, IcoEnlace, IcoPersonaX, SalidaAccion, Tarjeta } from './piezas';

export interface HistorialImportado {
  pasadas: CarreraPasada[];
  analisis: AnalisisCarrera | null;
}

/** El tiempo de una búsqueda y el de una importación (la real depende del servidor y de HYROX). */
const DEBOUNCE_MS = 350;
const LATENCIA_BUSQUEDA_MS = 500;
const IMPORTACION_MS = 1600;

const MENSAJE = {
  busqueda: 'No pudimos conectar con la búsqueda. Revisa tu conexión e inténtalo de nuevo en un momento.',
  ilegible: 'No pudimos leer tu historial. Vuelve a intentarlo; si sigue fallando, prueba con otro perfil.',
  enlaceMal: `Ese enlace no es una página de resultado de HYROX. Copia el enlace de tu página de atleta en ${HOST_RESULTADOS}.`,
} as const;

function Girando({ etiqueta }: { etiqueta: string }) {
  return (
    <span role="status" aria-label={etiqueta} className="cr-gira" style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--twin-hairline-strong)', borderTopColor: 'var(--twin-accent-text)' }} />
  );
}

function ChipNivel({ nivel }: { nivel: string }) {
  return (
    <span style={{ minHeight: 26, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: RADIO.pastilla, background: tinte('var(--twin-accent)', 14, 'var(--twin-surface)'), border: `1px solid ${velo('var(--twin-accent)', 55)}`, color: 'var(--twin-fg)', ...fuente(800, TAM.suelo, 1), letterSpacing: '0.04em' }}>
      {nivel}
    </span>
  );
}

const metaCandidato = (c: CandidatoHyresult) => [c.pais, c.nCarreras === 1 ? '1 carrera' : `${c.nCarreras} carreras`].filter(Boolean).join(' · ');

// ── Paso 1: buscar tu nombre ──────────────────────────────────────────────────

function Buscar({ onElige, onEnlace }: { onElige: (c: CandidatoHyresult) => void; onEnlace: () => void }) {
  const [consulta, setConsulta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    temporizador.current.forEach(clearTimeout);
    temporizador.current = [];
    const q = consulta.trim();
    if (q.length < 2) {
      // Este reinicio es la respuesta a que el texto ya no da para buscar: no hay a qué esperar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBuscando(false);
      setResultado(null);
      return;
    }
    setBuscando(true);
    setResultado(null);
    const espera = setTimeout(() => {
      const respuesta = setTimeout(() => {
        setResultado(buscarCandidatos(q));
        setBuscando(false);
      }, LATENCIA_BUSQUEDA_MS);
      temporizador.current.push(respuesta);
    }, DEBOUNCE_MS);
    temporizador.current.push(espera);
    return () => temporizador.current.forEach(clearTimeout);
  }, [consulta]);

  const pasos = [
    'Escribe tu nombre completo tal y como compites.',
    'Elige tu perfil de la lista (te ayudamos con tu país y tu número de carreras).',
    'Confirma e importamos todo tu historial: individuales y dobles.',
  ];
  const enReposo = !buscando && resultado == null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>Busca tu nombre</span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
          Importaremos todo tu historial de HYROX, individuales y dobles, desde tus resultados oficiales. Elige tu perfil de la lista.
        </span>
      </span>

      <Campo
        etiqueta="Tu nombre"
        izquierda={<IcoLupa tam={20} />}
        derecha={
          buscando ? (
            <span style={{ width: TOQUE, display: 'grid', placeItems: 'center' }}>
              <Girando etiqueta="Buscando" />
            </span>
          ) : consulta ? (
            <button type="button" className="hd-toque" aria-label="Borrar búsqueda" onClick={() => setConsulta('')} style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center', color: 'var(--twin-muted)' }}>
              <IcoCerrar tam={18} />
            </button>
          ) : null
        }
      >
        <input
          type="text"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Nombre y apellidos"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Tu nombre"
        />
      </Campo>

      {resultado?.tipo === 'error' ? <Aviso>{MENSAJE.busqueda}</Aviso> : null}

      {resultado?.tipo === 'ok' ? (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="group" aria-label="¿Cuál eres tú?">
          <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>¿Cuál eres tú?</span>
          {resultado.candidatos.map((c) => (
            <button
              key={c.id}
              type="button"
              className="hd-toque"
              onClick={() => onElige(c)}
              aria-label={`${c.nombre}${c.nivel ? `, ${c.nivel}` : ''}, ${metaCandidato(c)}`}
              style={{ borderRadius: RADIO.tarjeta }}
            >
              <Tarjeta style={{ minHeight: 72, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...fuente(700, TAM.cuerpo, 1.2), color: 'var(--twin-fg)' }}>{c.nombre}</span>
                    {c.nivel ? <ChipNivel nivel={c.nivel} /> : null}
                  </span>
                  <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{metaCandidato(c)}</span>
                </span>
                <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
                  <IcoChevron tam={18} />
                </span>
              </Tarjeta>
            </button>
          ))}
        </span>
      ) : null}

      {resultado?.tipo === 'vacio' ? (
        <Tarjeta style={{ padding: '18px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ ...fuente(800, 20, 1.15, true), color: 'var(--twin-fg)' }}>Sin resultados</span>
          <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
            No encontramos ese nombre. Revisa que esté bien escrito y prueba con tu nombre completo, tal y como aparece en tus resultados de HYROX.
          </span>
          <SalidaAccion onClick={onEnlace} icono={<IcoEnlace tam={20} />}>
            Pegar el enlace de una carrera
          </SalidaAccion>
        </Tarjeta>
      ) : null}

      {enReposo ? (
        <>
          <Tarjeta style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>Cómo funciona</span>
            {pasos.map((p, i) => (
              <span key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span aria-hidden style={{ width: 28, height: 28, flex: '0 0 auto', borderRadius: '50%', display: 'grid', placeItems: 'center', background: tinte('var(--twin-accent)', 14, 'var(--twin-surface)'), color: 'var(--twin-accent-text)', ...fuente(800, TAM.suelo, 1), fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                <span style={{ ...fuente(500, TAM.cuerpo, 1.35), color: 'var(--twin-fg)', textWrap: 'pretty', paddingTop: 2 }}>{p}</span>
              </span>
            ))}
          </Tarjeta>
          <BotonTexto onClick={onEnlace} centrado icono={<IcoEnlace tam={20} />}>
            ¿Prefieres pegar el enlace de una carrera?
          </BotonTexto>
        </>
      ) : null}
    </div>
  );
}

// ── Paso 2: «¿Eres tú?» ───────────────────────────────────────────────────────

function Confirmar({ c, error }: { c: CandidatoHyresult; error: string | null }) {
  const carreras = c.nCarreras === 1 ? 'tu carrera' : `tus ${c.nCarreras} carreras`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Tarjeta realce style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ ...fuente(800, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-accent-text)' }}>Confirma tu perfil</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...fuente(800, 24, 1.15, true), color: 'var(--twin-fg)' }}>{c.nombre}</span>
          {c.nivel ? <ChipNivel nivel={c.nivel} /> : null}
        </span>
        <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{metaCandidato(c)}</span>
      </Tarjeta>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>¿Eres tú?</span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
          Importaremos {carreras}, individuales y dobles, a tu historial. Si vuelves a importar, se actualizan sin duplicarse.
        </span>
      </span>
      {error ? <Aviso>{error}</Aviso> : null}
    </div>
  );
}

// ── Paso alternativo: pegar el enlace de una carrera ──────────────────────────

function Enlace({ importando, error, texto, onTexto }: { importando: boolean; error: string | null; texto: string; onTexto: (t: string) => void }) {
  const valido = pareceEnlaceHyrox(texto);
  const desajuste = texto.trim().length > 0 && !valido;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>Pega el enlace de tu resultado</span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-muted)', textWrap: 'pretty' }}>
          Copia el enlace de tu página de atleta en {HOST_RESULTADOS} e importamos esa carrera.
        </span>
      </span>
      <Campo etiqueta="Enlace HYROX" izquierda={<IcoEnlace tam={20} />} aviso={desajuste}>
        <input
          type="url"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder={`https://${HOST_RESULTADOS}/…`}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={importando}
          enterKeyHint="go"
          aria-label="Enlace de tu resultado en HYROX"
          style={{ fontFamily: 'var(--twin-font-mono)', fontSize: TAM.suelo }}
        />
      </Campo>
      {desajuste ? <span style={{ ...fuente(600, TAM.suelo, 1.35), color: 'var(--twin-muted)' }}>El enlace debe empezar por https:// y ser de {HOST_RESULTADOS}.</span> : null}
      {error ? <Aviso>{error}</Aviso> : null}
    </div>
  );
}

// ── La hoja ───────────────────────────────────────────────────────────────────

type Paso = 'buscar' | 'confirmar' | 'enlace';

export function HojaImportar({
  candidatoInicial,
  duracion = IMPORTACION_MS,
  onCerrar,
  onImportado,
}: {
  /** Solo del doble: abrir ya en «Importando…» con este perfil (el caso ⑬). */
  candidatoInicial?: CandidatoHyresult;
  duracion?: number;
  onCerrar: () => void;
  onImportado: (h: HistorialImportado) => void;
}) {
  const [paso, setPaso] = useState<Paso>(candidatoInicial ? 'confirmar' : 'buscar');
  const [candidato, setCandidato] = useState<CandidatoHyresult | null>(candidatoInicial ?? null);
  const [importando, setImportando] = useState(Boolean(candidatoInicial));
  const [error, setError] = useState<string | null>(null);
  const [enlace, setEnlace] = useState('');
  const fin = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alCerrar = () => {
    if (fin.current) clearTimeout(fin.current);
    onCerrar();
  };

  const termina = (h: HistorialImportado | null, mensaje: string | null) => {
    setImportando(false);
    if (h) onImportado(h);
    else setError(mensaje);
  };

  // El caso que abre ya importando arranca su cuenta aquí (un solo sitio decide la duración).
  useEffect(() => {
    if (!candidatoInicial) return;
    fin.current = setTimeout(() => {
      setImportando(false);
      onImportado(HISTORIAL_IMPORTABLE);
    }, duracion);
    return () => {
      if (fin.current) clearTimeout(fin.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importaPerfil = () => {
    if (importando || !candidato) return;
    setError(null);
    setImportando(true);
    fin.current = setTimeout(() => termina(candidato.slug === SLUG_QUE_FALLA ? null : HISTORIAL_IMPORTABLE, MENSAJE.ilegible), duracion);
  };

  const importaEnlace = () => {
    if (importando || !pareceEnlaceHyrox(enlace)) return;
    setError(null);
    setImportando(true);
    fin.current = setTimeout(() => termina({ pasadas: [INDIVIDUAL_2026_VLC], analisis: analisisSoloTiempos(INDIVIDUAL_2026_VLC) }, null), duracion);
  };

  if (paso === 'confirmar' && candidato) {
    return (
      <Hoja
        titulo="Importar carrera"
        onCerrar={alCerrar}
        atras={importando ? undefined : () => { setPaso('buscar'); setError(null); }}
        accion={
          <>
            <BotonPrimario ocupado={importando} onClick={importaPerfil} textoOcupado="Importando…" voz="Importando historial">
              Sí, importar mi historial
            </BotonPrimario>
            <BotonTexto tono="suave" centrado desactivado={importando} onClick={() => { setPaso('buscar'); setCandidato(null); setError(null); }} icono={<IcoPersonaX tam={20} />}>
              No soy yo
            </BotonTexto>
          </>
        }
      >
        <Confirmar c={candidato} error={error} />
      </Hoja>
    );
  }

  if (paso === 'enlace') {
    return (
      <Hoja
        titulo="Pegar enlace"
        onCerrar={alCerrar}
        atras={importando ? undefined : () => { setPaso('buscar'); setError(null); }}
        accion={
          <BotonPrimario ocupado={importando} activo={pareceEnlaceHyrox(enlace)} onClick={importaEnlace} textoOcupado="Importando…" voz="Importando carrera">
            Importar
          </BotonPrimario>
        }
      >
        <Enlace importando={importando} error={error} texto={enlace} onTexto={(t) => { setEnlace(t); if (error) setError(null); }} />
      </Hoja>
    );
  }

  return (
    <Hoja titulo="Importar carrera" onCerrar={alCerrar} alto="llena">
      <Buscar onElige={(c) => { setCandidato(c); setPaso('confirmar'); }} onEnlace={() => setPaso('enlace')} />
    </Hoja>
  );
}
