import SwiftUI

// AJUSTAR UNA SERIE — la excepción, en su propia hoja.
//
// Movido aquí desde `FuerzaVivoView` sin cambiarle nada: la pantalla del hierro
// pasaba de 900 líneas y el editor con sus tres controles es una pieza aparte que
// no se lee nunca cuando se lee el layout del vivo.

/// UNA identidad de la serie que se está editando.
///
/// `Int` a secas no vale para `.sheet(item:)` —no es `Identifiable`— y envolverlo
/// aquí evita el otro camino, que es un `Bool` de «está abierta» más un índice
/// suelto: dos estados que se pueden contradecir y abrir el editor de la serie
/// equivocada.
struct SerieEnEdicion: Identifiable, Equatable {
    let indice: Int
    var id: Int { indice }
}

/// Lo que sintió se PREGUNTA; no se copia del plan (§7). Por eso RPE y RIR entran
/// vacíos y se pueden dejar sin contestar.
///
/// Vive en una hoja y no en la pantalla porque no cabía: reps + carga + RPE + RIR
/// miden más que la banda de apoyos entera. Y porque ajustar no es el camino
/// normal — el camino normal es un toque en el botón grande.
struct EditorDeSerie: View {
    let session: WorkoutSession
    let indice: Int
    @Environment(\.dismiss) private var dismiss

    private var rec: SetRecord? {
        session.setRecords.indices.contains(indice) ? session.setRecords[indice] : nil
    }

    /// Qué serie estás ajustando. En una rotación, el número global no la identifica
    /// («Serie 7 de 12» no dice de qué ejercicio): la nombra el turno.
    private var cabecera: String {
        if let t = session.currentSegment?.supersetSlot(at: indice) {
            return "\(t.movement) · \(Vocab.ronda.lowercased()) \(t.round) de \(t.rounds)"
        }
        return "\(Vocab.serie) \(rec?.setIndex ?? indice + 1) de \(session.setRecords.count)"
    }

    var body: some View {
        ScrollView {
            if let rec {
                VStack(spacing: Theme.Spacing.m) {
                    HStack {
                        Text(cabecera)
                            .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Spacer()
                        Button("Listo") { dismiss() }
                            .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    // APROXIMACIÓN: el atleta tiene que saber que esta serie es para
                    // llegar al peso, no trabajo. Si no se dice, se la toma como una
                    // serie más y se deja ahí un esfuerzo que no tocaba (card 151).
                    if rec.isApproach {
                        Text("APROXIMACIÓN · subir hasta el peso de trabajo")
                            .scaledFont(12, weight: .heavy, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.accentText)
                    }
                    HStack(spacing: Theme.Spacing.s) {
                        PasoEntero(etiqueta: Vocab.reps,
                                   valor: rec.repsActual ?? rec.repsPrescribed ?? 0,
                                   alCambiar: { session.setSetReps(indice, $0) })
                        PasoDecimal(etiqueta: Vocab.rpe, paso: 0.5, maximo: 10, valor: rec.rpe,
                                    alCambiar: { session.setSetRPE(indice, $0) })
                        PasoDecimal(etiqueta: Vocab.rir, paso: 1, maximo: 10, valor: rec.rir,
                                    alCambiar: { session.setSetRIR(indice, $0) })
                    }
                    if rec.loadPrescribedKg != nil || rec.loadActualKg != nil {
                        // Rueda con CASCADA: cambias esta y la heredan las series
                        // que faltan; las hechas conservan su peso real.
                        RuedaDeCarga(valor: rec.loadActualKg ?? rec.loadPrescribedKg ?? 20,
                                     alCambiar: { session.setSetLoadCascade(indice, $0) })
                    }
                    // CUÁNTAS SERIES SON. Reps y carga ya se ajustaban aquí; el
                    // recuento no, y un plan de 4 series que acaban siendo 3 es de
                    // las cosas más normales que pasan en un gimnasio.
                    HStack(spacing: Theme.Spacing.m) {
                        Text("Series")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                        Spacer()
                        Button {
                            session.quitarSerie(indice)
                            dismiss()
                        } label: {
                            Image(systemName: "minus.circle")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(session.puedeQuitarSerie(indice)
                                                 ? Theme.Color.foreground : Theme.Color.faint)
                        }
                        .buttonStyle(.plain)
                        .disabled(!session.puedeQuitarSerie(indice))
                        Text("\(session.setRecords.count)")
                            .scaledFont(17, weight: .heavy, relativeTo: .body)
                            .foregroundStyle(Theme.Color.foreground)
                            .monospacedDigit()
                        Button {
                            session.anadirSerie()
                        } label: {
                            Image(systemName: "plus.circle")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        .buttonStyle(.plain)
                    }

                    Button(action: {
                        session.setSetSkipped(indice, rec.status != "skipped"); Haptics.light()
                    }) {
                        Text(rec.status == "skipped" ? "Deshacer salto" : "Saltar esta serie")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(rec.status == "skipped" ? Theme.Color.accentText : Theme.Color.muted)
                            .underline()
                    }
                    .buttonStyle(.plain)
                }
                .padding(Theme.Spacing.l)
            }
        }
        .background(Theme.Color.background)
    }
}

// MARK: - Los controles de ajuste

/// Un entero con − y +. Ajustar es la excepción, así que no grita.
private struct PasoEntero: View {
    let etiqueta: String
    let valor: Int
    let alCambiar: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: etiqueta, size: 10)
            HStack(spacing: Theme.Spacing.s) {
                boton("minus") { alCambiar(max(0, valor - 1)) }
                Text("\(valor)")
                    .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                boton("plus") { alCambiar(valor + 1) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); accion() }) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icono == "plus" ? "Sumar \(etiqueta)" : "Restar \(etiqueta)")
    }
}

