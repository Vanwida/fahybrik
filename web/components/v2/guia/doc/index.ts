// Barrel for the guide's shared doc kit — section files import everything they
// need from '@/components/v2/guia/doc'. Keep this the single entrypoint so the
// composable surface stays stable for phase-2 section agents.

export { DocSection } from './DocSection';
export { QCWTriad } from './QCWTriad';
export { Principle } from './Principle';
export { DocFlow, type FlowStep } from './DocFlow';
export { DocNote, type DocNoteVariant } from './DocNote';
export { MovilBand } from './MovilBand';
export { PhoneMockup } from './PhoneMockup';
export { DashboardMockup } from './DashboardMockup';
export { GuiaStub } from './GuiaStub';
