import 'server-only';

// Los datos DEL CLUB que la guía pinta en sus maquetas — nunca un nombre escrito a mano.
//
// La guía enseña pantallas y correos «tal cual los ve tu atleta o tu lead». Lo que allí
// lleva nombre sale del mismo sitio que la pantalla o el correo de verdad:
//   • la marca → la piel del club (`resolveClubBrand`: su nombre, o la del binario si no
//     ha puesto ninguno);
//   • el coach → `coachVoice(coaches.full_name, marca)`, los mismos fragmentos gramaticales
//     que usan los correos (sujeto, «con X» que desaparece sin nombre, firma);
//   • el dominio → la URL pública de la app en el entorno (`NEXT_PUBLIC_APP_URL`/`APP_URL`).
// Son componentes de servidor asíncronos; `cache()` hace que una página de la guía lea la
// sesión y la piel UNA vez aunque pinte el nombre veinte.

import { cache } from 'react';
import { emptyClubSkin, resolveClubBrand } from '@fahybrid/shared/domain/coach/club-skin';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getClubSkin } from '@/lib/coach/club-skin';
import { coachVoice, type CoachVoice } from '@/lib/coach/voice';

export interface GuiaTenant {
  /** La marca que ve el atleta: el nombre del club o, sin él, la del binario. */
  club: string;
  coach: CoachVoice;
  /** Host público de la app («app.ejemplo.com»), o null si el entorno no lo declara. */
  host: string | null;
}

/** Host sin esquema ni barra final de la URL pública configurada. */
export function publicAppHost(): string | null {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '').trim();
  if (!configured) return null;
  const withScheme = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  try {
    return new URL(withScheme).host || null;
  } catch {
    return null;
  }
}

export const loadGuiaTenant = cache(async (): Promise<GuiaTenant> => {
  const session = await getCoachSession().catch(() => null);
  const skin = session ? await getClubSkin(session.coach_id).catch(() => null) : null;
  const club = resolveClubBrand(skin ?? emptyClubSkin()).wordmark;
  return { club, coach: coachVoice(session?.club_name ?? null, club), host: publicAppHost() };
});

/** La marca del club (maquetas de la app del atleta y de los correos). */
export async function ClubMark() {
  return <>{(await loadGuiaTenant()).club}</>;
}

/** La inicial de la marca del club (el avatar del remitente de un correo). */
export async function ClubInitial() {
  return <>{(await loadGuiaTenant()).club.trim().charAt(0).toUpperCase()}</>;
}

/** El coach a principio de frase: «Ana Ruiz» / «Tu entrenador». */
export async function CoachSubject() {
  return <>{(await loadGuiaTenant()).coach.subject}</>;
}

/** El coach en medio de frase: «Ana Ruiz» / «tu entrenador». */
export async function CoachObject() {
  return <>{(await loadGuiaTenant()).coach.object}</>;
}

/** « con Ana Ruiz», o nada si el coach no tiene nombre puesto. */
export async function WithCoach() {
  return <>{(await loadGuiaTenant()).coach.withCoach}</>;
}

/** La inicial del coach (su avatar en una tarjeta), o la del club sin nombre. */
export async function CoachInitial() {
  const t = await loadGuiaTenant();
  return <>{(t.coach.named ? t.coach.name : t.club).trim().charAt(0).toUpperCase()}</>;
}

/** La firma de un correo: «Ana Ruiz · Club X» / «El equipo de Club X». */
export async function Signature() {
  return <>{(await loadGuiaTenant()).coach.signature}</>;
}

/** Una dirección de la app: `host` + `path`, o solo el path si el entorno no declara host. */
export async function AppUrl({ path }: { path: string }) {
  const { host } = await loadGuiaTenant();
  return <>{host ? `${host}${path}` : path}</>;
}
