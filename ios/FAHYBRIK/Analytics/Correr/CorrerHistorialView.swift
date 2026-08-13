import SwiftUI

// TUS CARRERAS — el historial de running DENTRO de la pastilla (mapa v2, P1).
//
// Arquetipo Lista (§6.2): el sujeto es el conjunto y su estado de un vistazo —
// los kilómetros del periodo y sus salidas—, los filtros se pliegan, y cada
// fila ENTRA a la ficha real de esa sesión. Las semanas agrupan con subtotal,
// que es como un corredor recuerda («la semana de los 47»).
//
// HONESTIDAD: una importada no lleva punto de veredicto (nadie le pidió nada);
// una fila sin assignment no navega todavía y no finge que sí. El vacío por
// filtro no es el vacío de verdad: con carreras pero cero coincidencias se
// dice «sin coincidencias» y el filtro queda a mano para cambiarlo.

struct CorrerHistorialView: View {
    let bearer: String?

    @State private var ventana: VentanaCorrer = .mes
    /// Slug del tipo activo; nulo = todos. El servidor recalcula los agregados
    /// sobre el filtro — la cifra de arriba siempre habla de lo que se lista.
    @State private var tipo: String? = nil
    @State private var filtroAbierto = false

    @State private var historial: HistorialDeCorrer?
    @State private var fallo = false
    /// La ficha de una fila — el MISMO destino que ya abren los drills (#27).
    @State private var ficha: WorkoutLaunch? = nil

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                selectorDeVentana
                if let historial {
                    agregados(historial.aggregates)
                    filtroDeTipo(historial.tipos)
                    contenido(historial)
                } else if fallo {
                    RedesignEmptyState(
                        symbol: "arrow.clockwise",
                        title: "No pudimos cargar tus carreras",
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
        .navigationTitle("Tus carreras")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(bearer ?? "")|\(ventana.rawValue)|\(tipo ?? "")") {
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
            historial = try await CorrerService.fetchHistorial(ventana: ventana, tipo: tipo, bearer: bearer)
        } catch {
            if historial == nil { fallo = true }
        }
    }

    // MARK: - La ventana (7 d · Mes · Año · Todo)

