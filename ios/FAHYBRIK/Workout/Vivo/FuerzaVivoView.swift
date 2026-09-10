import SwiftUI

// EL HIERRO EN VIVO — la serie que tienes delante, en el lenguaje del §10.
//
// La diferencia con correr o con un ergómetro no es estética: es DE MANDO. Allí
// el aparato mide y la app cuenta; aquí la app no puede medir NADA — ni una
// repetición, ni un kilo, ni el RIR. **Gobierna el atleta**, y el reloj solo
// entra cuando sueltas la barra. De ahí salen las reglas de esta pantalla:
//
//   1. El sujeto es LA SERIE (`5 × 100 kg`), no el ejercicio ni el cronómetro.
//   2. La acción es `unicaSalida` (§10.5): el toque es lo ÚNICO que cierra la
//      serie, y ese es exactamente el sitio donde el relleno naranja significa
//      algo. En el EMOM, donde cierra el reloj, va en contorno.
//   3. Nada pasa de prescrito a hecho sin que él lo diga (§7). Lo que sintió se
//      pregunta; no se copia del plan.
//   4. El descanso es DOSIS, así que cuando corre es él quien manda la banda.
//
// QUÉ CAMBIÓ EL 29-JUL. La pantalla anterior (`StrengthLiveHUD`, `StrengthSetsHUD`
// y `PrefilledRepStepper`, borradas) no tenía sujeto: era una tabla. El dato que
// gobierna —qué serie te toca y con cuánto— vivía dentro de una fila de lista de
// 14 pt en `monospaced`, mientras el `readoutHero` se lo llevaba un contador de
// repeticiones que en un 5×5 no dice nada. El pulso se pintaba «—» sin reloj
// (§7), había cuatro tratamientos de número grande (§10.2) y el descanso era una
// banderita de 18 pt en una esquina cuando es la mitad de la dosis.
//
// EL ANCHO, QUE ES LO QUE ROMPIÓ ESTA FAMILIA UNA VEZ: «5 × 100» son siete
// avances de la monoespaciada y a 125 pt miden 525 sobre un lienzo de 378. La
// tentación es partir la prescripción en dos peldaños («100 kg» con un «5 reps»
// colgando), y eso INVIERTE la jerarquía — en fuerza se leen las repeticiones y
// luego la carga, y son UNA cosa. La cifra no se parte: `EscalaNumeral` tiene
// presupuesto de ancho y la encoge lo justo. El arreglo va a la raíz.
//
// EL MOTOR NO SE HA TOCADO: `confirmSet`, `setSetReps`, `setSetLoadCascade`,
// `setSetRPE/RIR`, `setSetSkipped`, `startRest` y el cebado de la carga siguen
// siendo los mismos. FH-46 solo cambia el CUÁNDO: al cerrar el ejercicio se
// declara un kg con la `KgWheel` que ya existía.

/// Wrapper de preview/test — el live real monta `RunLiveShellView`.
struct FuerzaVivoView: View {
    let session: WorkoutSession
    let accionTitulo: String
    let alTocarAccion: () -> Void
    let alSalir: () -> Void
    let alVerBloques: () -> Void
    let alConectividad: () -> Void
    let alTapHR: () -> Void
    let alPausa: () -> Void
    let hrLink: DeviceLink
    var muestraConectividad: Bool = true

    @State private var partnerStripCollapsed = false

    var body: some View {
        RunLiveShellView(
            session: session,
            hrZones: session.hrZones,
            accionTitulo: accionTitulo,
            alTocarAccion: alTocarAccion,
            alSalir: alSalir,
            alVerBloques: alVerBloques,
            alConectividad: alConectividad,
            alTapPM5: {},
            alTapHR: alTapHR,
            alPausa: alPausa,
            pm5: PM5Pool.shared.any,
            hrLink: hrLink,
            muestraConectividad: muestraConectividad,
            partnerStripCollapsed: $partnerStripCollapsed
        )
    }
}

// MARK: - El riel de series — dónde estás en el ejercicio

