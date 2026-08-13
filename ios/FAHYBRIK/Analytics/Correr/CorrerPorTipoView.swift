import SwiftUI

// POR TIPO — ¿mejoras en lo que entrenas? (mapa v2, el agujero nº1).
//
// EL CHIP ES LA NAVEGACIÓN: activas un tipo y la pantalla entera responde solo
// por él — su progresión, su mejor salida y todas sus sesiones, cada una
// entrando a su ficha. Los chips son los tipos REALES del atleta (los sirve el
// historial); un tipo sin sesiones no existe como chip.
//
// HONESTIDAD: con menos de tres sesiones no se dibuja progresión — una línea
// de dos puntos es una conclusión inventada. Las sesiones se listan igual.

struct CorrerPorTipoView: View {
    let bearer: String?

    /// El slug activo. Nace nulo y se fija al primer tipo real en cuanto el
    /// historial contesta.
    @State private var tipo: String? = nil
    @State private var historial: HistorialDeCorrer?
    @State private var fallo = false
    @State private var ficha: WorkoutLaunch? = nil

    /// Progresión con menos de esto no se afirma.
    private static let sesionesParaLinea = 3

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                if let historial {
                    if historial.tipos.isEmpty {
                        RedesignEmptyState(
                            symbol: "figure.run",
                            title: "Aún sin tipos que comparar",
                            message: "Cuando tus entrenos lleven estructura —series, rodajes, cuestas— cada tipo se lee aquí por separado.",
                            exit: .explained(note: "Los pone tu coach al prescribir; la app los reconoce sola.")
                        )
                    } else {
                        chips(historial.tipos)
                        contenido(historial)
                    }
                } else if fallo {
                    RedesignEmptyState(
                        symbol: "arrow.clockwise",
                        title: "No pudimos cargar tus tipos",
                        message: "Revisa tu conexión e inténtalo de nuevo.",
                        exit: .action(title: "Reintentar") { Task { await cargar() } }
                    )
                } else {
                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(0..<3, id: \.self) { _ in AnalyticsSkeletonCard() }
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background)
        .navigationTitle("Por tipo")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(bearer ?? "")|\(tipo ?? "")") {
            await cargar()
        }
        .fullScreenCover(item: $ficha) { launch in
            ExecutedWorkoutView(
                assignmentId: launch.assignmentId,
                fallbackTitle: launch.title,
                bearer: bearer,
                onClose: { ficha = nil }
            )
        }
    }

    private func cargar() async {
        guard let bearer else { return }
        fallo = false
        do {
            // La ventana es TODO a propósito: la pregunta del tipo es «¿voy
            // más rápido que hace meses?», y un mes solo no la contesta.
            let respuesta = try await CorrerService.fetchHistorial(ventana: .todo, tipo: tipo, bearer: bearer)
            historial = respuesta
            // El primer tipo real manda al aterrizar (sin filtro el servidor
            // lista todos los tipos; el contenido de abajo pide uno).
            if tipo == nil { tipo = respuesta.tipos.first?.slug }
        } catch {
            if historial == nil { fallo = true }
        }
    }

    // MARK: - Los chips

    private func chips(_ tipos: [TipoDeCorrer]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(tipos) { t in
                    let activo = t.slug == tipo
                    Button {
                        guard !activo else { return }
                        Haptics.light()
                        withAnimation(.easeInOut(duration: 0.16)) { tipo = t.slug }
                    } label: {
                        HStack(spacing: 4) {
                            Text(t.labelEs)
                                .font(.system(size: 12, weight: .heavy))
                            Text("\(t.count)")
                                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                                .foregroundStyle(activo ? Theme.Color.accentOn.opacity(0.7) : Theme.Color.faint)
                        }
                        .foregroundStyle(activo ? Theme.Color.accentOn : Theme.Color.muted)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(activo ? Theme.Color.accent : Theme.Color.surfaceElevated)
                        .overlay(Capsule().stroke(activo ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
                        .clipShape(Capsule())
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityAddTraits(activo ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    // MARK: - El contenido del tipo activo

    @ViewBuilder
    private func contenido(_ historial: HistorialDeCorrer) -> some View {
        let filas = historial.weeks.flatMap(\.rows)
        let nombre = historial.tipos.first { $0.slug == tipo }?.labelEs ?? "este tipo"

        VStack(alignment: .leading, spacing: 48) {
            progresion(filas, nombre: nombre)
            mejorSesion(filas)
            sesiones(filas)
        }
    }

    /// LA PREGUNTA DEL TIPO: la línea del ritmo, sesión a sesión. Cronológica
    /// (el historial llega de reciente a antiguo; aquí se invierte).
    @ViewBuilder
    private func progresion(_ filas: [CarreraDelHistorial], nombre: String) -> some View {
        let puntos = filas
            .compactMap { fila -> PuntoSemana? in
                guard let ritmo = fila.ritmoSKm else { return nil }
                return PuntoSemana(semana: fila.fecha, valor: ritmo)
            }
            .reversed()
        if puntos.count >= Self.sesionesParaLinea {
            let primeras = Array(puntos.prefix(3)).map(\.valor)
            let ultimas = Array(puntos.suffix(3)).map(\.valor)
            let gana = (primeras.reduce(0, +) / Double(primeras.count))
                - (ultimas.reduce(0, +) / Double(ultimas.count))
            BloqueDeLectura(etiqueta: "¿Vas más rápido en \(nombre.lowercased())?") {
                if let ultimo = puntos.last {
                    CifraDeBloque(valor: Formato.ritmo(ultimo.valor, .porKm),
                                  unidad: "última", tam: 44) {
                        if abs(gana) >= 1 {
                            DeltaDeBloque(mejor: gana > 0,
                                          valor: "\(Int(abs(gana).rounded())) s",
                                          ventana: "3 primeras vs 3 últimas")
                        }
                    }
                }
                LineaDeProgreso(puntos: Array(puntos), formato: { Formato.clock($0) })
            }
        } else if !filas.isEmpty {
            Text("Con unas cuantas más te digo si mejoras: una línea de \(filas.count == 1 ? "una sesión" : "\(filas.count) sesiones") sería inventarse la respuesta.")
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// La más rápida en ritmo bruto — la salida que el atleta recuerda.
    @ViewBuilder
    private func mejorSesion(_ filas: [CarreraDelHistorial]) -> some View {
        let mejor = filas
            .filter { $0.ritmoSKm != nil }
            .min { ($0.ritmoSKm ?? .infinity) < ($1.ritmoSKm ?? .infinity) }
        if let mejor {
            BloqueDeLectura(etiqueta: "Tu mejor salida") {
                fila(mejor, destacada: true)
            }
        }
    }

    @ViewBuilder
    private func sesiones(_ filas: [CarreraDelHistorial]) -> some View {
        if !filas.isEmpty {
            BloqueDeLectura(etiqueta: "Todas") {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    ForEach(filas) { f in
                        fila(f, destacada: false)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func fila(_ f: CarreraDelHistorial, destacada: Bool) -> some View {
        let cuerpo = HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Text(FechaES.corta(f.fecha) ?? f.fecha)
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.Color.faint)
                .frame(width: 46, alignment: .leading)
            Text(f.dosisLabel ?? tituloDeFila(f))
                .scaledFont(12, weight: destacada ? .heavy : .bold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            if f.record {
                Image(systemName: "star.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Theme.Color.warning)
                    .accessibilityLabel("Récord")
            }
            Spacer(minLength: Theme.Spacing.s)
            if let ritmo = f.ritmoSKm {
                Text(Formato.ritmo(ritmo, .porKm))
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
            }
            if f.assignmentId != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .contentShape(Rectangle())

        if let assignmentId = f.assignmentId {
            Button {
                Haptics.light()
                ficha = WorkoutLaunch(assignmentId: assignmentId, title: f.dosisLabel ?? tituloDeFila(f))
            } label: { cuerpo }
            .buttonStyle(PressScaleStyle())
        } else {
            cuerpo
        }
    }

    private func tituloDeFila(_ f: CarreraDelHistorial) -> String {
        if let slug = f.tipoSlug,
           let nombre = PrescriptionScheme(canonicalizing: slug)?.nombreEs { return nombre }
        return f.origen == "imported" ? "Del reloj" : "Carrera"
    }
}
