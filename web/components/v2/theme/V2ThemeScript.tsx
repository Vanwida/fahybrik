// Server component — the inline pre-paint theme script MUST be rendered
// server-side so the <script> actually executes before hydration. Imports the
// theme constants from ./theme-config (a PLAIN module): importing them from the
// 'use client' V2ThemeProvider would hand the server a client-reference proxy,
// whose stringified form is an error-throwing function body — that turned the
// inline script into invalid JS ("Invalid or unexpected token").
import { V2_THEME_STORAGE_KEY, V2_THEME_DEFAULT, V2_THEME_CANVAS } from './theme-config';

/**
 * Inline pre-paint script — sets `data-theme` on `.v2-root` BEFORE React hydrates
 * so there is no light/dark flash, and points `<meta name="theme-color">` at the
 * chosen canvas. Dependency-free; mirrors resolveV2Theme (stored wins, else dark).
 *
 * Y el fondo de `<body>`: el del layout raíz es el de la app oscura (#0A0A0A) y,
 * en una carga en frío con el tema claro, se veía negro ~700 ms bajo el
 * esqueleto claro. Se pinta con CSS (`body:has(.v2-root[data-theme=…])`) y no
 * tocando `body.style` desde el script: mutar atributos de <body> antes de
 * hidratar rompe la hidratación de React.
 */
export function V2ThemeScript() {
  const canvas = JSON.stringify(V2_THEME_CANVAS);
  const js = `(function(){try{var k='${V2_THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var t=(s==='dark'||s==='light')?s:'${V2_THEME_DEFAULT}';var el=document.querySelector('.v2-root');if(el)el.setAttribute('data-theme',t);var c=${canvas}[t];document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',c);});}catch(e){}})();`;
  const css = (['dark', 'light'] as const)
    .map((t) => `body:has(.v2-root[data-theme="${t}"]){background-color:${V2_THEME_CANVAS[t]};color-scheme:${t}}`)
    .join('');
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script dangerouslySetInnerHTML={{ __html: js }} />
    </>
  );
}