/// Identidad de la hoja de kg al cerrar el ejercicio. `kg` es la semilla
/// (resuelto o prescrito); girar o no, HECHO declara ese valor.
struct CierreDeCarga: Identifiable {
    let id = UUID()
    let kg: Double
}

/// Las series a lo ancho, con la que tienes delante encendida.
///
/// Es un RIEL, no una tabla: dice en qué serie vas y cómo quedaron las anteriores,
/// y cabe igual con cuatro que con ocho. La tabla que había antes crecía con el
/// número de series hasta empujar la acción fuera de la pantalla, y encima ponía el
/// gesto que repites cuatro veces («hecha») en un botón de 12 pt.
///
/// Tocar una serie abre su editor. Ajustar es la excepción (§7): lo normal es que
/// la serie salga como está escrita y se cierre con el botón grande.
struct RielDeSeries: View {
    let series: [SetRecord]
    let actual: Int?
    let alTocar: (Int) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(series) { rec in
                let i = rec.setIndex - 1
                Button(action: { Haptics.light(); alTocar(i) }) {
                    peldano(rec, esLaDeAhora: i == actual)
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel(voz(rec, esLaDeAhora: i == actual))
            }
        }
    }

    private func peldano(_ rec: SetRecord, esLaDeAhora: Bool) -> some View {
        VStack(spacing: 3) {
            HStack(spacing: 3) {
                if rec.confirmed, rec.status != "skipped" {
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .heavy))
                        .foregroundStyle(rec.status == "scaled" ? Theme.Color.warning : Theme.Color.ok)
                }
                Text("S\(rec.setIndex)")
                    .scaledFont(11, weight: .heavy, relativeTo: .caption2, italic: true)
                    .foregroundStyle(esLaDeAhora ? Theme.Color.accentText : Theme.Color.muted)
            }
            Text(dosis(rec))
                .font(Theme.Typography.readoutS)
                .foregroundStyle(esLaDeAhora ? Theme.Color.foreground : Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .padding(.horizontal, 4)
        .background(
            // Translúcida: el tinte de zona se ve DEBAJO, o el ambiente se corta
            // en una línea recta a media pantalla.
            esLaDeAhora ? Theme.Color.accent.opacity(0.16) : Theme.Color.surface.opacity(0.78),
            in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(esLaDeAhora ? Theme.Color.accentText.opacity(0.55) : Theme.Color.hairline,
                        lineWidth: esLaDeAhora ? 1.5 : 1)
        )
        .opacity(rec.status == "skipped" ? 0.45 : 1)
    }

    /// Lo prescrito, o lo registrado en cuanto se confirma. Una serie sin dosis
    /// escrita —el circuito real del coach— no pinta un guion: se calla.
    private func dosis(_ rec: SetRecord) -> String {
        let reps = rec.confirmed ? (rec.repsActual ?? rec.repsPrescribed) : rec.repsPrescribed
        let kg = rec.confirmed ? (rec.loadActualKg ?? rec.loadPrescribedKg) : rec.loadPrescribedKg
        return Formato.serie(reps: reps, cargaKg: kg)?.linea ?? "·"
    }

    private func voz(_ rec: SetRecord, esLaDeAhora: Bool) -> String {
        let estado = rec.status == "skipped" ? "saltada"
            : rec.confirmed ? (rec.status == "scaled" ? "ajustada" : "hecha")
            : (esLaDeAhora ? "la que toca" : "pendiente")
        return "Serie \(rec.setIndex), \(estado), \(dosis(rec)). Tocar para ajustar"
    }
}

// MARK: - Hoja de carga al cerrar

/// Hoja al cerrar el ejercicio: la misma `KgWheel`, semilla = kg propuesto.
/// HECHO sin girar guarda ese propuesto. `Measurement<UnitMass>` no es un control.
struct HojaCargaAlCerrar: View {
    let alConfirmar: (Double) -> Void
    @State private var units: Int

