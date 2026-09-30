import SwiftUI

// UN EJERCICIO EN LA FICHA PREVIA — la tabla por series, la tarjeta de una línea y el acceso a la técnica.
// Qué forma toma cada ítem y qué dice lo decide `LecturaEjercicioPrevia`; aquí solo se pinta.

/// Un ítem suelto de un bloque principal, con la forma que le toca.
struct EjercicioPrevia: View {
    let item: WorkoutItem
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        switch LecturaEjercicioPrevia.forma(de: item) {
        case .tablaDeSeries: TablaDeSeriesPrevia(item: item, alAbrirTecnica: alAbrirTecnica)
        case .tarjeta:       TarjetaDeEjercicioPrevia(item: item, alAbrirTecnica: alAbrirTecnica)
        }
    }
}

// MARK: - Tabla por series

/// Serie, trabajo, carga, tempo y descanso. Si todas las series son iguales, una línea («4 × 5 · 120 kg»).
struct TablaDeSeriesPrevia: View {
    let item: WorkoutItem
    let alAbrirTecnica: (WorkoutItem) -> Void

    private var filas: [PrescriptionRenderer.SetRow] {
        item.prescription.flatMap { PrescriptionRenderer.setRows($0) } ?? []
    }

    /// Series iguales: una sola línea en vez de una tabla que repite lo mismo.
    private var resumen: String? {
        guard let p = item.prescription, PrescriptionRenderer.setsAreUniform(p) else { return nil }
        return PrescriptionRenderer.collapsedSetsLabel(p)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            FilaAdaptablePrevia {
                Text(item.exerciseName)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            } derecha: {
                BotonTecnicaPrevia(item: item, alAbrir: alAbrirTecnica)
            }
            if let resumen {
                Text(resumen)
                    .papel(.seccion)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            } else if !filas.isEmpty {
                // En una fila la tabla; si con el texto grande no cabe, cada serie en su línea.
                ViewThatFits(in: .horizontal) {
                    rejilla
                    lista
                }
            }
            // La carga en kg según TU 1RM (el %RM de la línea por tu marca). Solo si el servidor la resolvió.
            if let carga = item.resolvedLoad {
                FilaAdaptablePrevia {
                    Text("Según tu 1RM").papel(.rotulo).foregroundStyle(Theme.Color.muted)
                } derecha: {
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        Text(carga.kgLabel).papel(.cuerpoFuerte).monospacedDigit().foregroundStyle(Theme.Color.foreground)
                        if carga.needsReview {
                            Text("sin confirmar").papel(.nota).foregroundStyle(Theme.Color.muted)
                        }
                    }
                }
                .padding(.top, Theme.Spacing.m)
                .overlay(alignment: .top) { Hairline() }
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaPrevia()
    }

    private var conTempo: Bool { filas.contains { $0.tempo != nil } }
    private var conDescanso: Bool { filas.contains { $0.rest != nil } }

    /// Las columnas se miden por su contenido (`Grid`), no a ojo: a 15 pt «Tempo» ya no cabe en 64.
    private var rejilla: some View {
        Grid(alignment: .leading, horizontalSpacing: Theme.Spacing.m, verticalSpacing: Theme.Spacing.s) {
            GridRow {
                cabecera("Serie")
                cabecera("Reps")
                cabecera("Carga")
                if conTempo { cabecera("Tempo") }
                if conDescanso { cabecera("Desc.") }
            }
            ForEach(filas) { fila in
                GridRow {
                    celda("\(fila.index)", color: Theme.Color.muted)
                    celda(fila.work)
                    celda(fila.load)
                    if conTempo { celda(fila.tempo, color: Theme.Color.muted) }
                    if conDescanso { celda(fila.rest, color: Theme.Color.muted) }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .fixedSize()
    }

    /// Cada serie en una línea: «Serie 1 · 5 reps · 120 kg · tempo 3-1-1 · desc. 2:00».
    private var lista: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            ForEach(filas) { fila in
                VStack(alignment: .leading, spacing: 2) {
                    Text("Serie \(fila.index)").papel(.rotulo).foregroundStyle(Theme.Color.muted)
                    Text([fila.work, fila.load, fila.tempo.map { "tempo \($0)" }, fila.rest.map { "desc. \($0)" }]
                        .compactMap { $0 }
                        .joined(separator: " · "))
                        .papel(.cuerpoFuerte)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func cabecera(_ texto: String) -> some View {
        Text(texto).papel(.rotulo).foregroundStyle(Theme.Color.muted)
    }

    /// Una celda. Si esa serie no declara el campo, la celda queda VACÍA: la columna sigue alineada, pero un
    /// guion se leería como si fuera el valor (§7).
    private func celda(_ texto: String?, color: Color = Theme.Color.foreground) -> some View {
        Text(texto ?? "").papel(.cuerpoFuerte).monospacedDigit().foregroundStyle(color)
    }
}

// MARK: - Tarjeta de una línea

/// Correr, ergo, funcional, un movimiento suelto: el nombre, la medida grande, el ritmo o la zona y el pie.
struct TarjetaDeEjercicioPrevia: View {
    let item: WorkoutItem
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        let t = LecturaEjercicioPrevia.tarjeta(de: item)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            FilaAdaptablePrevia {
                Text(item.exerciseName)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            } derecha: {
                if let zona = t.zona { PastillaZonaPrevia(zona: zona) }
            }
            if t.cabeza != nil || t.ritmo != nil {
                FilaAdaptablePrevia(alineacion: .lastTextBaseline) {
                    if let cabeza = t.cabeza {
                        Text(cabeza)
                            .papel(.dato)
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } derecha: {
                    if let ritmo = t.ritmo {
                        Text(ritmo).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
                    }
                }
            }
            if let pie = t.pie {
                Text(pie)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            BotonTecnicaPrevia(item: item, alAbrir: alAbrirTecnica)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaPrevia()
    }
}

// MARK: - El acceso a la técnica

/// «Ver técnica»: abre la ficha del ejercicio (vídeo, consejos, descripción y nota del coach). Solo existe
/// si hay algo de eso; con vídeo lleva el play y sin él la «i».
struct BotonTecnicaPrevia: View {
    let item: WorkoutItem
    let alAbrir: (WorkoutItem) -> Void

    var body: some View {
        if LecturaEjercicioPrevia.tieneTecnica(item) {
            Button {
                Haptics.light()
                alAbrir(item)
            } label: {
                HStack(spacing: Theme.Spacing.xs + 2) {
                    Image(systemName: LecturaEjercicioPrevia.tieneVideo(item) ? "play.circle.fill" : "info.circle.fill")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text("Ver técnica").papel(.notaFuerte).foregroundStyle(Theme.Color.foreground)
                }
                .frame(minHeight: Theme.Size.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(LecturaEjercicioPrevia.etiquetaDeTecnica(item))
            .accessibilityAddTraits(.isButton)
        }
    }
}
