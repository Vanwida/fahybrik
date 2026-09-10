import SwiftUI

// Bandas de correr al aire — sujeto/apoyos/acción dentro de `RunLiveShellView`.
// OutdoorRunHUDView (previews) reutiliza estas mismas bandas; no monta otro MarcoVivo.

struct RunOutdoorSubjectBand: View {
    @Bindable var model: OutdoorRunHUDModel

    var body: some View {
        if model.session.calentamientoEsListaEnLaCarrera,
           let region = model.session.currentBlockRegion {
            StructuralBlockChecklist(
                segments: model.session.plan.segments(in: region),
                phaseName: region.phase.displayName
            )
        } else if model.isCountIn {
            EtiquetaSujeto(texto: "Prepárate")
            Numeral(texto: "\(max(0, model.countInRemaining))", tono: Theme.Color.accentText)
            Text("Empieza la carrera")
                .scaledFont(15, weight: .medium, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.muted)
        } else if model.isRecovery {
            EtiquetaSujeto(texto: "Recuperación")
            Numeral(texto: Formato.clock(model.legTimeRemaining ?? 0))
        } else {
            switch model.runTarget {
            case let .zone(objetivo): sujetoDeZona(objetivo)
            case let .pace(objetivo): sujetoDeRitmo(objetivo)
            case .none:               sujetoLibre
            }
        }
    }

