// Vitest stub for Next.js's `server-only` sentinel. The real module throws on
// import to prevent server-only code from being bundled into client builds. In
// Node-based unit/integration tests there's no client boundary, so we no-op.
export {};
