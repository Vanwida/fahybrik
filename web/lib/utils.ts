import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * Los peldaños de la escala de tipo del dashboard, declarada como `--text-*` en
 * `app/globals.css`. **Si añades o quitas uno allí, cámbialo aquí también.**
 *
 * Por qué esta lista tiene que existir: tailwind-merge lleva una lista CERRADA
 * de tamaños de fuente (xs · sm · base · lg · xl · …). Cualquier otro `text-X`
 * lo clasifica como COLOR, porque `text-red-500` y `text-lg` se escriben igual.
 * Sin esto, `cn('text-label', 'text-[color:var(--v2-faint)]')` cree que son dos
 * colores en conflicto y **borra el tamaño en silencio**: el texto se cae al
 * 16px heredado. No lo caza el typecheck ni el linter — solo se ve mirando la
 * pantalla. (`text-[11px]` no lo sufría porque el corchete con unidad sí se
 * reconoce como longitud.)
 */
const DASHBOARD_TEXT_SIZES = ["nano", "eyebrow", "label", "body", "reading", "data"] as const

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...DASHBOARD_TEXT_SIZES] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
