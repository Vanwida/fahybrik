import SwiftUI

// Tests guiados — lo que se lee tras GUARDAR un resultado, dentro de la hoja de captura. Feedback
// honesto y nada más: cada marca guardada con su cambio contra la anterior (lo calcula el servidor), la
// tarjeta «Tus zonas se han actualizado» con el umbral NUEVO releído (jamás calculado en el cliente) y su
// cambio contra el de antes de guardar, y los demás efectos (1RM, nivel) tal como los reportó el puente.
//
// El título de la hoja («Resultado guardado» / «Récord del test») y el botón «Hecho» son del marco de la
// hoja: aquí solo va el contenido.
struct TestResultDoneView: View {
    let result: RecordBatteryResult?
    let specs: [StoreResultSpec]
    /// Relectura de api/athlete/zones tras guardar (el umbral nuevo, verdad del servidor).
    let newZoneProfiles: [ZoneModalityProfile]?
    /// El umbral por modalidad tal como estaba ANTES de guardar: alimenta el cambio.
    let preThresholds: [String: Double]

    /// El título que la hoja lleva sobre este contenido: récord si el puente reporta una marca batida.
    static func titulo(result: RecordBatteryResult?) -> String {
        result?.improvedEntries.isEmpty == false ? "Récord del test" : "Resultado guardado"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            // Cada marca guardada con su cambio contra la anterior (verdad del servidor).
            if let entries = result?.entries, !entries.isEmpty {
                ListaDia {
                    ForEach(entries, id: \.slug) { entryRow($0) }
                }
            }

            // «Tus zonas se han actualizado»: el umbral NUEVO (releído, resuelto por el servidor) y su
            // cambio contra el de antes de guardar.
            if let result, !result.zonesDerived.isEmpty {
                zonesUpdated(result.zonesDerived)
            }

            let effects = result?.secondaryEffects ?? []
            if effects.isEmpty, result?.entries?.isEmpty != false, result?.zonesDerived.isEmpty != false {
                Text("Tu marca queda registrada en tu perfil.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
            } else if !effects.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    ForEach(effects, id: \.self) { effect in
                        HStack(spacing: Theme.Spacing.m) {
                            IconoDia(.sube, tam: 20, peso: .bold)
                                .foregroundStyle(Theme.Color.accentText)
                            Text(effect)
                                .papel(.cuerpoFuerte)
                                .foregroundStyle(Theme.Color.foreground)
                        }
                    }
                }
                .padding(Theme.Spacing.l + 2)
                .tarjetaDia(realce: true, alAncho: true)
            }
        }
    }

    /// Una marca guardada: nombre · valor · cambio (verde o rojo según la dirección de mejora de su unidad;
    /// «primera marca» cuando no había nada que batir). Con texto grande baja de línea en vez de apretarse.
    private func entryRow(_ entry: RecordBatteryResult.EntryDelta) -> some View {
        let spec = specs.first { $0.slug == entry.slug }
        let unit = spec?.unit ?? ""
        let nombre = Text(spec?.label ?? entry.slug)
            .papel(.cuerpoFuerte)
            .foregroundStyle(Theme.Color.foreground)
        let valor = Text(BenchmarkDelta.valueLabel(unit: unit, value: entry.value))
            .papel(.cifra)
            .foregroundStyle(Theme.Color.foreground)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.m) {
                nombre
                Spacer(minLength: Theme.Spacing.s)
                valor
                cambio(entry, unit: unit)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                nombre
                HStack(spacing: Theme.Spacing.m) {
                    valor
                    cambio(entry, unit: unit)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l + 2)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func cambio(_ entry: RecordBatteryResult.EntryDelta, unit: String) -> some View {
        if let prev = entry.prevValue {
            BenchmarkDeltaChip(unit: unit, delta: entry.value - prev)
        } else {
            Text("primera marca")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// Las zonas actualizadas, por modalidad derivada.
    private func zonesUpdated(_ derived: [RecordBatteryResult.ZoneDerived]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SubtituloDia("Tus zonas se han actualizado")
            ListaDia {
                ForEach(derived, id: \.modality) { zoneUpdateRow($0) }
            }
            Text("El umbral nuevo ya marca los ritmos de tus próximos entrenos.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func zoneUpdateRow(_ zone: RecordBatteryResult.ZoneDerived) -> some View {
        // Se prefiere el perfil releído (etiqueta y unidad tal como las pinta el servidor); mientras la
        // relectura llega, el umbral de la respuesta con la unidad intrínseca de la modalidad (correr →
        // /km, remo → /500m).
        let profile = newZoneProfiles?.first { $0.modality == zone.modality }
        let thresholdText = profile?.thresholdLabel
            ?? "\(Formato.ritmoCifras(Double(Int(zone.thresholdS.rounded()))))\(zone.modality == "run" ? Formato.UnidadRitmo.porKm.rawValue : Formato.UnidadRitmo.por500m.rawValue)"
        let delta = preThresholds[zone.modality].map { zone.thresholdS - $0 }
        let nombre = Text(profile?.modalityLabel ?? RecordBatteryResult.modalityLabel(zone.modality).capitalized)
            .papel(.cuerpoFuerte)
            .foregroundStyle(Theme.Color.foreground)
        let umbral = Text("umbral \(thresholdText)")
            .papel(.cifra)
            .foregroundStyle(Theme.Color.foreground)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.m) {
                nombre
                Spacer(minLength: Theme.Spacing.s)
                umbral
                if let delta, delta != 0 { BenchmarkDeltaChip(unit: "seconds", delta: delta) }
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                nombre
                HStack(spacing: Theme.Spacing.m) {
                    umbral
                    if let delta, delta != 0 { BenchmarkDeltaChip(unit: "seconds", delta: delta) }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l + 2)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - El paso final de la hoja

/// El paso final de la hoja de captura: el marco con el título que toca («Resultado guardado» o «Récord
/// del test»), lo que se guardó y «Hecho» anclado. Pieza propia para poder mirarla sin pasar por el guardado.
struct TestResultPasoFinal: View {
    let result: RecordBatteryResult?
    let specs: [StoreResultSpec]
    let newZoneProfiles: [ZoneModalityProfile]?
    let preThresholds: [String: Double]
    let onDone: () -> Void

    var body: some View {
        MarcoDeHojaDia(TestResultDoneView.titulo(result: result), cerrar: onDone) {
            TestResultDoneView(result: result, specs: specs, newZoneProfiles: newZoneProfiles, preThresholds: preThresholds)
        } accion: {
            BotonAccionDia("Hecho", relleno: .acento, completa: true, alto: Theme.Size.accionAnclada, impacto: .medio, accion: onDone)
        }
    }
}
