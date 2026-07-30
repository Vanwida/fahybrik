import SwiftUI

// "Tus marcas" (#Marcas) — the athlete's benchmark library.
//
// Three groups, three origins, one list: the marks the app measures (run · ergo)
// and the races that get registered. Every row shows the best comparable mark,
// how long ago, and where it came from — a coach test and a self-test live
// together, sello included. "Nunca probado" is an invitation, not a sad empty.
//
// ARQUETIPO **Lista** (contrato §6.2), y por tanto ESTRATEGIA `llena` + scroll
// cuando hay catálogo. Los otros tres estados son un **Vacío** y se pintan como
// tal: `CenteredScreen` + `RedesignEmptyState`, centrados y con salida.
//
// Lo que había aquí antes y por qué esto no es un rediseño sino el contrato
// aplicado: si la carga fallaba, `marks` se quedaba vacío, los tres grupos se
// saltaban por su `if !items.isEmpty` SIN `else`, y de toda la pantalla quedaba
// una frase naranja de 13 pt sobre negro y ningún modo de reintentar. Un error
// sin salida (§5). Y las filas pintaban la etiqueta a 16 y el número a 15: el
// dato pesando MENOS que su etiqueta, que es el §4 justo del revés.
struct MarksLibraryView: View {
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    @State private var marks: [MarkView] = []
    @State private var loading = true
    /// No pudimos preguntar. Distinto de «preguntamos y no hay nada»: uno lleva
    /// reintento y el otro no, y confundirlos es lo que dejaba la pantalla muda.
    @State private var failed = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("Tus marcas")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            CenteredScreen {
                ProgressView().tint(Theme.Color.accentText)
            }
        } else if failed {
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "arrow.clockwise",
                    title: "No pudimos cargar tus marcas",
                    message: "Revisa tu conexión e inténtalo de nuevo.",
                    exit: .action(title: "Reintentar") { Task { await load() } }
                )
            }
        } else if marks.isEmpty {
            // Preguntamos y no hay catálogo. No es un hueco que el atleta pueda
            // llenar con ningún acto suyo, así que la salida se explica (§6.2 bis).
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "stopwatch",
                    title: "Todavía no hay marcas",
                    message: "Aquí verás tus mejores tiempos de cada prueba.",
                    exit: .explained(note: "Tu coach define qué pruebas entran, y aparecen aquí en cuanto las publique.")
                )
            }
        } else {
            lista
        }
    }

    private var lista: some View {
        ScrollView {
            MarcasGrupos(marks: marks, bearer: bearer, hrZones: hrZones)
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
        }
        .refreshable { await load() }
    }

    @MainActor
    private func load() async {
        loading = marks.isEmpty
        do {
            marks = try await MarksService.fetchMarks(bearer: bearer).marks
            failed = false
        } catch {
            // Sin respuesta NO se vacía la lista: un fallo de red no puede borrar
            // de la pantalla nueve récords que el atleta tiene. Si nunca llegó a
            // haber lista, la pantalla pasa al error con su reintento.
            failed = marks.isEmpty
        }
        loading = false
    }
}

// MARK: - Los tres grupos

/// Correr · Remo y SkiErg · Carreras, cada uno una tarjeta de filas.
///
/// Vive fuera de `MarksLibraryView` para poder renderizarse en una captura —
/// dentro cuelga de un `ScrollView` e `ImageRenderer` no dibuja ScrollView, el
/// mismo motivo por el que `ResumenSemanaCard` vive fuera de la suya.
struct MarcasGrupos: View {
    let marks: [MarkView]
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            grupo("Correr", items: marks.filter { $0.group == "run" })
            grupo("Remo y SkiErg", items: marks.filter { $0.group == "ergo" })
            grupo("Carreras", items: marks.filter { $0.group == "race" })
        }
    }

    /// Un grupo sin ninguna prueba en el catálogo NO se declara: no es un hueco del
    /// atleta, es que su coach no ha puesto pruebas de ergo. El §6.2 bis manda
    /// callarlo — lo que se declara es lo que él puede llenar.
    @ViewBuilder
    private func grupo(_ title: String, items: [MarkView]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                LabelText(text: title)
                CardSurface(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, mark in
                            NavigationLink {
                                MarkDetailView(
                                    slug: mark.slug,
                                    bearer: bearer,
                                    hrZones: hrZones
                                )
                            } label: {
                                MarcasGrupos.fila(mark)
                            }
                            .buttonStyle(.plain)
                            if index < items.count - 1 {
                                Divider().overlay(Theme.Color.hairline).padding(.leading, 16)
                            }
                        }
                    }
                }
            }
        }
    }

    /// La fila es la compartida (`FilaDato`): con marca, el tiempo manda y la
    /// antigüedad baja a apoyo; sin marca, la prueba pasa a ser el sujeto de su
    /// fila y el subtítulo se convierte en la invitación («Aún sin marca · ~4:00»).
    /// El guion que ocupaba el sitio del número se ha ido: un valor medido no
    /// existe hasta que se mide (§6.2 bis / §7).
    static func fila(_ mark: MarkView) -> some View {
        FilaDato(
            etiqueta: mark.label,
            detalle: mark.best == nil ? nil : sublabel(mark),
            estado: estado(mark),
            acento: color(mark)
        )
    }

    static func estado(_ mark: MarkView) -> EstadoDelDato {
        guard let best = mark.best else {
            return .vacio(invitacion: sublabel(mark))
        }
        return .valor(
            MarkFormat.value(mark, best.value),
            pie: MarkFormat.paceLine(mark, best.value)
        )
    }

    /// "hace 3 semanas · test de tu coach" — recency plus the origin sello when the
    /// mark did not come from the athlete themself.
    static func sublabel(_ mark: MarkView) -> String {
        guard let latest = mark.latest else {
            return mark.measuredBy == "registered" ? "Aún sin tiempo" : "Aún sin marca · \(mark.approxLabel)"
        }
        // La fila pinta el MEJOR resultado, así que la fecha y el sello describen
        // ese, no el último. Antes la fecha era la del último y el número el mejor:
        // con una marca declarada eso pasa de ser una imprecisión a una mentira
        // ("hace 3 días" sobre un número que el atleta declaró hace medio año).
        let shown = mark.best ?? latest
        var parts: [String] = []
        if let rel = MarkFormat.relative(shown.recordedAt) { parts.append(rel) }
        // El sello sale cuando el número NO es una medición propia del atleta:
        // del coach, de una carrera, o declarado al entrar. `athlete_test` es el
        // caso por defecto de esta biblioteca (son tus pruebas) y se deja implícito.
        if shown.source != DataOrigin.athleteTest,
           let origin = DataOrigin.label(shown.source, eventName: shown.eventName) {
            parts.append(origin)
        }
        return parts.isEmpty ? mark.approxLabel : parts.joined(separator: " · ")
    }

    static func color(_ mark: MarkView) -> Color {
        switch mark.group {
        case "run":  return Theme.Color.accent
        case "ergo": return Theme.Color.info
        default:     return Theme.Color.modalityHyrox
        }
    }
}
