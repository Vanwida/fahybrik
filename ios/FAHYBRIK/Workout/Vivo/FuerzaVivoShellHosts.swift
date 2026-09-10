import SwiftUI

// Bandas de fuerza inyectables en `EntrenoVivoShellView` — mismo MarcoVivo global.
// El estado vive en `FuerzaVivoShellState` (Environment) para compartir sujeto,
// apoyos y acción sin un segundo árbol de cromo.

@Observable
@MainActor
final class FuerzaVivoShellState {
    let session: WorkoutSession
    var accionTitulo: String
    var alTocarAccion: () -> Void

    var editando: SerieEnEdicion?
    var cargaKg: Double?
    var cierreDeCarga: CierreDeCarga?

    init(session: WorkoutSession, accionTitulo: String, alTocarAccion: @escaping () -> Void) {
        self.session = session
        self.accionTitulo = accionTitulo
        self.alTocarAccion = alTocarAccion
        cebarCarga()
    }

    var seg: WorkoutSegment? { session.currentSegment }
    var descansando: Bool { session.restRemainingSeconds > 0 }
    var porSeries: Bool { seg?.usesMultiSetStrength == true }
    var admiteCarga: Bool { seg?.kind == .strength || seg?.kind == .sled }

    func onSegmentChange() {
        editando = nil
        cierreDeCarga = nil
        cargaKg = nil
        cebarCarga()
    }

    func cebarCarga() {
        guard admiteCarga else { cargaKg = nil; return }
        session.primeManualLoadIfNeeded()
        cargaKg = session.manualLoadKg
    }

    var seriePendiente: Int? {
        guard porSeries else { return nil }
        return session.setRecords.firstIndex { !$0.confirmed && $0.status != "skipped" }
    }

    var tituloDeAccion: String {
        if descansando { return "SALTAR DESCANSO" }
        guard let i = seriePendiente else { return accionTitulo }
        return "SERIE \(session.setRecords[i].setIndex) HECHA"
    }

    var notaDeAccion: String? {
        if descansando { return "el descanso también es dosis" }
        guard seriePendiente == nil, porSeries else { return nil }
        return "todas las series cerradas"
    }

    var kgAlCerrarEjercicio: Double? {
        guard admiteCarga else { return nil }
        if !session.setRecords.isEmpty,
           session.setRecords.allSatisfy({ $0.status == "skipped" }) { return nil }
        return cargaKg ?? session.manualLoadKg ?? seg?.loadKg
    }

    func ejecutarAccion() {
        if descansando { session.dismissRest(); return }
        if let i = seriePendiente { session.confirmSet(i); return }
        if let kg = kgAlCerrarEjercicio {
            cierreDeCarga = CierreDeCarga(kg: kg)
            return
        }
        alTocarAccion()
    }

    var indiceSerieActual: Int? {
        guard !session.setRecords.isEmpty else { return nil }
        let pendiente = session.setRecords.firstIndex { !$0.confirmed && $0.status != "skipped" }
        return pendiente ?? session.setRecords.indices.last
    }

    var lineaDelPlan: String? {
        var partes: [String] = []
        if porSeries, let dosis = Formato.dosisDeSeries(series: session.setRecords.count,
                                                        reps: session.setRecords.first?.repsPrescribed) {
            partes.append(dosis)
        }
        if let kg = seg?.loadKg, kg > 0 { partes.append(Formato.kg(kg)) }
        if let d = session.setRecords.compactMap(\.restS).first {
            partes.append("\(Vocab.descanso.lowercased()) \(Formato.clock(d, subMinuto: .segundos))")
        }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }
}

private struct FuerzaVivoShellStateKey: EnvironmentKey {
    static let defaultValue: FuerzaVivoShellState? = nil
}

extension EnvironmentValues {
    var fuerzaVivoShell: FuerzaVivoShellState? {
        get { self[FuerzaVivoShellStateKey.self] }
        set { self[FuerzaVivoShellStateKey.self] = newValue }
    }
}

struct FuerzaVivoShellScope<Content: View>: View {
    @State private var state: FuerzaVivoShellState
    @ViewBuilder let content: () -> Content

