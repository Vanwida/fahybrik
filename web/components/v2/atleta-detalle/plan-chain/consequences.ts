import type { PersonalChainNode } from '@/lib/dashboard/coach/personal-plan-chain';

export function removedPending(node: PersonalChainNode, weeks: number): number {
  return weeks >= node.week_count ? 0 : node.pending_by_week.slice(weeks).reduce((n, count) => n + count, 0);
}

export function resizeLine(node: PersonalChainNode, weeks: number): string {
  if (weeks === node.week_count) return 'El nombre cambia; sus fechas y sesiones se conservan.';
  if (weeks > node.week_count) return `Se añaden ${weeks - node.week_count} semanas vacías al final. Los programas personales siguientes cambian de fecha. Lo entrenado se conserva.`;
  return `Se quitan ${node.week_count - weeks} semanas del final y ${removedPending(node, weeks)} sesiones pendientes. Los programas personales siguientes cambian de fecha. Lo entrenado se conserva.`;
}
