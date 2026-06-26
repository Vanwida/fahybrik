// Shared grid template for the roster table — the header row and every data row
// read the SAME column definition so they stay aligned across breakpoints. The
// secondary columns progressively hide on smaller viewports; the TRACK COUNT at
// each breakpoint must equal the number of visible cells (else cells misalign):
//
//   cells, in render order: Atleta · Nivel · Estado · Fase · Adherencia ·
//                           Últ.reg · ›
//   visible per breakpoint:
//     base : Atleta · Estado · ›                                    (3 tracks)
//     sm   : + Nivel                                                (4 tracks)
//     md   : + Fase                                                 (5 tracks)
//     lg   : + Adherencia                                           (6 tracks)
//     xl   : + Últ.reg                                              (7 tracks)
//
// Track sizes are ordered to match the column render order at each breakpoint.
export const GRID_COLS =
  'grid-cols-[1fr_7rem_auto] ' +
  'sm:grid-cols-[1fr_2.5rem_7rem_auto] ' +
  'md:grid-cols-[1fr_2.5rem_7rem_8rem_auto] ' +
  'lg:grid-cols-[1.4fr_2.5rem_7rem_8rem_8rem_auto] ' +
  'xl:grid-cols-[1.4fr_2.5rem_7rem_9rem_9rem_7rem_auto]';
