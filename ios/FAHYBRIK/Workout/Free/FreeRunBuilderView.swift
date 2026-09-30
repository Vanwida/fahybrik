import SwiftUI

// EL EDITOR DE UN ENTRENO DE CORRER — la lista de pasos, no un bout.
//
// El modelo y el porqué están en `FreeRunPlan.swift`. Aquí sólo vive el pintado,
// con las MISMAS piezas del resto del constructor (`ConstructorLibrePiezas.swift`):
// esto no es una pantalla nueva, es el paso «Configura» sabiendo decir lo que un
// entreno de correr necesita decir.
//
// Dos decisiones de forma:
//
//  · UN PASO SE EDITA EN UNA HOJA, no en la lista. La lista es para VER el
//    entreno entero de un vistazo —que es lo que el atleta viene a comprobar— y
//    seis controles por fila lo harían ilegible en cuanto haya tres pasos.
//  · EL GRUPO LLEVA SU «repetir ×N» ARRIBA, junto a sus pasos. Es lo que
//    distingue «5×(800 + 400)» de «800·1200·800», y ponerlo en otro sitio
//    obligaría a leer dos zonas de la pantalla para saber cuánto vas a correr.

struct FreeRunBuilderView: View {
    @Binding var plan: FreeRunPlan

    /// Qué paso está abierto en la hoja. La identidad es dónde vive, no el
    /// índice: borrar otro paso mientras editas no puede cambiarte de sitio.
    @State private var editando: Destino?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            fase(titulo: "Calentamiento",
                 paso: plan.calentamiento,
                 destino: .calentamiento,
                 anadir: { plan.calentamiento = FreeRunPlan.calentamientoPorDefecto },
                 quitar: { plan.calentamiento = nil })

            principal

