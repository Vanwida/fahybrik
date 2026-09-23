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

// Panel del coach: los controles pasan por los primitivos de components/v2/ui
// (Button, IconButton, Input, Textarea, Select…). Un <button>/<input>/<select>/
// <textarea> con className pintado a mano es como nacieron las 143 variantes de
// botón de la auditoría (E, C1-C2). Hoy es aviso; al cerrar la reconstrucción
// pasa a error. Dentro de components/v2/ui es legítimo: ahí se definen.
const RAW_CONTROLS = new Set(["button", "input", "select", "textarea"]);
const panelPlugin = {
  rules: {
    "no-raw-styled-control": {
      meta: {
        type: "suggestion",
        docs: { description: "Controles del panel solo vía primitivos de components/v2/ui" },
        schema: [],
        messages: {
          raw: "<{{tag}} className=…> en el panel: usa el primitivo de @/components/v2/ui ({{hint}}).",
        },
      },
      create(context) {
        const HINT = {
          button: "Button / IconButton",
          input: "Input / Checkbox / Switch",
          select: "Select / Combobox",
          textarea: "Textarea",
        };
        return {
          JSXOpeningElement(node) {
            if (node.name.type !== "JSXIdentifier" || !RAW_CONTROLS.has(node.name.name)) return;
            const styled = node.attributes.some(
              (a) => a.type === "JSXAttribute" && a.name && a.name.name === "className",
            );
            if (styled) {
              context.report({ node, messageId: "raw", data: { tag: node.name.name, hint: HINT[node.name.name] } });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: { "no-restricted-syntax": ["error", NO_COLLIDING_MAXW] },
  },
  {
    files: ["components/v2/**/*.{ts,tsx}", "app/\\[locale\\]/\\(v2\\)/**/*.{ts,tsx}"],
    ignores: ["components/v2/ui/**"],
    plugins: { panel: panelPlugin },
    rules: { "panel/no-raw-styled-control": "warn" },
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
