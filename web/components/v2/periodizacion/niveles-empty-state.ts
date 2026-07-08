// Whether the Niveles "No tienes niveles definidos" placeholder should show.
//
// It MUST hide the moment a create/edit draft is opened. Otherwise "Crear mi
// primer nivel" from the empty state sets a draft, but the create side-panel
// only renders in the non-empty branch — so with zero levels the panel never
// mounts and the button looks dead (the fresh-coach bug Pablo hit). Gating on
// `levelCount === 0 && !hasDraft` gives the draft a render path from empty.
export function showLevelsEmptyState(levelCount: number, hasDraft: boolean): boolean {
  return levelCount === 0 && !hasDraft;
}