            fase(titulo: "Vuelta a la calma",
                 paso: plan.vuelta,
                 destino: .vuelta,
                 anadir: { plan.vuelta = FreeRunPlan.vueltaPorDefecto },
                 quitar: { plan.vuelta = nil })
        }
        .sheet(item: $editando) { destino in
            FreeRunPasoSheet(
                paso: Binding(
                    get: { paso(en: destino) ?? FreeRunPaso() },
                    set: { escribir($0, en: destino) }
                )
            )
        }
    }

    // MARK: - Las fases de los extremos

    @ViewBuilder
    private func fase(titulo: String,
                      paso: FreeRunPaso?,
                      destino: Destino,
                      anadir: @escaping () -> Void,
                      quitar: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TituloSeccionDia(titulo)
            if let paso {
                filaDePaso(paso, destino: destino, quitar: quitar)
                    .tarjetaDia()
            } else {
                BotonAnadirLibre(titulo: "Añadir \(titulo.lowercased())", accion: anadir)
            }
        }
    }

    // MARK: - La parte principal

    private var principal: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            TituloSeccionDia("El entreno")
            ForEach(Array(plan.grupos.enumerated()), id: \.element.id) { i, grupo in
                grupoCard(indice: i, grupo: grupo)
            }
            if plan.grupos.count < FreeRunPlan.maxGrupos {
                // Un segundo grupo es lo que permite «60' suave + 6×30" fuerte»: dos cosas distintas en
                // el mismo entreno.
                BotonAnadirLibre(titulo: "Añadir otro bloque") {
                    plan.grupos.append(FreeRunGrupo(pasos: [FreeRunPaso()]))
                }
            }
        }
    }

    private func grupoCard(indice i: Int, grupo: FreeRunGrupo) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(spacing: Theme.Spacing.s) {
                RotuloControlLibre("Repetir")
                Spacer(minLength: 0)
                pasoDeRepeticiones(indice: i, valor: grupo.repeticiones)
                if plan.grupos.count > 1 {
                    botonQuitar(etiqueta: "Quitar bloque") { plan.grupos.remove(at: i) }
                }
            }
            ForEach(Array(grupo.pasos.enumerated()), id: \.element.id) { j, paso in
                filaDePaso(paso, destino: .paso(grupo: grupo.id, paso: paso.id), quitar: {
                    quitarPaso(grupo: i, paso: j)
                })
                .background(Theme.Color.surfaceSunken, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
            }
            if grupo.pasos.count < FreeRunPlan.maxPasosPorGrupo {
                BotonAnadirLibre(titulo: "Añadir tramo") {
                    plan.grupos[i].pasos.append(siguientePaso(en: grupo))
                }
            }
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
    }

    /// Alterna trabajo y recuperación al añadir: tras una serie lo siguiente casi siempre es su
    /// recuperación, y tras una recuperación, otra serie. Es un punto de partida editable, no una regla.
    private func siguientePaso(en grupo: FreeRunGrupo) -> FreeRunPaso {
        guard let ultimo = grupo.pasos.last else { return FreeRunPaso() }
        if ultimo.rol == .trabajo {
            return FreeRunPaso(rol: .recuperacion, medida: .tiempo, segundos: 90,
                               objetivo: .zona, zona: 1, modo: .trote)
        }
        return FreeRunPaso(rol: .trabajo, medida: ultimo.medida,
                           metros: ultimo.metros, segundos: ultimo.segundos,
                           objetivo: .zona, zona: 4)
    }

    private func pasoDeRepeticiones(indice: Int, valor: Int) -> some View {
        HStack(spacing: Theme.Spacing.xs) {
            botonRedondo("minus", activo: valor > 1) {
                plan.grupos[indice].repeticiones = max(1, valor - 1)
            }
            Text("\(valor)×")
                .papel(.seccion)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .frame(minWidth: 48)
            botonRedondo("plus", activo: valor < FreeRunPlan.maxRepeticiones) {
                plan.grupos[indice].repeticiones = min(FreeRunPlan.maxRepeticiones, valor + 1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Repeticiones del bloque")
        .accessibilityValue("\(valor)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: plan.grupos[indice].repeticiones = min(FreeRunPlan.maxRepeticiones, valor + 1)
            case .decrement: plan.grupos[indice].repeticiones = max(1, valor - 1)
            @unknown default: break
            }
        }
    }

    // MARK: - Piezas

    /// Un tramo en una fila: el punto de su zona, lo que es en una línea y, a la derecha, quitarlo. La
    /// fila entera abre la hoja del tramo.
    private func filaDePaso(_ paso: FreeRunPaso, destino: Destino, quitar: @escaping () -> Void) -> some View {
        HStack(spacing: 0) {
            Button {
                Haptics.light()
                editando = destino
            } label: {
                HStack(spacing: Theme.Spacing.m) {
                    Circle()
                        .fill(colorDelPaso(paso))
                        .frame(width: 10, height: 10)
                    Text(paso.linea)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    IconoDia(.chevron, tam: 16)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(.leading, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .frame(minHeight: Theme.Size.accion)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityHint("Editar el tramo")

            botonQuitar(etiqueta: "Quitar tramo", accion: quitar)
        }
    }

    /// El punto lleva el color de la ZONA cuando el paso va por zona — el mismo código de color que la
    /// muñeca. Sin zona no se pinta un color inventado: el trabajo va en la tinta del tema, la
    /// recuperación en gris.
    private func colorDelPaso(_ paso: FreeRunPaso) -> Color {
        guard paso.objetivo == .zona, let z = HRZone(rawValue: paso.zona) else {
            return paso.rol == .trabajo ? Theme.Color.foreground : Theme.Color.muted
        }
        return z.color
    }

    private func botonQuitar(etiqueta: String, accion: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            IconoDia(.cerrar, tam: 16, peso: .bold)
                .foregroundStyle(Theme.Color.muted)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.9))
        .accessibilityLabel(etiqueta)
    }

    private func botonRedondo(_ simbolo: String, activo: Bool, accion: @escaping () -> Void) -> some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            ChapitaDia(tam: 40) { Image(systemName: simbolo).font(.system(size: 16, weight: .bold)) }
                .opacity(activo ? 1 : 0.4)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.9))
        .disabled(!activo)
        .accessibilityHidden(true)
    }

    // MARK: - Dónde vive cada paso

    /// La identidad de un paso es DÓNDE vive, no su índice: borrar otro paso
    /// mientras la hoja está abierta no puede cambiarte de sitio.
    enum Destino: Identifiable, Hashable {
        case calentamiento
        case vuelta
        case paso(grupo: UUID, paso: UUID)

        var id: String {
            switch self {
            case .calentamiento: return "cal"
            case .vuelta: return "vuelta"
            case let .paso(g, p): return "\(g)-\(p)"
            }
        }
    }

    private func paso(en destino: Destino) -> FreeRunPaso? {
        switch destino {
        case .calentamiento: return plan.calentamiento
        case .vuelta: return plan.vuelta
        case let .paso(g, p):
            return plan.grupos.first { $0.id == g }?.pasos.first { $0.id == p }
        }
    }

    private func escribir(_ paso: FreeRunPaso, en destino: Destino) {
        switch destino {
        case .calentamiento: plan.calentamiento = paso
        case .vuelta: plan.vuelta = paso
        case let .paso(g, p):
            guard let i = plan.grupos.firstIndex(where: { $0.id == g }),
                  let j = plan.grupos[i].pasos.firstIndex(where: { $0.id == p }) else { return }
            plan.grupos[i].pasos[j] = paso
        }
    }

    /// Quitar el ÚLTIMO paso de un grupo se lleva el grupo: un bloque vacío no
    /// es nada y dejarlo obligaría a borrarlo dos veces. El último grupo del
    /// plan no se puede vaciar — sin él no queda entreno.
    private func quitarPaso(grupo i: Int, paso j: Int) {
        guard plan.grupos.indices.contains(i), plan.grupos[i].pasos.indices.contains(j) else { return }
        if plan.grupos[i].pasos.count > 1 {
            plan.grupos[i].pasos.remove(at: j)
        } else if plan.grupos.count > 1 {
            plan.grupos.remove(at: i)
        }
    }
}

