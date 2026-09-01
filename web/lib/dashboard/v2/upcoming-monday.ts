// Client-side "next Monday" default for the date pickers on assign/personalize
// flows (#4 — a plan can be scheduled for "esta semana / la que viene / una
// fecha", but every date input needs an honest starting value). Deliberately
// local-browser-time, not the server's "box timezone" (shared/domain/dates.ts) —
// this only ever seeds an `<input type="date">` the coach can freely change; the
// server re-validates and Monday-aligns whatever it receives regardless.
//
// Single source: previously duplicated verbatim in AsignarAtletaModal.tsx and
// ActivarPlanPersonalModal.tsx before AsignacionSugeridaCard.tsx needed a third
// copy.
export function upcomingMondayIso(): string {
  const d = new Date();
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const daysUntilMonday = (1 - dow + 7) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
