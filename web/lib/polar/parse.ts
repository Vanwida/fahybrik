// Pure parsers for Polar AccessLink field encodings. No I/O — unit-tested in
// isolation so the ingest mapper can trust them.
//
// Polar encodes two things unusually vs Garmin (which sends epoch seconds):
//   * duration  → an ISO-8601 duration string, e.g. "PT2H44M45S" / "PT44M".
//   * start_time → a LOCAL wall-clock string with NO zone ("2008-10-13T10:40:02")
//                  plus a separate `start_time_utc_offset` in MINUTES. We must
//                  recombine them into a real UTC instant, or every workout would
//                  be filed at the wrong hour (and match the wrong day/assignment).

// ISO-8601 duration limited to the H/M/S components Polar emits for a training
// session. Seconds may be fractional. Returns whole seconds, or null when the
// string is absent/!parseable/zero-length (PT with no components).
const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;

export function parseIso8601DurationSeconds(
  duration: string | null | undefined,
): number | null {
  if (!duration || typeof duration !== 'string') return null;
  const m = ISO_DURATION.exec(duration.trim());
  if (!m) return null;
  const [, h, min, s] = m;
  if (h == null && min == null && s == null) return null;
  const total =
    (h ? parseInt(h, 10) * 3600 : 0) +
    (min ? parseInt(min, 10) * 60 : 0) +
    (s ? parseFloat(s) : 0);
  if (!Number.isFinite(total)) return null;
  return Math.round(total);
}

// Recombine Polar's local wall-clock start + UTC-offset-in-minutes into a UTC
// ISO instant. `offsetMinutes` is minutes EAST of UTC (Polar's convention, e.g.
// 180 = UTC+3), so UTC = wall_time − offset. When the offset is missing we treat
// the wall time as already-UTC (best available). Returns null if unparseable.
const LOCAL_WALL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

export function polarStartToUtcIso(
  startTime: string | null | undefined,
  offsetMinutes: number | null | undefined,
): string | null {
  if (!startTime || typeof startTime !== 'string') return null;
  const m = LOCAL_WALL.exec(startTime.trim());
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
