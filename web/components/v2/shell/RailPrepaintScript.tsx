// Componente de servidor: el <script> tiene que salir en el HTML para ejecutarse
// antes de hidratar (ver V2ThemeScript, mismo patrón).
import { RAIL_PREPAINT_JS } from './rail-config';

export function RailPrepaintScript() {
  return <script dangerouslySetInnerHTML={{ __html: RAIL_PREPAINT_JS }} />;
}