    init(semillaKg: Double, alConfirmar: @escaping (Double) -> Void) {
        self.alConfirmar = alConfirmar
        _units = State(initialValue: max(1, Int((semillaKg / 2.5).rounded())))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                Text(Formato.kg(Double(units) * 2.5))
                    .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                Button("HECHO") { alConfirmar(Double(units) * 2.5) }
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.accentText)
            }
            KgWheel(label: Vocab.carga, units: $units)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.Color.background)
        .compactSheet()
    }
}

// MARK: - Los dos estados de diseño, para abrirlos en el lienzo de Xcode

#if DEBUG
/// El caso real del plan del coach: Back Squat 4×5 @ 100 kg, RIR 2, descanso
/// 1:30 — y con el atleta en la serie 2. «5 × 100» son los siete avances de la
/// mono que rompieron esta familia una vez.
private func fuerzaDePrueba(zonas: HRZoneProfile? = nil, bpm: Int? = nil) -> WorkoutSession {
    func serie() -> PrescriptionSet {
        PrescriptionSet(measure: .reps(5),
                        target: .kg(value: 100, min: nil, max: nil),
                        modality: nil, restS: 90, tempo: nil, note: nil)
    }
    let p = Prescription(scheme: .sets, modality: nil,
                         sets: [serie(), serie(), serie(), serie()],
                         rounds: nil, workS: nil, restS: nil, totalS: nil,
                         target: .rir(value: 2, min: nil, max: nil),
                         note: nil, start: nil, increment: nil)
    let tramo = WorkoutSegment(order: 1, title: "Back Squat", kind: .strength,
                               targetReps: 5, loadKg: 100,
                               blockTitle: "Fuerza", blockPosition: 1,
                               prescription: p)
    let plan = WorkoutPlan(id: UUID(), name: "Fuerza", format: .sets,
                           estimatedDurationSeconds: 1200, blockContext: "Fuerza",
                           zoneTargets: [], equipment: [], segments: [tramo],
                           coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    let sesion = WorkoutSession(plan: plan, hrZones: zonas)
    sesion.liveHRBpm = bpm
    // La serie 1 ya está cerrada: el atleta está delante de la 2. Se cierra el
    // descanso que dispara `confirmSet` para que el sujeto sea la SERIE y no la
    // cuenta atrás — el descanso tiene su propio estado y se ve al confirmar.
    sesion.primeSetsIfNeeded()
    sesion.confirmSet(0)
    sesion.dismissRest()
    return sesion
}

private func zonasFuerzaDePrueba() -> HRZoneProfile {
    HRZoneProfile(
        lthrBpm: 170, estimated: false, source: "test",
        sourceLabel: "Zonas de tu test de umbral", confidence: "measured",
        zones: [
            HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
            HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
            HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
            HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
            HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
        ]
    )
}

@ViewBuilder
private func lienzoFuerza(_ sesion: WorkoutSession) -> some View {
    ZStack {
        Theme.Color.background.ignoresSafeArea()
        Ambiente(zona: sesion.liveZone)
        FuerzaVivoView(session: sesion, accionTitulo: "HECHO", alTocarAccion: {},
                       alSalir: {}, alVerBloques: {}, alConectividad: {},
                       alTapHR: {}, alPausa: {}, hrLink: .idle)
    }
}

/// CON PULSO — hay ancla de FC y hay lectura: el lienzo se tiñe de tu zona (§10.1).
/// En fuerza el pulso baja entre series, así que Z2 es lo normal aquí.
#Preview("Fuerza en vivo · con pulso") {
    lienzoFuerza(fuerzaDePrueba(zonas: zonasFuerzaDePrueba(), bpm: 142))
}

/// SIN ANCLA DE FC — ni zonas del servidor ni reloj en la muñeca. NO hay tinte y
/// donde iría el pulso se dice por qué no está (§7). El sujeto no cambia: la
/// serie que tienes delante se sabe igual.
#Preview("Fuerza en vivo · sin ancla de FC") {
    lienzoFuerza(fuerzaDePrueba())
}
#endif
