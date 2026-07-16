import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// `max-w-xl` / `max-w-xs` NO valen lo que parece en este repo, y el fallo es mudo:
// no rompe el build ni el typecheck, sólo colapsa el contenedor en pantalla.
//
// app/globals.css redefine la escala de spacing con nombres de camiseta
// (--spacing-xs: 4px … --spacing-xl: 24px) y Tailwind v4 resuelve --spacing-*
// ANTES que --container-* para max-w-*. Así que `max-w-xl` = 24px, no 36rem.
// Sólo chocan `xs` y `xl`: la escala usa s/m/l/xxl/xxxl y la de contenedores
// sm/md/lg/2xl/3xl, así que max-w-{sm,md,lg,2xl,3xl} sí resuelven bien.
//
// Ya nos costó un bug en producción: el drawer de dosis del editor de día salía
// de 24px detrás del scrim (parecía "la pantalla se queda en gris"). Estaba
// documentado y volvió a entrar igual — de ahí la regla.
const MAXW_SPACING_COLLISION =
  "(^|\\s)([a-z0-9-]+:)*max-w-(xs|xl)(\\s|$)";

const NO_COLLIDING_MAXW = {
  selector: `JSXAttribute[name.name='className'] Literal[value=/${MAXW_SPACING_COLLISION}/]`,
  message:
    "max-w-xl / max-w-xs colisionan con la escala --spacing-* de globals.css y resuelven a 24px / 4px, no a 36rem / 20rem. Usa un valor arbitrario: max-w-[576px] para lo que querías que fuese max-w-xl, max-w-[320px] para max-w-xs.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: { "no-restricted-syntax": ["error", NO_COLLIDING_MAXW] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
