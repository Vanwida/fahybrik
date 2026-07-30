// PageFrame · FillPanel — las dos piezas de COMPOSICIÓN del dashboard.
//
// Existen porque el §9.2 del contrato describe el fallo de raíz de la web: cada
// vista es «una pila vertical de secciones a ancho completo dentro de una columna
// centrada», así que nadie decide qué hace la pantalla con su altura y el vacío
// aparece solo cuando se acaban las secciones (medido: 508 px muertos en /altas,
// 295 bajo un roster de tres filas).
//
// El patrón bueno YA existía en casa (§9.5) — /mensajes monta un marco a altura
// completa y /atletas/[id]/intake ancla su barra de acción — pero estaba escrito
// A MANO dentro de esas vistas. Copiarlo a la sexta pantalla es exactamente como
// nacieron los 631 tamaños de fuente sueltos. Aquí vive UNA vez.
//
// PageFrame declara la ESTRATEGIA DE ALTURA de la pantalla (§6.1):
//   · `llena`  → hay contenido y cuánto depende del dato: la cabecera se queda
//                arriba y el cuerpo ocupa lo que sobre (y scrollea por dentro).
//   · `centra` → no hay contenido, o es una sola decisión: el bloque se centra y
//                el aire queda simétrico, no en una cola debajo.
// Una Lista sin elementos ES un Vacío (§6.2), así que la MISMA vista pasa de
// `llena` a `centra` según el dato — por eso es una prop, no dos componentes.

'use client';

import { cn } from '@/lib/utils';

/** Las estrategias de altura del §6.1 que aplican a una vista de escritorio.
 *  (`previsualiza` y `gobierna` son de la app del atleta, no del dashboard.) */
export type EstrategiaAltura = 'llena' | 'centra';

// El marco se planta sobre TODO el hueco útil de la ventana, así que cancela el
// acolchado de <main> (V2Shell) y vuelve a ponerlo por dentro. Si cambia el
// acolchado de <main>, cambia AQUÍ — están atados a propósito y con un aviso en
// V2Shell.tsx.
const CANCELA_PADDING_DE_MAIN = '-mx-4 -mt-4 -mb-24 sm:-mx-6 sm:-mt-6 sm:-mb-24 lg:-mb-6';

// Alto útil = ventana − barra superior (h-14) − barra de pestañas móvil, que por
// debajo de lg es fija y tapa el final de la pantalla. Es la MISMA cuenta que ya
// hacía /mensajes; ahora en un solo sitio.
const ALTO_UTIL = 'h-[calc(100dvh-3.5rem-var(--v2-tabbar-h))] lg:h-[calc(100dvh-3.5rem)]';

const PADDING_PROPIO = 'px-4 pt-4 sm:px-6 sm:pt-6';

export function PageFrame({
  altura,
  head,
  children,
  className,
  bodyClassName,
}: {
  /** Qué hace esta pantalla con su altura. Obligatorio: no declararlo es el bug. */
  altura: EstrategiaAltura;
  /** Cabecera fija de la vista (título, contadores, búsqueda, filtros). */
  head?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn(CANCELA_PADDING_DE_MAIN, ALTO_UTIL, 'flex flex-col overflow-hidden', className)}>
      {head ? <div className={cn('shrink-0', PADDING_PROPIO)}>{head}</div> : null}
      <div
        className={cn(
          // min-h-0 es lo que permite que el hijo scrollee en vez de empujar: sin
          // él un flex-item nunca baja de su alto de contenido y el marco crece.
          'flex min-h-0 flex-1 flex-col',
          PADDING_PROPIO,
          head ? 'pt-3 sm:pt-4' : undefined,
          // `centra`: el bloque va al medio y el aire queda repartido arriba y
          // abajo. `llena`: el cuerpo se estira y reparte por dentro.
          altura === 'centra' ? 'items-center justify-center overflow-y-auto pb-4 sm:pb-6' : undefined,
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Un panel acotado: cabecera que se queda, cuerpo que scrollea por dentro y pie
 *  anclado abajo. Es lo que hacen la lista de /mensajes y la barra de acción de
 *  /atletas/[id]/intake — el contenedor con borde llega SIEMPRE al borde inferior
 *  del hueco, así que un conteo o una acción nunca cuelgan a media pantalla. */
export function FillPanel({
  head,
  foot,
  children,
  className,
  bodyClassName,
}: {
  head?: React.ReactNode;
  foot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]',
        className,
      )}
    >
      {head ? <div className="shrink-0">{head}</div> : null}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
      {foot ? <div className="shrink-0">{foot}</div> : null}
    </div>
  );
}