/// Un decimal opcional (RPE / RIR). Vacío hasta el primer toque: lo que no se ha
/// contestado no se rellena con un cero (§7).
private struct PasoDecimal: View {
    let etiqueta: String
    let paso: Double
    let maximo: Double
    let valor: Double?
    let alCambiar: (Double?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: etiqueta, size: 10)
            HStack(spacing: Theme.Spacing.s) {
                boton("minus") { ajustar(-paso) }
                Text(valor.map { Formato.esDecimal($0) } ?? "sin decir")
                    .scaledFont(valor == nil ? 12 : 22,
                                weight: valor == nil ? .semibold : .heavy,
                                relativeTo: valor == nil ? .caption : .title2,
                                italic: valor != nil)
                    .monospacedDigit()
                    .foregroundStyle(valor == nil ? Theme.Color.muted : Theme.Color.foreground)
                    .frame(maxWidth: .infinity)
                boton("plus") { ajustar(paso) }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    private func ajustar(_ delta: Double) {
        Haptics.light()
        alCambiar(min(maximo, max(0, (valor ?? 0) + delta)))
    }

    private func boton(_ icono: String, _ accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Image(systemName: icono)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 32, height: 32)
                .background(Theme.Color.surfaceElevated,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icono == "plus" ? "Sumar \(etiqueta)" : "Restar \(etiqueta)")
    }
}

/// La rueda de carga: pasos de 2,5 kg, redondeando lo que entre a la rejilla de
/// discos. «esta y siguientes» dice lo que hace.
private struct RuedaDeCarga: View {
    let valor: Double
    let alCambiar: (Double) -> Void

    private var pasos: Binding<Int> {
        Binding(get: { max(1, Int((valor / 2.5).rounded())) },
                set: { alCambiar(Double($0) * 2.5) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: "\(Vocab.carga) · esta y siguientes", size: 10)
            Picker(Vocab.carga, selection: pasos) {
                ForEach(1...120, id: \.self) { u in
                    Text(KgWheel.kgLabel(Double(u) * 2.5))
                        .font(.system(size: 16, weight: .bold, design: .monospaced))
                        .tag(u)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 84)
            .clipped()
        }
        .frame(maxWidth: .infinity)
    }
}
