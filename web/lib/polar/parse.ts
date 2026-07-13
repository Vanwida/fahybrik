// Pure parsers for Polar AccessLink Dynamic API v4 field encodings. No I/O —
// unit-tested in isolation so the normalize/ingest layers can trust them.
//
// v4 encodes times/durations three ways:
//   * training times → LOCAL wall-clock ISO ("2025-01-01T10:12:33.435", no zone)
//     plus a separate `timezoneOffsetMinutes` (int). We recombine them into a
//     real UTC instant, or every workout would be filed at the wrong hour (and
//     match the wrong day/assignment).
//   * training durations → integer MILLISECONDS (durationMillis).
//   * sleep durations → a protobuf-style seconds STRING ("27000s", "3.5s").

// Recombine v4's local wall-clock start + timezoneOffsetMinutes (minutes EAST of
// UTC) into a UTC ISO instant: UTC = wall_time − offset. Missing offset → treat
// the wall time as already-UTC. Returns null if unparseable. Millisecond and
// zone suffixes after seconds are ignored (we only need to the second).
const LOCAL_WALL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

export function polarLocalToUtcIso(
  localTime: string | null | undefined,
  offsetMinutes: number | null | undefined,
): string | null {
  if (!localTime || typeof localTime !== 'string') return null;
  const m = LOCAL_WALL.exec(localTime.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const wallMs = Date.UTC(
    parseInt(y, 10),
    parseInt(mo, 10) - 1,
    parseInt(d, 10),
    parseInt(h, 10),
    parseInt(mi, 10),
    s ? parseInt(s, 10) : 0,
  );
  if (!Number.isFinite(wallMs)) return null;
  const offMs =
    typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)
      ? offsetMinutes * 60_000
      : 0;
  return new Date(wallMs - offMs).toISOString();
}

// Whole seconds from an integer-millis field. null when absent/non-finite.
export function millisToSeconds(millis: number | null | undefined): number | null {
  if (typeof millis !== 'number' || !Number.isFinite(millis)) return null;
  return Math.round(millis / 1000);
}

// Parse v4's protobuf duration STRING ("27000s", "3.000000001s") to whole
// seconds. null when absent/malformed.
const SECONDS_STRING = /^(\d+(?:\.\d+)?)s$/;

export function parsePolarSecondsString(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;
  const m = SECONDS_STRING.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}