    private var selectorDeVentana: some View {
        HStack(spacing: 4) {
            ForEach(VentanaCorrer.allCases) { v in
                let activa = v == ventana
                Button {
                    guard !activa else { return }
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.16)) { ventana = v }
                } label: {
                    Text(v.label)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(activa ? Theme.Color.accentOn : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .background(activa ? Theme.Color.accent : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Periodo \(v.label)")
                .accessibilityAddTraits(activa ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(3)
        .background(Theme.Color.surfaceSunken)
        .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
        .clipShape(Capsule())
    }

    // MARK: - Los agregados — el sujeto, recalculado sobre lo visible

    private func agregados(_ agg: AgregadosDeCorrer) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            CifraDeBloque(valor: Formato.esDecimal(agg.km, decimals: agg.km >= 100 ? 0 : 1),
                          unidad: "km", tam: 44)
            HStack(spacing: Theme.Spacing.xl) {
                DatoDePuerta(valor: "\(agg.salidas)",
                             unidad: agg.salidas == 1 ? "salida" : "salidas")
                DatoDePuerta(valor: Formato.clock(agg.seconds), unidad: "tiempo")
                if let desnivel = agg.elevationM, desnivel > 0 {
                    DatoDePuerta(valor: "\(Int(desnivel.rounded())) m", unidad: "desnivel")
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - El filtro por tipo — plegado (§6.2: los filtros se pliegan)

    @ViewBuilder
    private func filtroDeTipo(_ tipos: [TipoDeCorrer]) -> some View {
        // Sin dos tipos reales no hay nada que filtrar y el control no existe.
        if tipos.count > 1 || tipo != nil {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Button {
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.16)) { filtroAbierto.toggle() }
                } label: {
                    HStack(spacing: 5) {
                        Text(etiquetaDelFiltro(tipos))
                            .scaledFont(12, weight: .semibold, relativeTo: .caption)
                        Image(systemName: filtroAbierto ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(Theme.Color.muted)
                }
                .buttonStyle(PressScaleStyle())

                if filtroAbierto {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            chipDeTipo(slug: nil, label: "Todos", count: nil)
                            ForEach(tipos) { t in
                                chipDeTipo(slug: t.slug, label: t.labelEs, count: t.count)
                            }
                        }
                    }
                }
            }
        }
    }

    private func etiquetaDelFiltro(_ tipos: [TipoDeCorrer]) -> String {
        guard let tipo, let activo = tipos.first(where: { $0.slug == tipo }) else {
            return "Todos los tipos"
        }
        return activo.labelEs
    }

    private func chipDeTipo(slug: String?, label: String, count: Int?) -> some View {
        let activo = slug == tipo
        return Button {
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.16)) { tipo = slug }
        } label: {
            HStack(spacing: 4) {
                Text(label)
                    .font(.system(size: 12, weight: .heavy))
                if let count {
                    Text("\(count)")
                        .font(.system(size: 11, weight: .semibold).monospacedDigit())
                        .foregroundStyle(activo ? Theme.Color.accentOn.opacity(0.7) : Theme.Color.faint)
                }
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

    // MARK: - Las semanas

    @ViewBuilder
    private func contenido(_ historial: HistorialDeCorrer) -> some View {
        if historial.weeks.isEmpty {
            if tipo != nil {
                // HAY carreras pero el filtro no coincide: mensaje en línea, el
                // cromo se queda — la salida es cambiar el filtro, no irse.
                Text("Ninguna salida de este tipo en el periodo.")
                    .scaledFont(13, weight: .medium, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.top, Theme.Spacing.l)
            } else {
                RedesignEmptyState(
                    symbol: "figure.run",
                    title: "Aún no hay carreras",
                    message: "Tu historial de running vive aquí.",
                    exit: .explained(note: "Corre con la app —o conecta Salud— y cada salida aparece sola.")
                )
            }
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.xxl) {
                ForEach(historial.weeks) { semana in
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(tituloDeSemana(semana.monday))
                                .font(Theme.Typography.readoutLabel)
                                .uppercaseTracked(1.98)
                                .foregroundStyle(Theme.Color.muted)
                            Spacer(minLength: Theme.Spacing.s)
                            Text("\(Formato.esDecimal(semana.km, decimals: 1)) km")
                                .font(.system(size: 12, weight: .bold).monospacedDigit())
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                            ForEach(semana.rows) { fila in
                                filaDelHistorial(fila)
                            }
                        }
                    }
                }
            }
        }
    }

    private func tituloDeSemana(_ lunes: String) -> String {
        if let corta = FechaES.corta(lunes) { return "Semana del \(corta)" }
        return "Semana"
    }

    @ViewBuilder
    private func filaDelHistorial(_ fila: CarreraDelHistorial) -> some View {
        if let assignmentId = fila.assignmentId {
            Button {
                Haptics.light()
                ficha = WorkoutLaunch(assignmentId: assignmentId, title: tituloDeFila(fila))
            } label: {
                FilaDelHistorialCuerpo(fila: fila, titulo: tituloDeFila(fila), navega: true)
            }
            .buttonStyle(PressScaleStyle())
        } else {
            // Una importada sin assignment aún no tiene ficha que abrir. Se
            // lista igual —sus kilómetros son tan reales como los demás— y no
            // finge una puerta que no existe.
            FilaDelHistorialCuerpo(fila: fila, titulo: tituloDeFila(fila), navega: false)
        }
    }

    private func tituloDeFila(_ fila: CarreraDelHistorial) -> String {
        if let dosis = fila.dosisLabel, !dosis.isEmpty { return dosis }
        if let slug = fila.tipoSlug,
           let nombre = PrescriptionScheme(canonicalizing: slug)?.nombreEs { return nombre }
        return fila.origen == "imported" ? "Del reloj" : "Carrera"
    }
}

// MARK: - La fila

private struct FilaDelHistorialCuerpo: View {
    let fila: CarreraDelHistorial
    let titulo: String
    let navega: Bool

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            Text(FechaES.corta(fila.fecha) ?? fila.fecha)
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.Color.faint)
                .frame(width: 46, alignment: .leading)

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: Theme.Spacing.s) {
                    Text(titulo)
                        .scaledFont(12, weight: .bold, relativeTo: .caption)
                        .tracking(0.96)
                        .textCase(.uppercase)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if fila.record {
                        // La estrella del récord: dato, no adorno — la sesión
                        // dejó una marca del catálogo.
                        Image(systemName: "star.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(Theme.Color.warning)
                            .accessibilityLabel("Récord")
                    }
                }
                HStack(spacing: Theme.Spacing.m) {
                    if let distancia = Formato.distanciaCubierta(fila.km * 1000) {
                        Text(distancia)
                            .font(.system(size: 12, weight: .bold).monospacedDigit())
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    if let ritmo = fila.ritmoSKm {
                        Text(Formato.ritmo(ritmo, .porKm))
                            .font(.system(size: 12, weight: .semibold).monospacedDigit())
                            .foregroundStyle(Theme.Color.muted)
                    }
                    if let fc = fila.fcMedia {
                        Text("\(Int(fc.rounded())) \(Vocab.ppm)")
                            .font(.system(size: 12, weight: .semibold).monospacedDigit())
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
            }

            Spacer(minLength: Theme.Spacing.s)

            if let veredicto = fila.veredicto {
                Circle()
                    .fill(veredicto == "ok" ? Theme.Color.ok : Theme.Color.warning)
                    .frame(width: 7, height: 7)
                    .accessibilityLabel(veredicto == "ok" ? "Dentro de lo pedido" : "Fuera de lo pedido")
            }
            if navega {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
