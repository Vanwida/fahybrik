"use client";

import { PageHeader } from "@/components/v2/ui";
import { Controls } from "./Controls";
import { Display } from "./Display";
import { Foundations } from "./Foundations";
import { Overlays } from "./Overlays";
import { TableDemo } from "./TableDemo";

const SECTIONS: [string, string][] = [
  ["color", "Color"],
  ["tipo", "Tipo"],
  ["botones", "Botones"],
  ["campos", "Campos"],
  ["navegacion", "Navegación"],
  ["etiquetas", "Etiquetas"],
  ["datos", "Datos"],
  ["estructura", "Estructura"],
  ["tabla", "Tabla"],
  ["capas", "Capas"],
  ["estados", "Estados"],
];

/**
 * Referencia viva del sistema del panel: cada primitivo en cada variante y
 * estado, con los tokens del tema activo. Para QA visual (claro/oscuro,
 * escritorio/móvil) de quien construye pantallas. No está en la navegación.
 */
export function SistemaView() {
  return (
    // Los proveedores del panel (toasts, portales) los monta el shell (V2Shell).
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 pb-24">
      <PageHeader
        title="Sistema"
        subtitle="Primitivos y tokens del panel · cambia el tema arriba a la derecha para verlos en claro"
      >
        <nav
          aria-label="Secciones"
          className="-mx-1 flex flex-wrap gap-x-1 gap-y-1"
        >
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-ctl px-2 py-1 t-body-sm text-v2-muted outline-none hover:bg-v2-hover hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
            >
              {label}
            </a>
          ))}
        </nav>
      </PageHeader>
      <Foundations />
      <Controls />
      <Display />
      <TableDemo />
      <Overlays />
    </div>
  );
}
