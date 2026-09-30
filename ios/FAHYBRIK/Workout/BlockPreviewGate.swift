import SwiftUI

// LA PUERTA DEL BLOQUE — «empieza cuando estés listo» (el doble: `gate-bloque`).
//
// La pantalla que sale ANTES de cada bloque del coach (y del primero): el atleta VE lo que viene —el
// nombre del bloque, su formato y los movimientos con su dosis—, se prepara (carga la barra, lee el WOD)
// y toca «Arrancar bloque» CUANDO QUIERE. Solo entonces corre el reloj de ese bloque (la cuenta 3-2-1 de
// un EMOM sale DESPUÉS de este toque): el motor lo congela mientras esto está en pantalla
// (`isAwaitingBlockStart`). Se presenta en exclusiva con el vivo (`PresentadorVivo`), como en el reloj.
//
// Arquetipo Configurar, altura `previsualiza` (CONTRATO-UI §6): el sujeto es el bloque que vas a hacer y
// se queda el sobrante. Con un ítem, su dosis es el número grande de la pantalla; con dieciséis, las
// filas se cierran y aparece el scroll. La acción, anclada abajo.
//
// Card 114 — Alex, sesión del 20-ago: «Al entrar en estaciones no estaba claro
// si eran 3 seguidas de cada ejercicio o 1 y 1 y 1. El atleta lo hizo mal».
// CIRCUITO = una ruta de estaciones distintas, una vuelta (`fixedListIsStations`
// en `LiveTramo.swift`). SEGUIDO = el mismo movimiento se repite ronda tras
// ronda — no hay orden de estación que confundir porque solo hay UN movimiento.
// Un formato de rondas con VARIOS movimientos (el caso real de Alex: ¿se
// rota o se hacen seguidas las de cada uno?) no entra en ninguno de los dos:
// ahí la app no puede prometer cuál lectura es la correcta, así que no se
// pinta nada — decir "circuito" cuando no lo es es justo lo que le hizo
// hacer el entreno mal.
enum BlockPacing: Equatable {
    case circuito
    case seguido
    /// Una superserie NO es ninguna de las dos: va y viene entre dos ejercicios.
    /// Etiquetarla «seguido» engañaría igual que no decir nada — peor, porque
    /// suena a certeza.
    case alternando

    /// La palabra de la pastilla. Dice el QUÉ; `caption` dice el CÓMO.
    var label: String {
        switch self {
        case .circuito:   return "Circuito"
        case .seguido:    return "Seguido"
        case .alternando: return "Alternando"
        }
    }

    var caption: String {
        switch self {
        case .circuito:   return "uno de cada por vuelta, en orden"
        // Vale para las dos formas de «seguido»: la tabla de hierro y el bloque
        // de rondas con un solo movimiento (donde no hay «siguiente» que confundir).
        case .seguido:    return "todas las series de un ejercicio antes del siguiente"
        case .alternando: return "una serie de cada, y vuelta a empezar"
        }
    }

