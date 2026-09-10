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
