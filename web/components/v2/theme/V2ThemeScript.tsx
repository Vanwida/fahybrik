// Server component — the inline pre-paint theme script MUST be rendered
// server-side so the <script> actually executes before hydration. When it lived
// in the 'use client' V2ThemeProvider module, React never ran the script tag on
// the client (the console error). Kept in its own server file, imported by the
// v2 layout. Only reads the (plain string) constants from the provider.
import { V2_THEME_STORAGE_KEY, V2_THEME_DEFAULT } from './V2ThemeProvider';

/**
 * Inline pre-paint script — sets `data-theme` on `.v2-root` BEFORE React hydrates
 * so there is no light/dark flash. Dependency-free; mirrors getClientTheme order.
 */
export function V2ThemeScript() {
  const js = `(function(){try{var k='${V2_THEME_STORAGE_KEY}';var s=localStorage.getItem(k);var t=(s==='dark'||s==='light')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'${V2_THEME_DEFAULT}');var el=document.querySelector('.v2-root');if(el)el.setAttribute('data-theme',t);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
