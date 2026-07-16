// @fahybrid/shared/domain/prescription — typed per-set prescription model.
// Single source of truth for the dosage of one exercise line (reps, load,
// RIR/RPE, rest, tempo, zones) across web + iOS + infra.

export * from './format';
export * from './types';
export * from './completeness';
export * from './grammar-prompt';
export * from './to-text';
export * from './to-params';
export * from './parse';
export * from './progression';
export * from './run-structure';
export * from './run-structure-convert';
