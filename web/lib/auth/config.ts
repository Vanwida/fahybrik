function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const AUTH_CONFIG = {
  authSecret: () => required('AUTH_SECRET'),
  appleClientId: () => process.env.APPLE_CLIENT_ID ?? '',
  appleIssuer: 'https://appleid.apple.com',
  appleJwksUrl: 'https://appleid.apple.com/auth/keys',
  resendApiKey: () => process.env.RESEND_API_KEY ?? '',
  resendFromEmail: () => process.env.RESEND_FROM_EMAIL ?? 'Fahybrik <noreply@aistudios.pro>',
  appUrl: () => process.env.APP_URL ?? 'http://localhost:3000',
  coachAllowlist: (): string[] =>
    (process.env.COACH_ALLOWLIST ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),

  athleteSessionTtlSeconds: 30 * 24 * 60 * 60,
  coachSessionTtlSeconds: 7 * 24 * 60 * 60,
  magicLinkTtlSeconds: 15 * 60,

  coachCookieName: 'fahybrik_coach_session',
} as const;

export const JWT_ISSUER = 'fahybrik';
export const JWT_AUDIENCE_ATHLETE = 'fahybrik-ios';
export const JWT_AUDIENCE_COACH = 'fahybrik-dashboard';
