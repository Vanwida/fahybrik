// profile-patch-schema — PURE tests (no DB) for the PATCH /api/athlete/profile
// body validation, focused on the new measured max-HR field (zonas HR contract).
// The contract under test:
//   · max_hr_bpm accepts an integer in [100, 230];
//   · explicit null is accepted (clears the column → app reverts to estimated);
//   · omitting it is accepted (optional);
//   · out-of-range / non-integer values are rejected;
//   · the schema STRIPS unknown keys (z.object default, not .strict()), so an
//     iOS save carrying extra keys never 422s on their account.

import { describe, expect, test } from 'vitest';
import { profilePatchSchema } from '@/app/api/athlete/profile/route';

// Minimal valid body — full_name is the only required field.
const base = { full_name: 'Test Atleta' };

describe('profilePatchSchema · max_hr_bpm', () => {
  test('accepts a measured max HR in range', () => {
    const r = profilePatchSchema.safeParse({ ...base, max_hr_bpm: 185 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_hr_bpm).toBe(185);
  });

  test('accepts explicit null (clear → estimated)', () => {
    const r = profilePatchSchema.safeParse({ ...base, max_hr_bpm: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_hr_bpm).toBeNull();
  });

  test('accepts an omitted field (optional)', () => {
    const r = profilePatchSchema.safeParse({ ...base });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.max_hr_bpm).toBeUndefined();
  });

  test('rejects below the physiological range', () => {
    expect(profilePatchSchema.safeParse({ ...base, max_hr_bpm: 99 }).success).toBe(false);
  });

  test('rejects above the physiological range', () => {
    expect(profilePatchSchema.safeParse({ ...base, max_hr_bpm: 231 }).success).toBe(false);
  });

  test('rejects a non-integer', () => {
    expect(profilePatchSchema.safeParse({ ...base, max_hr_bpm: 180.5 }).success).toBe(false);
  });

  test('strips unknown keys instead of failing (not strict)', () => {
    const r = profilePatchSchema.safeParse({ ...base, max_hr_bpm: 190, totally_unknown: 'x' });
    expect(r.success).toBe(true);
    if (r.success) expect('totally_unknown' in r.data).toBe(false);
  });
});
