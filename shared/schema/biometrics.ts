import { z } from 'zod';
import {
  biometricMetric,
  biometricSource,
  deviceType,
  idSchema,
  isoDateTime,
} from './_primitives.js';

export const biometricStreamSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  source: biometricSource,
  source_workout_id: z.string().max(200).nullable(),
  metric_type: biometricMetric,
  recorded_at: isoDateTime,
  value_numeric: z.number(),
  unit: z.string().min(1).max(20),
  raw_payload_json: z.unknown().nullable(),
  created_at: isoDateTime,
});
export type BiometricStream = z.infer<typeof biometricStreamSchema>;

export const deviceSchema = z.object({
  id: idSchema,
  athlete_id: idSchema,
  type: deviceType,
  identifier: z.string().min(1).max(200),
  display_name: z.string().max(200).nullable(),
  last_seen_at: isoDateTime.nullable(),
  created_at: isoDateTime,
  updated_at: isoDateTime,
});
export type Device = z.infer<typeof deviceSchema>;

// OAuth tokens are stored encrypted (bytea) in the DB. Application code MUST
// never log decrypted tokens. This schema models the runtime in-memory shape
// after decryption — not the row stored at rest.
export const garminOAuthTokenSchema = z.object({
  athlete_id: idSchema,
  access_token: z.string().min(1),
  refresh_token: z.string().nullable(),
  token_secret: z.string().nullable(),
  expires_at: isoDateTime.nullable(),
  scope: z.string().nullable(),
  connected_at: isoDateTime,
  updated_at: isoDateTime,
});
export type GarminOAuthToken = z.infer<typeof garminOAuthTokenSchema>;

export const healthkitSyncStateSchema = z.object({
  athlete_id: idSchema,
  last_anchor_data: z.string().nullable(), // base64-encoded HKQueryAnchor on the wire
  last_sync_at: isoDateTime.nullable(),
  updated_at: isoDateTime,
});
export type HealthkitSyncState = z.infer<typeof healthkitSyncStateSchema>;
