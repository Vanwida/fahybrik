import SwiftUI

// EL DETALLE DE UNA CARRERA — la pantalla detrás de una próxima (o de «Ver mi camino» en el póster).
// Responde a «¿dónde estoy contra ESTA carrera?». Arquetipo «Detalle» (CONTRATO-UI §6.2): arriba de
// qué carrera es (papel, cuenta atrás, fecha, lugar, categoría y la meta), el SUJETO es su predicho de
// hoy y el hueco se gana con el camino tramo a tramo y de dónde sale el número.
//
// La decisión (qué sujeto, qué se dice, si hay camino) es de `DecideDetalleCarrera`, pura y probada; y
// lo que se DICE del predicho es lo mismo que dice el póster (`TextosCarreras`). Esta vista pide el
// goal-gap del principal HYROX y pinta. El comportamiento es el de siempre: mismos servicios, mismos
// destinos (fijar la meta en su hoja, hacerla principal con el flujo de la pestaña y volver).
struct RaceDetailView: View {
    let race: UpcomingRace
    /// Es el principal: el ÚNICO al que se refiere el goal-gap. Lo calcula la pestaña una vez.
    let isTargetRace: Bool
    var bearer: String? = nil
    /// Hacer principal una secundaria (la pestaña hace el POST y refresca); aquí se llama y se vuelve.
    var onMakePrimary: () -> Void = {}

    @Environment(\.dismiss) private var dismiss

    @State private var gap: EstadoGapDetalle = .pidiendo
    /// «Fija tu tiempo objetivo» → la hoja de la meta de ESTA carrera.
    @State private var hojaMeta = false
    /// Las pruebas y las `#Preview` fijan el estado y no piden nada a la red.
    private var fijo = false

    init(race: UpcomingRace, isTargetRace: Bool, bearer: String? = nil, onMakePrimary: @escaping () -> Void = {}) {
        self.race = race
        self.isTargetRace = isTargetRace
        self.bearer = bearer
        self.onMakePrimary = onMakePrimary
    }

    private var hoy: String { FechaES.iso(Date()) }

    private var sujeto: SujetoDetalleCarrera {
        DecideDetalleCarrera.sujeto(race, esPrincipal: isTargetRace, gap: gap, hoy: hoy)
    }

    var body: some View {
        MarcoDeDetalleCarreras {
            cabecera
            contenido
        }
        .sheet(isPresented: $hojaMeta) {
            FijarTiempoObjetivoSheet(race: race, bearer: bearer) {
                Task { await cargar() }
            }
        }
        .task(id: bearer) {
            guard !fijo else { return }
            if DecideDetalleCarrera.pideGap(race, esPrincipal: isTargetRace) { await cargar() }
        }
    }

    private func cargar() async {
        // Revalidar no vuelve al esqueleto: lo bueno se queda hasta que llega lo nuevo.
        if case .listo = gap {} else { gap = .pidiendo }
        if let nuevo = await GoalGapService.fetchGoalGap(bearer: bearer) {
            gap = .listo(nuevo)
        } else if case .listo = gap {
            // Un fallo al refrescar no pisa un predicho bueno.
        } else {
            gap = .fallo
        }
    }

    // MARK: Cabecera