    /// La decisión, pura y testeable — separada de la vista para poder probarla
    /// sin renderizar nada. Recorre los segmentos del bloque y se queda con el
    /// primero que dé una lectura cierta.
    ///
    /// EL CASO QUE MOTIVA TODO ESTO (card 114). Alex, 20-ago: «al entrar en
    /// estaciones no estaba claro si eran 3 seguidas de cada ejercicio o 1 y 1 y
    /// 1. El atleta lo hizo mal». Ese caso —rondas declaradas con VARIOS
    /// movimientos— es precisamente el que hay que contestar, y la respuesta no
    /// es ambigua: en este modelo, rondas con varios movimientos significa uno de
    /// cada por vuelta. Si el entrenador quisiera todas las series de un
    /// ejercicio antes de pasar al siguiente, eso no sería «rondas»: sería
    /// `sets`, que es otro esquema y se lee abajo.
    ///
    /// Callarse ahí sería dejar sin arreglar justo la queja. Sólo se calla cuando
    /// de verdad no se puede saber, que con estas reglas casi no pasa.
    static func resolve(_ segments: [WorkoutSegment]) -> BlockPacing? {
        for seg in segments {
            // Una superserie va y viene entre sus ejercicios: ni seguido ni
            // circuito. Se mira ANTES que la tabla de hierro porque también
            // cuenta como fuerza por series.
            if seg.formatScheme == .superset { return .alternando }
            // Una tabla de hierro es, por definición, todas las series de un
            // ejercicio antes de pasar al siguiente.
            if seg.usesMultiSetStrength { return .seguido }
            guard seg.formatScheme?.presentation == .fixed else { continue }
            // Una ruta de estaciones distintas: una vuelta, en ese orden.
            if seg.fixedListIsStations { return .circuito }
            guard seg.formatRounds != nil else { continue }
            // Rondas con un solo movimiento: no hay orden que confundir.
            // Rondas con varios: uno de cada por vuelta. EL caso de Alex.
            return seg.declaredComponents.count <= 1 ? .seguido : .circuito
        }
        return nil
    }
}

// MARK: - Lo que viene

/// Las filas de «lo que viene», puras. Un EMOM que alterna se abre en una fila por movimiento DISTINTO de
/// su rotación; un bloque de acondicionamiento plegado (AMRAP, For Time, Chipper…) en una por movimiento
/// de la ronda, como las pinta el vivo; el resto, una por segmento con su línea de trabajo
/// (`previewWorkLine`, la misma de la ficha previa y del vivo).
enum LoQueVieneEnLaPuerta {
    struct Fila: Identifiable, Equatable {
        let id: Int
        let nombre: String
        let trabajo: String?
    }

    static func filas(_ segmentos: [WorkoutSegment]) -> [Fila] {
        var out: [Fila] = []
        func anade(_ nombre: String, _ partes: [String?]) {
            let trabajo = partes.compactMap { $0 }.joined(separator: " · ")
            out.append(Fila(id: out.count, nombre: nombre, trabajo: trabajo.isEmpty ? nil : trabajo))
        }
        for seg in segmentos {
            if seg.isEMOM, let plan = seg.emomPlan, plan.isAlternating {
                var vistos = Set<String>()
                for itv in plan.intervals where vistos.insert(itv.movement).inserted {
                    anade(itv.movement, [itv.work, itv.detail])
                }
            } else if seg.isConditioningTimer, seg.components.count > 1 {
                for comp in seg.components { anade(comp.name, [comp.work, comp.detail]) }
            } else {
                anade(seg.title, [seg.previewWorkLine])
            }
        }
        return out
    }
}

// MARK: - La pantalla

struct BlockPreviewGate: View {
    /// El nombre del bloque: el título del coach («Metcon») o el de la fase.
    let title: String
    /// La fase pedagógica («Calentamiento», «Principal», «Vuelta a la calma»). Nil en un libre sin bloques.
    let phaseTag: String?
    /// Posición del bloque (desde 1) y total: «Bloque 2 de 3» cuando hay más de uno.
    let blockNumber: Int
    let blockCount: Int
    /// El formato («EMOM · 15 rondas · cada 1:00», «AMRAP · 20:00»). Nil en fuerza y calentamiento.
    let formatLabel: String?
    /// Card 114 — circuito, seguido o alternando, cuando se puede saber con certeza.
    var pacing: BlockPacing? = nil
    /// Los segmentos del bloque, en orden: lo que viene.
    let segments: [WorkoutSegment]
    /// Se puede volver a la puerta del bloque anterior.
    let canGoBack: Bool
    let onStartBlock: () -> Void
    let onBack: () -> Void
    /// Salir del entreno desde la puerta SIN registrar nada: el atleta nunca queda atrapado aquí.
    let onExit: () -> Void
    /// Abre la hoja de bloques del padre: sin ella no se puede saltar el calentamiento desde la puerta.
    let alVerBloques: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            cromo
            FillingScreen {
                sujeto
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.m)
                    .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .anchoredAction {
            VStack(spacing: Theme.Spacing.s) {
                Text("Arranca el bloque cuando estés listo")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                BotonAccionDia("Arrancar bloque", glifo: .play, completa: true, alto: Theme.Size.accionAnclada, glifoAlFinal: false, impacto: .medio, accion: onStartBlock)
            }
            .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .transition(.opacity)
    }

