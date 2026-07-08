// @fahybrid/shared/domain/execution-merge — multi-source workout fusion (#36).
// One real workout, several sources (Apple-Health device skeleton + screenshot→
// IA capture + manual + athlete edits) → ONE execution with per-group provenance.
// CONFIG + pure logic only; the ingest/vision/iOS wiring that builds the
// contributions lands in Fase 2/3 and calls `mergeContributions`.

export * from './channel';
export * from './precedence';