    init(session: WorkoutSession,
         accionTitulo: String,
         alTocarAccion: @escaping () -> Void,
         @ViewBuilder content: @escaping () -> Content) {
        _state = State(initialValue: FuerzaVivoShellState(
            session: session, accionTitulo: accionTitulo, alTocarAccion: alTocarAccion))
        self.content = content
    }

    var body: some View {
        content()
            .environment(\.fuerzaVivoShell, state)
            .onChange(of: state.session.currentSegmentIndex) { _, _ in
                state.onSegmentChange()
            }
            .sheet(item: Binding(
                get: { state.editando },
                set: { state.editando = $0 }
            )) { serie in
                EditorDeSerie(session: state.session, indice: serie.indice)
                    .presentationDetents([.medium])
            }
            .sheet(item: Binding(
                get: { state.cierreDeCarga },
                set: { state.cierreDeCarga = $0 }
            )) { cierre in
                HojaCargaAlCerrar(semillaKg: cierre.kg) { kg in
                    state.session.confirmExerciseLoad(kg)
                    state.cierreDeCarga = nil
                    state.alTocarAccion()
                }
            }
    }
}

struct FuerzaVivoContextoBand: View {
    let session: WorkoutSession
    let hrLink: DeviceLink
    let alTapHR: () -> Void
    @Environment(\.fuerzaVivoShell) private var shell

    var body: some View {
        ContextoVivoEntreno(session: session,
                            titulo: session.currentSegment?.title ?? "Fuerza",
                            subtitulo: shell?.lineaDelPlan,
                            pm5: nil,
                            hrLink: hrLink,
                            alTapHR: alTapHR)
    }
}

struct FuerzaVivoSubjectHost: View {
    @Environment(\.fuerzaVivoShell) private var shell

    var body: some View {
        if let shell {
            FuerzaVivoSubjectBand(state: shell)
        }
    }
}

struct FuerzaVivoApoyosHost: View {
    let session: WorkoutSession
    @Environment(\.fuerzaVivoShell) private var shell

    var body: some View {
        if let shell {
            FuerzaVivoApoyosBand(state: shell)
        }
    }
}

struct FuerzaVivoAccionHost: View {
    let session: WorkoutSession
    let accionTitulo: String
    let alTocarAccion: () -> Void
    @Environment(\.fuerzaVivoShell) private var shell

    var body: some View {
        if let shell {
            FranjaAccion(titulo: shell.tituloDeAccion,
                         unicaSalida: true,
                         nota: shell.notaDeAccion,
                         accion: { shell.ejecutarAccion() })
        } else {
            FranjaAccion(titulo: accionTitulo,
                         unicaSalida: true,
                         accion: alTocarAccion)
        }
    }
}

// Sujeto y apoyos extraídos de `FuerzaVivoView` — sin MarcoVivo propio.

struct FuerzaVivoSubjectBand: View {
    let state: FuerzaVivoShellState

    private var session: WorkoutSession { state.session }
    private var seg: WorkoutSegment? { state.seg }

    var body: some View {
        if state.descansando {
            sujetoDescanso
        } else if state.porSeries, let i = state.indiceSerieActual {
            sujetoDeSerie(i)
        } else if seg?.repsArePrimable == true {
            sujetoPrescrito
        } else {
            sujetoContado
        }
    }