    private var cabecera: some View {
        CabeceraDetalleCarreras(
            etiqueta: DecideDetalleCarrera.etiqueta(race, esPrincipal: isTargetRace, hoy: hoy),
            etiquetaEnAcento: isTargetRace,
            titulo: race.name,
            lineas: DecideDetalleCarrera.lineas(race, hoy: hoy)
        ) {
            if let meta = DecideDetalleCarrera.meta(race) {
                ChipCarreras("Objetivo \(meta)", estilo: .acento) { IconoDia(.cronometro, tam: 16) }
                    .padding(.top, Theme.Spacing.xs)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: El sujeto y lo que lo explica

    @ViewBuilder
    private var contenido: some View {
        switch sujeto {
        case .dobles:
            // El predicho conjunto de la pareja, con su reparto y sus consejos: se pide él solo.
            DoblesRaceGapSection(raceId: String(race.raceId), bearer: bearer)
        case .cargando:
            EsqueletoSujetoCarreras(voz: "Calculando tu predicho")
            EsqueletoCaminoCarreras()
        case .error:
            SujetoDia(
                tono: .peligro,
                etiqueta: "No pudimos cargar tu predicho. Revisa tu conexión e inténtalo de nuevo.",
                anuncia: true
            ) {
                KickerDia("Predicho hoy")
                Text("No pudimos cargar tu predicho").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                ApoyoDia("Revisa tu conexión e inténtalo de nuevo.")
            } abajo: {
                Button { Task { await cargar() } } label: { AccionDia("Reintentar", glifo: .reintentar) }
                    .buttonStyle(PressScaleStyle(escala: 0.96))
            }
        case .sinMeta:
            SujetoDia(
                tono: .acento,
                etiqueta: "Fija un tiempo objetivo. Cuando elijas a qué tiempo vas verás aquí tu predicho de hoy y el camino estación a estación.",
                alTocar: { hojaMeta = true }
            ) {
                KickerDia("Tu objetivo")
                Text("Fija un tiempo objetivo").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                ApoyoDia("Aún no has fijado a qué tiempo vas en esta carrera. Cuando elijas tu objetivo —sub-60, sub-70…— verás aquí tu predicho de hoy y el camino estación a estación.")
            } abajo: {
                AccionDia("Elegir mi objetivo")
            }
        case .predicho(let texto):
            sujetoPredicho(texto)
            if let camino = DecideDetalleCarrera.camino(gap) {
                SeccionDeDetalleCarreras("Camino al objetivo") { GoalGapBoard(gap: camino) }
                NotaDeDetalleCarreras(
                    "Después de la carrera",
                    texto: "Tu predicho se congela justo antes de la prueba. Cuando importes tu resultado lo compararás con lo que hiciste de verdad —predicho contra real— para afinar la siguiente."
                ) { IconoCarreras(.bandera, tam: 18) }
            }
        case .secundaria:
            SujetoDia(
                tono: .acento,
                etiqueta: "El predicho se calcula para tu objetivo principal. Haz de esta carrera tu objetivo principal y verás aquí tu predicho de hoy y el camino estación a estación.",
                alTocar: hacerPrincipal
            ) {
                KickerDia("Predicho hoy")
                Text("Se calcula para tu objetivo principal").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                ApoyoDia("Haz de esta carrera tu objetivo principal y verás aquí tu predicho de hoy y el camino estación a estación.")
            } abajo: {
                AccionDia("Hacerla objetivo principal")
            }
        case .noHyrox(let metaS):
            let meta = metaS.flatMap(Formato.metaDeCarrera)
            SujetoDia(
                tono: .acento,
                etiqueta: [
                    "Tu objetivo", meta ?? "Sin tiempo objetivo",
                    "Para este formato el plan se ancla a la fecha y al tipo de competición. El desglose por estaciones solo está disponible en HYROX.",
                ].joined(separator: ". "),
                alTocar: { hojaMeta = true }
            ) {
                KickerDia("Tu objetivo")
                if let meta {
                    TituloDia(meta)
                } else {
                    Text("Sin tiempo objetivo").papel(.seccion).foregroundStyle(Theme.Color.foreground)
                }
                ApoyoDia("Para este formato el plan se ancla a la fecha y al tipo de competición. El desglose por estaciones solo está disponible en HYROX.")
            } abajo: {
                AccionDia(meta == nil ? "Fijar tiempo objetivo" : "Cambiar tiempo objetivo")
            }
        }
    }

    private func hacerPrincipal() {
        onMakePrimary()
        dismiss()
    }

    /// El predicho como sujeto: la cifra a tamaño de sujeto si la hay; si no, la frase corta que ocupa
    /// su sitio (nunca un número que no existe). Debajo, cuánto te falta o cuánto llevas de margen, la
    /// regleta de tramos medidos si es parcial, y de dónde sale el número.
    private func sujetoPredicho(_ texto: TextoPredicho) -> some View {
        let origen: String? = {
            guard case .listo(let g) = gap else { return nil }
            return DecideDetalleCarrera.origen(g)
        }()
        return SujetoDia(
            tono: texto.valorEsCifra ? .acento : .neutro,
            etiqueta: [TextosCarreras.vozPredicho(texto), origen].compactMap { $0 }.joined(separator: ". ")
        ) {
            KickerDia(texto.etiqueta)
            if let valor = texto.valor {
                if texto.valorEsCifra {
                    TituloDia(valor).monospacedDigit()
                } else {
                    Text(valor).papel(.seccion).foregroundStyle(Theme.Color.foreground)
                }
            }
            if let regleta = texto.regleta {
                RegletaDia(n: regleta.n, de: regleta.de)
            }
            if let frase = texto.frase {
                FraseConMarcaCarreras(frase: frase, marca: texto.marca, papel: .cuerpoFuerte)
            }
        } abajo: {
            if let origen {
                Text(origen)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// El esqueleto del camino: la tarjeta con la leyenda y cuatro filas, con la forma de las reales.
struct EsqueletoCaminoCarreras: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m - 2) {
            SkeletonBar(width: 200, height: 24, radius: 7)
            VStack(spacing: 0) {
                SkeletonBar(width: 220, height: 15, radius: 5)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                    .frame(maxWidth: .infinity, alignment: .leading)
                ForEach(0..<4, id: \.self) { _ in
                    Rectangle().fill(Theme.Color.hairline).frame(height: 1)
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        HStack {
                            SkeletonBar(width: 130, height: 17, radius: 6)
                            Spacer(minLength: Theme.Spacing.m)
                            SkeletonBar(width: 52, height: 17, radius: 6)
                        }
                        SkeletonBar(height: GoalGapVis.trackHeight, radius: 7)
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m - 2)
                }
            }
            .tarjetaCarreras()
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Estados de ejemplo (pruebas y `#Preview`)

#if DEBUG
extension RaceDetailView {
    /// El detalle con el goal-gap ya resuelto a `gap`: sin red, para la galería y las pruebas.
    init(race: UpcomingRace, isTargetRace: Bool, gap: EstadoGapDetalle) {
        self.init(race: race, isTargetRace: isTargetRace)
        _gap = State(initialValue: gap)
        fijo = true
    }
}

#Preview("Detalle · camino") {
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.principal(meta: 3600), isTargetRace: true, gap: .listo(.previewSample)) }
}
#Preview("Detalle · camino · club azul") {
    let _ = ClubThemeStore.update(.pruebaAzul)
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.principal(meta: 3600), isTargetRace: true, gap: .listo(.previewSample)) }
}
#Preview("Detalle · sin meta") {
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.principal(meta: nil), isTargetRace: true, gap: .listo(CasosDetalleCarreras.gapSinMeta)) }
}
#Preview("Detalle · cargando") {
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.principal(meta: 3900), isTargetRace: true, gap: .pidiendo) }
}
#Preview("Detalle · error") {
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.principal(meta: 3900), isTargetRace: true, gap: .fallo) }
}
#Preview("Detalle · secundaria") {
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.secundaria, isTargetRace: false, gap: .pidiendo) }
}
#Preview("Detalle · no es HYROX") {
    NavigationStack { RaceDetailView(race: CasosDetalleCarreras.running(meta: 5940), isTargetRace: true, gap: .pidiendo) }
}
#endif