// MARK: - La hoja de un paso

struct FreeRunPasoSheet: View {
    @Binding var paso: FreeRunPaso
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        MarcoHojaLibre(titulo: paso.rol == .trabajo ? "Tramo" : "Recuperación", alTerminar: { dismiss() }) {
            FreeKindToggle(
                title: "Qué es",
                options: FreeRunPaso.Rol.allCases,
                selection: $paso.rol,
                label: { $0.labelES }
            )
            .onChange(of: paso.rol) { _, nuevo in
                // Una recuperación nace trotando, que es lo que se hace en una serie de calle; una
                // serie no tiene modo.
                paso.modo = nuevo == .recuperacion ? (paso.modo ?? .trote) : nil
            }

            FreeKindToggle(
                title: "Cómo acaba",
                options: FreeRunPaso.Medida.allCases,
                selection: $paso.medida,
                label: { $0.labelES }
            )
            medidaControl

            if paso.rol == .recuperacion {
                FreeKindToggle(
                    title: "Cómo se recupera",
                    options: RunRecoveryMode.allCases,
                    selection: Binding(
                        get: { paso.modo ?? .trote },
                        set: { paso.modo = $0 }
                    ),
                    label: { RunLegDisplay.recoveryModeWord($0).capitalizedFirst }
                )
            }

            FreeKindToggle(
                title: "Objetivo",
                options: FreeRunPaso.Objetivo.allCases,
                selection: $paso.objetivo,
                label: { $0.labelES }
            )
            objetivoControl

            cuestaControl
        }
    }

    @ViewBuilder
    private var medidaControl: some View {
        switch paso.medida {
        case .distancia:
            FreeStepper(label: "Distancia", value: $paso.metros,
                        step: FreeRunPlan.pasoMetros, minValue: FreeRunPlan.pasoMetros) {
                Formato.distancia(Double($0)) ?? "\($0) m"
            }
        case .tiempo:
            FreeStepper(label: "Tiempo", value: $paso.segundos,
                        step: FreeRunPlan.pasoSegundos, minValue: FreeRunPlan.pasoSegundos) {
                Formato.clock($0, subMinuto: .segundos)
            }
        case .abierto:
            // Un tramo abierto no lleva número: lo cierras tú corriendo. Decirlo
            // aquí evita que parezca que falta rellenar algo.
            NotaLibre("El tramo lo cierras tú desde el reloj.")
        }
    }

    @ViewBuilder
    private var objetivoControl: some View {
        switch paso.objetivo {
        case .zona:
            FreeZonePicker(zone: $paso.zona)
        case .ritmo:
            FreeStepper(label: "Ritmo /km", value: $paso.ritmoSegPorKm,
                        step: FreeRunPlan.pasoRitmo, minValue: 120) {
                Formato.ritmoCifras(Double($0))
            }
        case .rpe:
            FreeStepper(label: "RPE",
                        value: Binding(get: { Int(paso.rpe) }, set: { paso.rpe = Double($0) }),
                        step: 1, minValue: 1, maxValue: 10) { "\($0)" }
        case .ninguno:
            // Sin objetivo es una respuesta legítima: hay entrenos que se corren
            // por sensaciones. No se rellena por él con una zona por defecto.
            NotaLibre("Sin objetivo: lo corres por sensaciones.")
        }
    }

    private var cuestaControl: some View {
        FreeStepper(label: "Cuesta",
                    value: Binding(
                        get: { Int((paso.cuestaPct ?? 0).rounded()) },
                        set: { paso.cuestaPct = $0 <= 0 ? nil : Double($0) }
                    ),
                    step: 1, minValue: 0, maxValue: 15) {
            $0 == 0 ? "Llano" : "\($0)%"
        }
    }
}

private extension String {
    var capitalizedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