    private var cromo: some View {
        CromoPrevia {
            // Salir sin empezar ni registrar nada: la sesión queda pendiente.
            BotonCromoDia(.cerrar, etiqueta: "Salir del entreno", accion: onExit)
            BotonCromoDia(.bloques, etiqueta: "Ver el entreno entero", accion: alVerBloques)
            if canGoBack {
                BotonCromoDia(.atras, etiqueta: "Bloque anterior", accion: onBack)
            }
        } derecha: {
            if blockCount > 1 {
                InfoPill(text: "Bloque \(blockNumber) de \(blockCount)", estilo: .velo)
            }
        }
    }

    private var filas: [LoQueVieneEnLaPuerta.Fila] { LoQueVieneEnLaPuerta.filas(segments) }

    private var sujeto: some View {
        SujetoDia(tono: .accion, etiqueta: etiquetaAccesible) {
            if let phaseTag { KickerDia(phaseTag) }
            TituloDia(title)
            if formatLabel != nil || pacing != nil {
                FlowLayout(spacing: Theme.Spacing.s) {
                    if let formatLabel { InfoPill(text: formatLabel, estilo: .sobreAccion) }
                    if let pacing { InfoPill(text: pacing.label, estilo: .sobreAccion) }
                }
            }
            // La palabra dice el qué; la frase, el cómo, para que no haya que deducirlo: es justo la
            // deducción que salió mal (card 114).
            if let pacing { ApoyoDia(pacing.caption) }
        } abajo: {
            LoQueVienePuerta(filas: filas)
        }
    }

    private var etiquetaAccesible: String {
        var partes = [phaseTag, title, formatLabel].compactMap { $0 }
        if let pacing { partes.append("\(pacing.label): \(pacing.caption)") }
        return partes.joined(separator: ". ")
    }
}

/// «Lo que viene», dentro del sujeto. Con UN movimiento su dosis es el número grande; con más, una fila
/// por movimiento separada por una línea fina de la tinta del sujeto.
private struct LoQueVienePuerta: View {
    let filas: [LoQueVieneEnLaPuerta.Fila]
    @Environment(\.tonoDia) private var tono

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Lo que viene")
                .papel(.etiqueta)
                .padding(.bottom, Theme.Spacing.s)
                .accessibilityAddTraits(.isHeader)
            if filas.isEmpty {
                ApoyoDia("Sin detalle. Empieza cuando estés listo.")
            } else if filas.count == 1, let fila = filas.first {
                Text(fila.nombre).papel(.cuerpoFuerte).fixedSize(horizontal: false, vertical: true)
                if let trabajo = fila.trabajo {
                    Text(trabajo)
                        .papel(.dato)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Theme.Spacing.xs)
                }
            } else {
                ForEach(filas) { fila in
                    FilaAdaptableDia {
                        Text(fila.nombre).papel(.cuerpoFuerte).fixedSize(horizontal: false, vertical: true)
                    } derecha: {
                        if let trabajo = fila.trabajo {
                            Text(trabajo).papel(.notaPesada).multilineTextAlignment(.trailing)
                        }
                    }
                    .padding(.vertical, Theme.Spacing.s + 2)
                    .overlay(alignment: .top) {
                        Rectangle().fill(tono.papeles.tinta.opacity(0.28)).frame(height: 1)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .foregroundStyle(tono.papeles.tinta)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