    @ViewBuilder
    private func sujetoDeZona(_ objetivo: HRZone) -> some View {
        if let bpm = model.currentBpm {
            EtiquetaSujeto(texto: Vocab.fc, tono: model.liveZone?.color ?? Theme.Color.muted)
            Numeral(texto: "\(bpm)",
                    tono: model.liveZone?.color ?? Theme.Color.foreground,
                    unidad: Vocab.ppm)
        } else {
            EtiquetaSujeto(texto: lecturaViva.etiqueta)
            Numeral(texto: lecturaViva.texto, unidad: lecturaViva.unidad)
        }
        BandaZonasOutdoor(actual: model.liveZone, objetivo: objetivo)
        Text(fraseDeZona(objetivo))
            .scaledFont(15, weight: .heavy, relativeTo: .subheadline, italic: true)
            .foregroundStyle(model.liveZone == objetivo ? Theme.Color.foreground : Theme.Color.warning)
            .multilineTextAlignment(.center)
        if let zonas = model.hrZones, zonas.estimated {
            Text(zonas.sourceLabel)
                .scaledFont(11, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private func fraseDeZona(_ objetivo: HRZone) -> String {
        guard let actual = model.liveZone else { return "Sin pulso no hay zona que enseñar" }
        if actual == objetivo { return "Estás donde toca" }
        if actual.rawValue < objetivo.rawValue {
            return "Vas por debajo. Aprieta un poco para volver a \(objetivo.label)"
        }
        return "Te has ido a \(actual.label). Afloja un poco y vuelve a \(objetivo.label)"
    }

    @ViewBuilder
    private func sujetoDeRitmo(_ objetivo: PaceTarget) -> some View {
        if let ritmo = model.livePaceSecPerKm {
            EtiquetaSujeto(texto: Vocab.ritmo)
            Numeral(texto: Formato.ritmoCifras(Double(ritmo)),
                    tono: colorDeEstado(model.heroStatus),
                    unidad: Formato.UnidadRitmo.porKm.rawValue)
            if let desvio = desvioConSigno(ritmo, objetivo) {
                DeltaPastilla(delta: Delta(valor: Double(desvio),
                                           unidad: "s",
                                           sentido: .menos,
                                           sufijo: Vocab.vsObjetivo,
                                           textoNulo: "en el objetivo"))
            }
        } else if let ordenado = objetivo.label {
            EtiquetaSujeto(texto: Vocab.objetivo)
            Numeral(texto: ordenado, unidad: Formato.UnidadRitmo.porKm.rawValue)
            Text(model.gpsQuality.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
        } else {
            EtiquetaSujeto(texto: lecturaViva.etiqueta)
            Numeral(texto: lecturaViva.texto, unidad: lecturaViva.unidad)
            Text(model.gpsQuality.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    @ViewBuilder
    private var sujetoLibre: some View {
        EtiquetaSujeto(texto: lecturaViva.etiqueta)
        Numeral(texto: lecturaViva.texto, unidad: lecturaViva.unidad)
    }

    private var lecturaViva: (etiqueta: String, texto: String, unidad: String?) {
        guard let ritmo = model.livePaceSecPerKm else {
            return (Vocab.tiempo, Formato.clock(model.legElapsedEffective, anchoFijo: true), nil)
        }
        return (Vocab.ritmo, Formato.ritmoCifras(Double(ritmo)), Formato.UnidadRitmo.porKm.rawValue)
    }

    private func desvioConSigno(_ ritmo: Int, _ objetivo: PaceTarget) -> Int? {
        guard let magnitud = model.runTarget.paceDeviationSecPerKm(currentSecPerKm: ritmo) else { return nil }
        switch objetivo.status(currentSecPerKm: ritmo) {
        case .tooSlow:  return magnitud
        case .tooFast:  return -magnitud
        case .inTarget: return 0
        case .unknown:  return nil
        }
    }

    private func colorDeEstado(_ estado: TargetStatus) -> Color {
        switch estado {
        case .inTarget: return Theme.Color.ok
        case .tooFast:  return Theme.Color.warning
        case .tooSlow:  return Theme.Color.danger
        case .unknown:  return Theme.Color.foreground
        }
    }
}

struct RunOutdoorApoyosBand: View {
    @Bindable var model: OutdoorRunHUDModel

    private var esObjetivoDeZona: Bool {
        if case .zone = model.runTarget { return true }
        return false
    }

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            FilaApoyos {
                if model.currentBpm != nil, esObjetivoDeZona {
                    ApoyoVivo(etiqueta: Vocab.ritmo,
                              valor: model.livePaceSecPerKm.map { Formato.ritmoCifras(Double($0)) },
                              unidad: Formato.UnidadRitmo.porKm.rawValue,
                              ausente: model.gpsQuality.label)
                } else {
                    ApoyoVivo(etiqueta: Vocab.fc,
                              valor: model.currentBpm.map { "\($0)" },
                              unidad: Vocab.ppm,
                              tono: model.liveZone?.color ?? Theme.Color.foreground,
                              ausente: "sin reloj")
                }
                ApoyoVivo(etiqueta: Vocab.tiempo,
                          valor: Formato.clock(model.legElapsedEffective, anchoFijo: true))
                ApoyoVivo(etiqueta: Vocab.distancia,
                          valor: Formato.distanciaCubierta(model.coveredMeters))
            }
            objetivoDelTramo
            referenciaDeGuia
            RunRouteMapView(coordinates: model.coordinates,
                            quality: model.gpsQuality,
                            paused: model.session.isPaused)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1))
        }
    }

    @ViewBuilder
    private var objetivoDelTramo: some View {
        if !model.isRecovery {
            switch model.currentLeg.goal {
            case let .distance(target):
                GoalProgress(caption: "Distancia del tramo",
                             primary: Formato.distancia(model.legCoveredMeters) ?? "0 m",
                             secondary: Formato.distancia(target) ?? "0 m",
                             fraction: model.progressFraction,
                             complete: model.progressFraction >= 1)
            case let .time(target):
                GoalProgress(caption: "Tiempo del tramo",
                             primary: Formato.clock(model.legElapsedEffective),
                             secondary: Formato.clock(target),
                             fraction: model.progressFraction,
                             complete: model.progressFraction >= 1)
            case .open:
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private var referenciaDeGuia: some View {
        let partes: [String] = {
            var p: [String] = []
            if let inc = model.prescribedInclinePct, inc > 0 {
                p.append("Inclinación \(Formato.esDecimal(inc))%")
            }
            if let cad = model.prescribedCadenceSpm { p.append("Cadencia \(cad) \(Vocab.cadencia)") }
            return p
        }()
        if !partes.isEmpty {
            Text(partes.joined(separator: " · "))
                .scaledFont(12, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
        }
    }
}

struct RunOutdoorAccionBand: View {
    @Bindable var model: OutdoorRunHUDModel

    var body: some View {
        if model.session.calentamientoCorridoPorTramos {
            FranjaAccion(titulo: "TRAMO HECHO",
                         unicaSalida: model.currentLeg.goal == .open,
                         nota: notaDeAccion) {
                model.endLegNow()
            }
        } else if model.session.currentBlockIsStructural {
            FranjaAccion(titulo: model.session.tituloHechoEstructural,
                         unicaSalida: !model.session.calentamientoEnLaCarrera,
                         nota: nil) {
                model.session.completeStructuralBlock()
            }
        } else {
            FranjaAccion(titulo: model.isStructured ? "TRAMO HECHO" : "HECHO",
                         unicaSalida: model.currentLeg.goal == .open,
                         nota: notaDeAccion) {
                model.endLegNow()
            }
        }
    }

    private var notaDeAccion: String? {
        switch model.currentLeg.goal {
        case .distance: return "se cierra solo al llegar"
        case .time:     return "se cierra solo al acabar"
        case .open:     return nil
        }
    }
}

private struct BandaZonasOutdoor: View {
    let actual: HRZone?
    let objetivo: HRZone

    var body: some View {
        HStack(spacing: 4) {
            ForEach(HRZone.allCases, id: \.rawValue) { z in
                let viva = z == actual
                VStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .fill(z.color)
                        .opacity(viva ? 1 : 0.2)
                        .frame(height: viva ? 20 : 14)
                    Text(z == objetivo && !viva ? "\(z.label) ·" : z.label)
                        .scaledFont(10, weight: viva ? .heavy : .semibold,
                                    relativeTo: .caption2, italic: viva)
                        .uppercaseTracked(0.9)
                        .foregroundStyle(viva ? z.color : Theme.Color.faint)
                }
            }
        }
        .animation(.easeInOut(duration: 0.4), value: actual)
    }
}