    private var sujetoDescanso: some View {
        Group {
            EtiquetaSujeto(texto: Vocab.descanso, tono: Theme.Color.info)
            Numeral(texto: Formato.clock(max(0, session.restRemainingSeconds), anchoFijo: true),
                    tono: Theme.Color.info)
            if let siguiente = textoSerieSiguiente {
                Text("Luego · \(siguiente)")
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private func sujetoDeSerie(_ i: Int) -> some View {
        let rec = session.setRecords[i]
        EtiquetaSujeto(texto: "\(Vocab.serie) \(rec.setIndex) de \(session.setRecords.count)")
        if let dosis = Formato.serie(reps: rec.repsActual ?? rec.repsPrescribed,
                                     cargaKg: rec.loadActualKg ?? rec.loadPrescribedKg) {
            Numeral(texto: dosis.cifra, unidad: dosis.unidad)
            NombreDelTrabajo(texto: seg?.title ?? "")
        } else {
            Text(seg?.title ?? "")
                .scaledFont(34, weight: .heavy, relativeTo: .largeTitle, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
                .lineLimit(2).minimumScaleFactor(0.6)
        }
        if let pastilla = pastillaIntensidad(i) {
            Text(pastilla)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.accentText)
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, 5)
                .background(Theme.Color.accent.opacity(0.16), in: Capsule())
        }
    }

    @ViewBuilder
    private var sujetoPrescrito: some View {
        EtiquetaSujeto(texto: session.repsSkipped ? "Saltado" : Vocab.objetivo)
        if session.repsSkipped {
            Text(seg?.title ?? "")
                .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(2).minimumScaleFactor(0.6)
        } else if let dosis = Formato.serie(reps: session.repsCurrentSegment,
                                            cargaKg: state.admiteCarga ? (state.cargaKg ?? seg?.loadKg) : nil) {
            Numeral(texto: dosis.cifra, unidad: dosis.unidad)
            NombreDelTrabajo(texto: seg?.title ?? "")
        }
    }

    @ViewBuilder
    private var sujetoContado: some View {
        Button(action: { session.tap(); Haptics.light() }) {
            VStack(spacing: 6) {
                EtiquetaSujeto(texto: Vocab.reps, tono: Theme.Color.accentText)
                Numeral(texto: "\(session.repsCurrentSegment)", tono: Theme.Color.accentText)
                NombreDelTrabajo(texto: seg?.title ?? "")
            }
        }
        .buttonStyle(PressScaleStyle())
    }

    private func pastillaIntensidad(_ i: Int) -> String? {
        let p = seg?.prescription
        let deLaSerie = p?.sets.flatMap { $0.indices.contains(i) ? $0[i] : nil }
        if let rir = deLaSerie?.prescribedRir ?? bloqueRir { return Vocab.rirTraducido(Int(rir.rounded())) }
        if let rpe = deLaSerie?.prescribedRpe ?? bloqueRpe { return "\(Vocab.rpe) \(Formato.esDecimal(rpe))" }
        return nil
    }

    private var bloqueRir: Double? {
        if case let .rir(valor, minimo, _) = seg?.prescription?.target { return valor ?? minimo }
        return nil
    }

    private var bloqueRpe: Double? {
        if case let .rpe(valor, minimo, _) = seg?.prescription?.target { return valor ?? minimo }
        return nil
    }

    private var textoSerieSiguiente: String? {
        guard let i = state.indiceSerieActual else { return nil }
        let rec = session.setRecords[i]
        guard !rec.confirmed else { return nil }
        return Formato.serie(reps: rec.repsPrescribed, cargaKg: rec.loadActualKg ?? rec.loadPrescribedKg)?.linea
    }
}

struct FuerzaVivoApoyosBand: View {
    let state: FuerzaVivoShellState

    private var session: WorkoutSession { state.session }
    private var seg: WorkoutSegment? { state.seg }

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            FilaApoyos {
                ApoyoVivo(etiqueta: Vocab.fc,
                          valor: session.liveHRBpm.map { "\($0)" },
                          unidad: Vocab.ppm,
                          tono: session.liveZone?.color ?? Theme.Color.foreground,
                          ausente: "sin reloj")
                ApoyoVivo(etiqueta: Vocab.vuelta,
                          valor: Formato.clock(session.lapElapsedSeconds, anchoFijo: true))
                ApoyoVivo(etiqueta: Vocab.total,
                          valor: Formato.clock(session.elapsedSeconds, anchoFijo: true))
            }
            if state.porSeries {
                RielDeSeries(series: session.setRecords,
                             actual: state.indiceSerieActual,
                             alTocar: { state.editando = SerieEnEdicion(indice: $0) })
            } else {
                ajustesDeTramo
            }
        }
    }

    @ViewBuilder
    private var ajustesDeTramo: some View {
        VStack(spacing: Theme.Spacing.s) {
            if seg?.repsArePrimable == true, !session.repsSkipped {
                PasoEntero(etiqueta: Vocab.reps,
                           valor: session.repsCurrentSegment,
                           alCambiar: { session.setReps($0) })
            }
            if state.admiteCarga {
                RuedaDeCarga(valor: state.cargaKg ?? seg?.loadKg ?? 20,
                             alCambiar: { state.cargaKg = $0; session.manualLoadKg = $0 })
            }
        }
    }
}
