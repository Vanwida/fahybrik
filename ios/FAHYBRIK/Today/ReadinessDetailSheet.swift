import SwiftUI

// El detalle de la disposición — la hoja que abre «Cómo llegas hoy» en Hoy. Estándar de mercado (Whoop /
// Oura): la cifra → qué la explica → la tendencia → una acción. Cada valor es REAL (sale del cálculo) o un
// honesto «Sin dato aún»; nada se inventa. Es una hoja del día (`MarcoDeHojaDia`): título, cierre de 48 pt, el
// cuerpo que scrollea y la acción del check-in anclada abajo. Las zonas salen de las bandas de SU coach
// (`payload.bands`); aquí no hay un solo corte escrito.
struct ReadinessDetailSheet: View {
    /// Today's readiness payload (score + breakdown + 7-day trend) — read LIVE
    /// from the store by the presenter, so a check-in made from here refreshes it.
    let payload: DailyReadinessPayload
    /// Whether the plan has a session scheduled today — drives the guidance line.
    let hasSessionToday: Bool
    /// Whether TODAY's check-in is already done (device-local truth) — drives the
    /// check-in row + CTA copy ("Editar" vs "Hacer").
    let checkinDone: Bool
    let bearer: String?
    /// Drives the hero-ring entrance animation. True in the app (gated by
    /// reduce-motion inside the ring); snapshots pass false for a deterministic final frame.
    var animateRing: Bool = true
    /// A check-in submitted from here → the presenter clears the pending flag
    /// immediately (device-local truth; dismissal never waits on the network).
    let onCheckinSubmitted: () -> Void
    /// Fires once the server has the check-in — the presenter refetches
    /// readiness HERE (refetching in `onCheckinSubmitted` raced the in-flight
    /// POST and pulled the old score). Same contract as CheckinView.
    var onCheckinServerSynced: () async -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @State private var showCheckin = false

    private var zone: ReadinessZone { ReadinessZone.of(payload) }
    private var contribuyentes: [Contribuyente] {
        Contribuyente.all(from: payload.breakdown, bands: payload.bands, checkinDone: checkinDone)
    }
    private var trend: [ReadinessTrendPoint] { payload.trend ?? [] }
    private var ctaTitle: String {
        checkinDone ? "Editar el check-in de hoy" : "Hacer el check-in de hoy"
    }

    var body: some View {
        MarcoDeHojaDia("¿Cómo llegas hoy?", cerrar: { dismiss() }) {
            cuerpo
        } accion: {
            // Sin hacer, el check-in es lo que afina la cifra («haz esto ahora»); hecho, es una edición.
            BotonAccionDia(
                ctaTitle, glifo: .lapiz, relleno: checkinDone ? .tinta : .acento, completa: true,
                alto: Theme.Size.accionAnclada, glifoAlFinal: false, impacto: .medio
            ) { showCheckin = true }
        }
        .presentationDetents([.large])
        .sheet(isPresented: $showCheckin) {
            CheckinView(
                bearer: bearer,
                onSubmitted: { _, _ in
                    showCheckin = false
                    onCheckinSubmitted()
                },
                onSkipped: { showCheckin = false },
                onServerSynced: onCheckinServerSynced
            )
        }
    }

    // MARK: - El cuerpo

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            Text("\(Self.longDate(payload.recordedFor)) · calculado con tus datos de anoche")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
            hero
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Qué lo explica")
                ListaDia {
                    ForEach(contribuyentes) { c in
                        FilaDeContribuyente(
                            contribuyente: c,
                            alTocar: c.isAction ? { Haptics.light(); showCheckin = true } : nil
                        )
                    }
                }
            }
            if trend.count >= 2 {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia("Últimos 7 días") {
                        if let chip = Self.deltaChip(trend) { InfoPill(text: chip, estilo: .velo) }
                    }
                    TendenciaDeSiete(puntos: trend)
                }
            }
            Text("Los datos llegan de Apple Salud. El check-in manual también cuenta.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }

    /// El anillo con el estado del cuerpo y una línea de guía. El color de la zona va en el arco y nunca en la
    /// cifra ni en las frases: la hoja dice cómo está el cuerpo, no da un veredicto.
    private var hero: some View {
        VStack(spacing: Theme.Spacing.m) {
            RecoveryRing(
                value: payload.score, size: 120, stroke: 10, color: zone.color, animado: animateRing,
                etiqueta: "Readiness \(payload.score) de 100"
            )
            Text(zone.interpretation)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text(zone.guidance(hasSessionToday: hasSessionToday))
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity)
        .tarjetaDia(alAncho: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Readiness \(payload.score) de 100, \(zone.interpretation). "
            + zone.guidance(hasSessionToday: hasSessionToday)
        )
    }
}
