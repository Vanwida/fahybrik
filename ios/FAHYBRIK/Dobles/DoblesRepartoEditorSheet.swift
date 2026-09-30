import SwiftUI

// Editor del reparto de UNA estación, abierto al tocar su fila en el board del
// predicho de carrera dobles. El atleta mueve el slider (pasos de 5%) y ve EN
// VIVO el efecto: cuánto tarda la pareja en ese tramo con el nuevo reparto y cómo
// mueve el predicho conjunto contra el objetivo. Al confirmar guarda con el PUT
// existente (mismo que la Simulación conjunta) y refresca el board.
//
// La ÚNICA cuenta local es el tramo que se está tocando (DoblesRepartoMath, el
// espejo de la regla del servidor): pair_predicted = share·self_solo +
// (1−share)·partner_solo. Todo lo demás se ancla en los números que ya mandó el
// servidor y sólo se les aplica ESE desplazamiento — total nuevo =
// predicho_total + Δ, gap nuevo = gap + Δ — así el editor nunca puede contar el
// gap de otra forma que el board. Si falta self_solo_s o partner_solo_s no se
// puede previsualizar → slider deshabilitado + nota honesta.
struct DoblesRepartoEditorSheet: View {
    let segment: DoblesRaceGapSegment
    let partnerName: String
    /// Predicho conjunto actual (segundos) — la base sobre la que se aplica el
    /// cambio de este tramo. Nil si no hay predicho total (no recomputamos total).
    let predictedTotalS: Int?
    /// Objetivo de la carrera (segundos), o nil → sin gap contra objetivo. Sólo
    /// se usa para saber SI hay objetivo; el número del gap viene en `gapS`.
    let goalS: Int?
    /// Gap actual del servidor (predicho − objetivo). Nil sin objetivo o sin
    /// predicho; la previsualización le suma el cambio de este tramo.
    let gapS: Int?
    var bearer: String?
    /// Se llama tras un guardado correcto para que la sección refresque el board.
    var onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var share: Double
    @State private var saving = false
    @State private var aviso: AvisoDia.Contenido? = nil

    private let selfName = "Tú"

    init(
        segment: DoblesRaceGapSegment,
        partnerName: String,
        predictedTotalS: Int?,
        goalS: Int?,
        gapS: Int?,
        bearer: String? = nil,
        onSaved: @escaping () -> Void
    ) {
        self.segment = segment
        self.partnerName = partnerName
        self.predictedTotalS = predictedTotalS
        self.goalS = goalS
        self.gapS = gapS
        self.bearer = bearer
        self.onSaved = onSaved
        // Semilla del share: el explícito, o el derivado del carrier (self=1,
        // partner=0, split sin share → 0.5).
        let seed: Double
        if let s = segment.selfShare {
            seed = s
        } else {
            switch segment.carrier.lowercased() {
            case "self":    seed = 1
            case "partner": seed = 0
            default:        seed = 0.5
            }
        }
        _share = State(initialValue: seed)
    }

    /// Sólo podemos recomputar el efecto si tenemos AMBOS tiempos individuales.
    private var canRecompute: Bool { segment.selfSoloS != nil && segment.partnerSoloS != nil }

    private var newStationPredicted: Int? {
        guard let s = segment.selfSoloS, let p = segment.partnerSoloS else { return nil }
        return DoblesRepartoMath.stationPairPredicted(selfShare: share, selfSoloS: s, partnerSoloS: p)
    }

    /// Cambio del tramo respecto al reparto guardado (rojo si suma, verde si
    /// resta). Es el ÚNICO desplazamiento que la app introduce: total y gap se
    /// obtienen sumándoselo a lo que dijo el servidor.
    private var stationDelta: Int? {
        newStationPredicted.map { $0 - segment.pairPredictedS }
    }

    private var newTotal: Int? {
        guard let total = predictedTotalS, let d = stationDelta else { return nil }
        return total + d
    }

    private var newGap: Int? {
        guard let gap = gapS, let d = stationDelta else { return nil }
        return gap + d
    }

