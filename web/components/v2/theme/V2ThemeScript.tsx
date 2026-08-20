// Server component — the inline pre-paint theme script MUST be rendered
// server-side so the <script> actually executes before hydration. Imports the
// theme constants from ./theme-config (a PLAIN module): importing them from the
// 'use client' V2ThemeProvider would hand the server a client-reference proxy,
// whose stringified form is an error-throwing function body — that turned the
// inline script into invalid JS ("Invalid or unexpected token").
import { V2_THEME_STORAGE_KEY, V2_THEME_DEFAULT } from './theme-config';

/**
 * Inline pre-paint script — sets `data-theme` on `.v2-root` BEFORE React hydrates
 * so there is no light/dark flash. Dependency-free; mirrors resolveV2Theme order.
 */
export function V2ThemeScript() {
  const js = `(function(){try{var k='${V2_THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var t=(s==='dark'||s==='light')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'${V2_THEME_DEFAULT}');var el=document.querySelector('.v2-root');if(el)el.setAttribute('data-theme',t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
