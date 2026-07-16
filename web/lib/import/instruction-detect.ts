// #48 importer — instruction vs pasted-session detector for the "Pegar texto"
// flow. When a coach types an INSTRUCTION ("créame una semana de HYROX…") into
// the paste box, the notation grammar mis-parses it as a session (a bogus
// "Simulation" card + a catalog error that blocks Confirm). This deterministic,
// LLM-FREE guard catches that case on submit and steers the coach to "Generar
// con IA" instead — carrying his typed text over as the generation focus.
//
// DESIGN — favour NEVER blocking a real paste over catching every instruction.
// A false positive (a genuine session refused) is worse than a false negative
// (an instruction slipping through to the old behaviour), so the trigger is the
// strong, reliable signal: an IMPERATIVE opener AND the absence of any workout
// signal (numbers/scheme tokens or a weekday header). Real sessions start with a
// weekday or an exercise line and carry prescription numbers, so they never match.

// Accent-stripped, lowercased, whitespace-collapsed — matching is robust to
// "Créame", "móntame", double spaces, etc.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Imperative verbs a coach uses to ASK for a plan (accent-stripped forms). Ordered
// longest-first inside each family so the alternation matches the fuller token.
const IMPERATIVE_VERBS = [
  'creame', 'crearme', 'createme', 'crea', 'crear',
  'generame', 'generarme', 'genera', 'generar',
  'hazme', 'hacerme', 'haz', 'hacer',
  'montame', 'montarme', 'monta', 'montar',
  'preparame', 'prepararme', 'prepara', 'preparar',
  'planificame', 'planificarme', 'planifica', 'planificar',
  'disename', 'disenarme', 'disena', 'disenar',
  'escribeme', 'escribeme', 'escribe', 'escribir',
  'redactame', 'redacta', 'redactar',
  'armame', 'armarme', 'arma', 'armar',
  'elaborame', 'elabora', 'elaborar',
  'ponme', 'dame', 'quiero', 'quisiera', 'necesito', 'deseo',
  // 2nd-person present forms used colloquially as requests ("me creas…",
  // "me montas…"). Only fire behind a lead-in / with no workout signal.
  'creas', 'haces', 'montas', 'generas', 'preparas', 'armas', 'planificas',
  'disenas', 'redactas', 'escribes', 'elaboras', 'pones',
];

// Optional polite lead-ins the imperative may hide behind ("me creas…",
// "puedes montarme…", "por favor hazme…").
const LEAD_IN = '(?:por\\s+favor|porfa(?:vor)?|me|puedes|podrias|quisiera|quiero)\\s+';

const IMPERATIVE_RE = new RegExp(
  `^(?:${LEAD_IN})*(?:${IMPERATIVE_VERBS.join('|')})\\b`,
);

// Numeric/format signals that mark REAL pasted workout content: rep schemes
// (5x500, 10/10/8), distances (500m, 5km), times (2'30", 1:45), loads (60kg,
// 75%), RPE/RIR, round/set/rep counts, and named workout formats (EMOM, AMRAP…).
// Run on the raw (case-insensitive) text — no accent stripping needed.
const SESSION_SIGNAL_RE = new RegExp(
  [
    '\\d+\\s*[x×]\\s*\\d+', // 5x500, 4×10
    '\\d+\\s*/\\s*\\d+', // 10/10/8 rep ladders
    '\\d+\\s*k?m\\b', // 500m / 5km
    '\\d+\\s*%', // 75%
    "\\d+\\s*['’\"]", // 2'30", 1'45''
    '\\d+\\s*:\\s*\\d+', // 1:45 pace
    '\\d+\\s*(?:kg|lb)\\b', // 60kg
    '\\brpe\\s*\\d+', // RPE8
    '\\brir\\s*\\d+', // RIR2
    '\\d+\\s*(?:rounds?|rondas?|series|sets|reps|min|seg|cal)\\b',
    '\\b(?:emom|amrap|for\\s*time|tabata|wod|fartlek)\\b',
  ].join('|'),
  'i',
);

// Accent-stripped Spanish weekday names — a session pasted with a day header
// ("Martes\n…") is unambiguously a real session, never an instruction.
const WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function startsWithWeekday(normText: string): boolean {
  const firstLine = normText.split('\n')[0]?.trim() ?? '';
  return WEEKDAYS.some((d) => firstLine === d || firstLine.startsWith(`${d} `));
}

/**
 * True when the pasted text reads like an INSTRUCTION to generate a plan rather
 * than a session the coach copy-pasted. Deterministic and cheap — no LLM.
 */
export function looksLikeInstruction(text: string): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return false;

  // A real workout carries prescription numbers or a named format → never an
  // instruction, even if it happens to open with a verb.
  if (SESSION_SIGNAL_RE.test(raw)) return false;

  const norm = normalize(raw);
  // A day-headed block is a pasted day.
  if (startsWithWeekday(norm)) return false;

  // The reliable trigger: an imperative opener with no workout signal.
  return IMPERATIVE_RE.test(norm);
}