    /// El reparto no ha cambiado respecto a lo guardado (nada que guardar).
    private var isDirty: Bool {
        guard let np = newStationPredicted else { return false }
        return np != segment.pairPredictedS
    }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraDobles(
                kicker: "Ajusta el reparto",
                titulo: segment.labelEs,
                salida: .cerrar,
                alSalir: { dismiss() }
            )
            ScrollView {
                cuerpo
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.l)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .anchoredAction {
            AccionDobles(
                titulo: saving ? "Guardando…" : "Guardar reparto",
                habilitada: canRecompute && isDirty,
                enCurso: saving
            ) {
                Task { await save() }
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .avisoDia($aviso)
        .compactSheet()
    }

    // MARK: - Pieces

    /// Lo que va dentro del scroll: el slider con su efecto en vivo, o el aviso de que faltan datos.
    var cuerpo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            if canRecompute {
                sliderCard
                effectCard
            } else {
                missingDataNote
            }
        }
    }

    private var sliderCard: some View {
        DoblesShareSlider(selfName: selfName, partnerName: partnerName, selfShare: $share)
            .padding(Theme.Spacing.l)
            .caraDobles(.neutra)
    }

    // El efecto en vivo: cuánto tarda la pareja en ESTE tramo y cómo queda el predicho conjunto contra el
    // objetivo, ambos recomputados al mover el slider.
    private var effectCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            // La tarjeta sólo se pinta con `canRecompute`, así que el tramo SIEMPRE tiene número; se
            // desenvuelve en vez de rellenarse.
            if let tramo = newStationPredicted {
                effectRow(label: "Este tramo", value: GoalGapFormat.raceClock(tramo), delta: stationDelta)
            }
            // El total sí puede faltar (sin predicho conjunto del servidor). Entonces la fila NO existe: nada
            // que la pareja pueda hacer aquí para llenarla, así que se calla, y su separador con ella (§6.2 bis).
            if let total = newTotal {
                Hairline()
                effectRow(label: "Predicho pareja", value: GoalGapFormat.raceClock(total), delta: nil)
            }
            if let g = newGap {
                PastillaDeGap(gapS: g)
            } else if goalS == nil {
                Text("Sin objetivo fijado para esta carrera.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.neutra)
    }

    private func effectRow(label: String, value: String, delta: Int?) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                Text(label).papel(.rotulo).foregroundStyle(Theme.Color.muted)
                Spacer(minLength: Theme.Spacing.s)
                deltaText(delta)
                Text(value).papel(.dato).foregroundStyle(Theme.Color.foreground)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(label).papel(.rotulo).foregroundStyle(Theme.Color.muted)
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                    Text(value).papel(.dato).foregroundStyle(Theme.Color.foreground)
                    deltaText(delta)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// El cambio del tramo: rojo si suma, verde si resta (un delta con signo, el único sitio donde el color de
    /// estado va en el texto).
    @ViewBuilder
    private func deltaText(_ delta: Int?) -> some View {
        if let delta, delta != 0 {
            Text(GoalGapFormat.signedDuration(delta))
                .papel(.notaPesada)
                .foregroundStyle(delta > 0 ? Theme.Color.danger : Theme.Color.ok)
        }
    }

    // Sin uno de los tiempos individuales no se puede simular el reparto — honesto: slider deshabilitado y
    // explicación de qué falta (nunca un número inventado).
    private var missingDataNote: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            DoblesShareSlider(selfName: selfName, partnerName: partnerName, selfShare: $share, enabled: false)
            Text(missingDataMessage)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.neutra)
    }

    private var missingDataMessage: String {
        let selfMissing = segment.selfSoloS == nil
        let partnerMissing = segment.partnerSoloS == nil
        let who: String
        if selfMissing && partnerMissing {
            who = "de ambos"
        } else if selfMissing {
            who = "tuyos"
        } else {
            who = "de \(partnerName)"
        }
        return "Faltan datos \(who) en esta estación, así que no podemos simular el reparto en vivo. Registrad una práctica y podréis ajustarlo."
    }

    // MARK: - Save

    // Guarda SÓLO esta estación con el PUT existente. El body lleva el
    // station_index del tramo (convención del race-gap, 1..8), el carrier derivado
    // del share y la parte del atleta; el backend localiza la estación por
    // station_index y actualiza sólo esa en el documento (preserva las notas del
    // coach). En éxito refresca el board y cierra; en fallo deja el editor abierto
    // con un error en línea.
    private func save() async {
        guard let idx = segment.stationIndex, canRecompute, !saving else { return }
        saving = true
        let body = DoblesSimulationEditBody(stationSplits: [
            DoblesSimulationEditBody.Station(
                stationIndex: idx,
                carrier: DoblesRepartoMath.carrier(forShare: share),
                selfShare: share,
                note: nil
            )
        ])
        if await DoblesService.updateSimulation(body, bearer: bearer) != nil {
            Haptics.success()
            onSaved()
            dismiss()
        } else {
            Haptics.error()
            aviso = .init(tono: .fallo, texto: "No se pudo guardar. Inténtalo de nuevo.")
        }
        saving = false
    }
}
