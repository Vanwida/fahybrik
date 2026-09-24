import { ownerIdFromPathname } from '@/lib/storage/owned-pathname';

// #28 importer — the coach_id folder segment of an
// `import-photos/<coach_id>/…` pathname. Its own tiny module (not inline in
// photo-proposal.ts) purely so `photo-blob-resolve.ts` can use it without
// importing BACK into photo-proposal.ts (which imports `resolvePhotoImages`
// FROM photo-blob-resolve.ts) — a leaf, same reasoning as `./import-shared.ts`.

/**
 * `/api/coach/import/upload-url` is the ONLY writer of this prefix (it
 * derives it from the signed-in coach's own session), so a pathname whose
 * owner segment doesn't match the CALLING coach's id can only mean one of
 * two things: a stale/foreign pathname, or a client trying to reference an
 * image it never uploaded. Either way: reject, never resolve it. Same
 * convention `athleteIdFromPathname` uses for `chat/<athlete_id>/…`
 * (lib/chat/upload.ts).
 */
export function importPhotoPathnameOwner(pathname: string): bigint | null {
  // Forma exacta, sin `..` ni rutas absolutas (lib/storage/owned-pathname.ts).
  return ownerIdFromPathname(pathname, 'import-photos');
}
