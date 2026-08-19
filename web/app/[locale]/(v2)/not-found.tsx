// Estado NO ENCONTRADO de todo el dashboard. Lo alcanza cualquier `notFound()`
// de (v2) — hoy lo llaman /guia, /guia/[slug], /leads/[id] y
// /biblioteca/bloque/[id] — y también una URL que no existe.
//
// Sin este fichero, los cinco `notFound()` caían al 404 GLOBAL de la app:
// fuera del shell del coach, sin barra lateral y sin tema, o sea sin manera de
// volver salvo el botón atrás del navegador.

import { Link } from '@/i18n/navigation';
import { ScreenNotice, screenNoticeActionClass } from '@/components/v2/ScreenState';

export default function V2NotFound() {
  return (
    <ScreenNotice
      icon="search_off"
      title="Esto no existe"
      description="La página que buscas no está, o se ha movido. Puede que el enlace sea antiguo o que lo que había aquí se haya borrado."
      action={
        <Link href="/atletas" className={screenNoticeActionClass}>
          Volver a Atletas
        </Link>
      }
    />
  );
}
