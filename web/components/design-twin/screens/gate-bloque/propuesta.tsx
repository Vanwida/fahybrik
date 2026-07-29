'use client';

// «Propuesta» — MISMA puerta, mismo compromiso (EMPEZAR abajo, siempre
// visible), pero el sujeto ESCALA con el hueco que sobra en vez de reservar un
// ScrollView de alto fijo (el fallo medido en `hoy.tsx`). Con 1 ítem la dosis
// ES el número grande de la pantalla; con 16 la lista se cierra en filas
// compactas y el scroll llega SOLO cuando desborda (CONTRATO-UI §6.1 —
// `previsualiza`, degradando a `centra` cuando ya no hay más verdad que
// enseñar que un único ítem).

import type { ItemReal } from '../../datos-reales';
import { Card, Display, IconClose, RoundButton, SecondaryCTA } from '../../kit';
import { Pie } from './piezas';
import { escala, SujetoFila, SujetoGrande, SujetoHero, SujetoMedia } from './sujeto';

export interface PropuestaProps {
  titulo: string;
  formato?: string;
  blockNumber: number;
  blockCount: number;
  items: ItemReal[];
  itemsRestantes: number;
  onLog: (linea: string) => void;
}

export function Propuesta({ titulo, formato, blockNumber, blockCount, items, itemsRestantes, onLog }: PropuestaProps) {
  const nivel = escala(items.length);
  // El aparato solo aparece cuando de verdad falta esa verdad: un entreno de
  // UN ítem (libre, sin coach detrás) sobre remo/ski/bici y sin monitor
  // conectado. En un plan del coach de varios bloques ya hay más pantalla que
  // enseñar y el atleta llega con el flujo de conexión resuelto antes —
  // pintarlo aquí también sería inventar un aviso que no aporta.
  const aparatoModalidad = blockCount === 1 ? items.find(esAparato)?.modalidad : undefined;

  return (
    <div style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 24px' }}>
      <Cromo blockNumber={blockNumber} blockCount={blockCount} itemsRestantes={itemsRestantes} onSalir={() => onLog('Salir del entreno')} />
      <Cabecera titulo={titulo} formato={formato} />

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {nivel === 'hero' && <SujetoHero item={items[0]} />}
        {nivel === 'grande' && <SujetoGrande items={items} />}
        {nivel === 'media' && <SujetoMedia items={items} />}
        {nivel === 'fila' && <SujetoFila items={items} />}
      </div>

      {aparatoModalidad && (
        <Aparato
          modalidad={aparatoModalidad}
          onConectar={() => onLog(`Conectar ${APARATO_PALABRA[aparatoModalidad]} → abriría la conexión del monitor`)}
        />
      )}

      <Pie onEmpezar={() => onLog('EMPEZAR → arrancaría el reloj del bloque')} />
    </div>
  );
}

type ModalidadAparato = 'row' | 'ski' | 'bike';

function esAparato(item: ItemReal): item is ItemReal & { modalidad: ModalidadAparato } {
  return item.modalidad === 'row' || item.modalidad === 'ski' || item.modalidad === 'bike';
}

// ---------------------------------------------------------------------------
// 1 · Cromo superior — el carril de bloques sustituye a «BLOQUE N DE M»
// ---------------------------------------------------------------------------

function Cromo({
  blockNumber,
  blockCount,
  itemsRestantes,
  onSalir,
}: {
  blockNumber: number;
  blockCount: number;
  itemsRestantes: number;
  onSalir: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundButton onClick={onSalir} label="Salir del entreno">
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IconClose />
          </span>
        </RoundButton>
        {blockCount > 1 && (
          <div style={{ flex: 1, display: 'flex', gap: 4 }} aria-hidden>
            {Array.from({ length: blockCount }, (_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  background: i <= blockNumber - 1 ? 'var(--twin-accent)' : 'var(--twin-hairline-strong)',
                }}
              />
            ))}
          </div>
        )}
      </div>
      {/* Con 1 solo bloque no hay nada que contar: el carril y su leyenda
          desaparecen juntos en vez de mostrar "Bloque 1 de 1". */}
      {blockCount > 1 && (
        <span style={{ font: '500 10px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Bloque {blockNumber} de {blockCount} · quedan {itemsRestantes} ítems
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Cabecera
// ---------------------------------------------------------------------------

function Cabecera({ titulo, formato }: { titulo: string; formato?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
      <Display size={30}>{titulo}</Display>
      {formato && (
        <span className="tw-pill" style={{ alignSelf: 'flex-start' }}>
          {formato}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · El aparato — solo cuando falta un monitor que de verdad hace falta
// ---------------------------------------------------------------------------

const APARATO_PALABRA: Record<ModalidadAparato, string> = { row: 'el remo', ski: 'el ski', bike: 'la bici' };

function IconSinSenal({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4.4 11.6a5 5 0 0 1 0-7.2" />
      <path d="M11.6 4.4a5 5 0 0 1 0 7.2" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <path d="M2.3 2.3l11.4 11.4" />
    </svg>
  );
}

function Aparato({ modalidad, onConectar }: { modalidad: ModalidadAparato; onConectar: () => void }) {
  const palabra = APARATO_PALABRA[modalidad];
  return (
    <Card style={{ flex: '0 0 auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IconSinSenal />
          </span>
          <span style={{ font: '600 14px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Sin monitor</span>
        </div>
        <span style={{ font: '500 12px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Conéctalo y la máquina mide los metros; sin él solo corre el reloj.
        </span>
        <SecondaryCTA title={`Conectar ${palabra}`} onClick={onConectar} />
      </div>
    </Card>
  );
}
