import { describe, expect, it } from 'vitest';
import {
  deriveInviteLandingState,
  type InviteStatusDescriptor,
} from './landing-state';

const NOW = new Date('2026-07-07T12:00:00.000Z');
const FUTURE = new Date('2026-07-20T12:00:00.000Z');
const PAST = new Date('2026-07-01T12:00:00.000Z');

function descriptor(over: Partial<InviteStatusDescriptor> = {}): InviteStatusDescriptor {
  return {
    used: false,
    cancelled: false,
    expiredStatus: false,
    expiresAt: FUTURE,
    ...over,
  };
}

describe('deriveInviteLandingState', () => {
  it('returns invalid when there is no invitation row', () => {
    expect(deriveInviteLandingState(null, NOW)).toBe('invalid');
  });

  it('returns valid for a live, pending invitation', () => {
    expect(deriveInviteLandingState(descriptor(), NOW)).toBe('valid');
  });

  it('returns used when already accepted/redeemed', () => {
    expect(deriveInviteLandingState(descriptor({ used: true }), NOW)).toBe('used');
  });

  it('returns cancelled when cancelled/revoked', () => {
    expect(deriveInviteLandingState(descriptor({ cancelled: true }), NOW)).toBe('cancelled');
  });

  it('returns expired when the status column is expired', () => {
    expect(deriveInviteLandingState(descriptor({ expiredStatus: true }), NOW)).toBe('expired');
  });

  it('returns expired when expiry is in the past even if status is pending', () => {
    expect(deriveInviteLandingState(descriptor({ expiresAt: PAST }), NOW)).toBe('expired');
  });

  it('treats expiry exactly at now as expired (<=)', () => {
    expect(deriveInviteLandingState(descriptor({ expiresAt: NOW }), NOW)).toBe('expired');
  });

  it('prefers the used terminal state over an also-past expiry', () => {
    expect(
      deriveInviteLandingState(descriptor({ used: true, expiresAt: PAST }), NOW),
    ).toBe('used');
  });

  it('prefers cancelled over an also-past expiry', () => {
    expect(
      deriveInviteLandingState(descriptor({ cancelled: true, expiresAt: PAST }), NOW),
    ).toBe('cancelled');
  });
});
