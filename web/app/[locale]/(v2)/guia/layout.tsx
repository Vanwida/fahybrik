import './guia.css';
import { GuiaSidebar } from '@/components/v2/guia/GuiaSidebar';

// GUÍA DEL ENTRENADOR — the in-dashboard docs site. Nested under the (v2) route
// group, so it inherits the coach auth gate + the thin global v2 rail (the coach
// can still jump back to Hoy/Atletas while reading).
//
// We FORCE a light v2-root here — the warm cream docs chrome from the approved
// prototype — regardless of the global theme toggle, and break out of the V2Shell
// content padding (-m-4/-m-6) so the docs go edge-to-edge. The dark phone /
// dashboard mockups carry their own nested data-theme="dark" root, so they read
// the real near-black app palette while sitting inside the cream page.

export default function GuiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-root -m-4 sm:-m-6" data-theme="light">
      <div className="guia-shell">
        <GuiaSidebar />
        <main className="guia-main">
          <div className="guia-doc">{children}</div>
        </main>
      </div>
    </div>
  );
}
