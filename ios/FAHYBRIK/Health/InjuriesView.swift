import SwiftUI

// «MOLESTIAS» — el atleta registra por su cuenta lo que le molesta y sigue su evolución con su coach (#16).
// Se empuja desde Perfil › Entreno. Dos secciones: «Activas» (episodios abiertos) e «Historial» (resueltos). Un
// «+» abre la hoja de reporte (`ReportInjurySheet`); tocar una molestia abre su evolución (`InjuryDetailView`:
// transición de estado + nota + la línea del tiempo con el coach).
//
// La gravedad y el estado se dicen con una marca de color del tema y su palabra (`InjuryPiezas`); el acento del
// club no es un color de dato. La vista se parte en contenedor (carga) y `InjuriesCuerpo` (pinta un estado ya
// resuelto), para montarla con datos de ejemplo en la galería.

struct InjuriesView: View {
    let bearer: String?
    /// Agnostic coach display name (from the athlete's plan payload); nil → the
    /// copy falls back to "tu coach". Never a hardcoded name.
    let coachName: String?
    /// FREE tier switch (athlete without coach). False reframes the whole
    /// surface as the athlete's OWN log: no "tu coach ajusta", no coach note —
    /// registering and following the episode is the value in itself.
    var hasCoach: Bool = true

    @State private var carga: CargaDePantallaPerfil<[AthleteInjury]> = .cargando
    @State private var showReport = false

    var body: some View {
        InjuriesCuerpo(
            carga: carga, coachName: coachName, hasCoach: hasCoach,
            destino: { injury in
                InjuryDetailView(
                    injury: injury, bearer: bearer, coachName: coachName, hasCoach: hasCoach,
                    onChanged: { await load() }
                )
            },
            alReportar: { showReport = true },
            alReintentar: { Task { await load() } }
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Haptics.light()
                    showReport = true
                } label: {
                    Label("Reportar", systemImage: "plus")
                }
                .foregroundStyle(Theme.Color.accentText)
                .disabled(bearer == nil)
                .accessibilityLabel("Reportar una molestia")
            }
        }
        .sheet(isPresented: $showReport) {
            ReportInjurySheet(bearer: bearer, coachName: coachName, hasCoach: hasCoach) { await load() }
        }
        .task { await load() }
    }

    private func load() async {
        guard let bearer else { carga = .error; return }
        if case .error = carga { carga = .cargando }
        do {
            carga = .datos(try await InjuryService.fetch(bearer: bearer))
        } catch {
            carga = .error
        }
    }
}

/// Lo que se pinta de «Molestias» con el estado ya resuelto. `destino` construye la pantalla de una molestia.
struct InjuriesCuerpo<Destino: View>: View {
    let carga: CargaDePantallaPerfil<[AthleteInjury]>
    let coachName: String?
    var hasCoach = true
    @ViewBuilder let destino: (AthleteInjury) -> Destino
    var alReportar: () -> Void = {}
    var alReintentar: () -> Void = {}

    private var coachLabel: String { etiquetaDeCoach(coachName) }

    var body: some View {
        switch carga {
        case .cargando:
            PantallaPerfil(titulo: "Molestias") { EsqueletoDeFilasPerfil(filas: 3, conFicha: false) }
        case .error:
            PantallaPerfil(titulo: "Molestias", alto: .llena) {
                ErrorDePantallaPerfil(kicker: "Molestias", titulo: "No pudimos cargar tus molestias", alReintentar: alReintentar)
            }
        case let .datos(injuries) where injuries.isEmpty:
            PantallaPerfil(titulo: "Molestias", alto: .llena) { vacio }
        case let .datos(injuries):
            PantallaPerfil(titulo: "Molestias") {
                Text(hasCoach
                     ? "Si algo te molesta, repórtalo. \(coachLabel.conMayusculaInicial) ajusta tu carga para que entrenes sin arriesgar."
                     : "Si algo te molesta, regístralo. Ver cómo evoluciona te ayuda a ajustar tu carga y entrenar sin arriesgar.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                let activas = injuries.filter(\.isOpen)
                let resueltas = injuries.filter { !$0.isOpen }
                if !activas.isEmpty { seccion("Activas", activas) }
                if !resueltas.isEmpty { seccion("Historial", resueltas) }
            }
        }
    }

    /// Nada que reportar es BUENA noticia: el sujeto es el tono de «hecho», con la salida de reportar si algo se tuerce.
    private var vacio: some View {
        SujetoDia(tono: .ok, etiqueta: "Sin molestias registradas") {
            KickerDia("Molestias")
            TituloDia("Sin molestias registradas")
            ApoyoDia(hasCoach
                     ? "Cuando algo te moleste o te lesiones, repórtalo aquí. \(coachLabel.conMayusculaInicial) lo tendrá en cuenta al preparar tu semana."
                     : "Cuando algo te moleste o te lesiones, regístralo aquí. Así sabes qué arrastras y cómo evoluciona.")
        } abajo: {
            Button {
                Haptics.light()
                alReportar()
            } label: {
                AccionDia("Reportar molestia", glifo: .mas)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
    }

    private func seccion(_ titulo: String, _ filas: [AthleteInjury]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo)
            GrupoPerfil {
                ForEach(filas) { injury in
                    NavigationLink {
                        destino(injury)
                    } label: {
                        FilaDeMolestia(injury: injury)
                    }
                    .filaTocablePerfil()
                }
            }
        }
    }
}

// MARK: - Una fila

private struct FilaDeMolestia: View {
    let injury: AthleteInjury

    var body: some View {
        FilaPerfil(
            titulo: injury.zone.label,
            detalle: detalle,
            marca: injury.status == .resuelta ? nil : injury.status.marca
        ) {
            HStack(spacing: Theme.Spacing.s) {
                if injury.status == .resuelta {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(Theme.Color.ok)
                        .accessibilityHidden(true)
                } else {
                    PastillaConMarcaPerfil(texto: injury.severity.label, marca: injury.severity.marca)
                }
                ChevronDeFilaPerfil()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accesible(injury))
        .accessibilityAddTraits(.isButton)
    }

    private var detalle: String {
        injury.status == .resuelta
            ? Self.resuelta(injury)
            : "\(injury.status.label) · \(InjuryDateText.since(injury.onsetDate))"
    }

    static func resuelta(_ injury: AthleteInjury) -> String {
        if let d = InjuryDateText.shortDate(injury.resolvedDate) {
            return "\(injury.severity.label) · resuelta el \(d)"
        }
        return "\(injury.severity.label) · resuelta"
    }

    static func accesible(_ injury: AthleteInjury) -> String {
        if injury.status == .resuelta {
            return "\(injury.zone.label), \(resuelta(injury))"
        }
        return "\(injury.zone.label), \(injury.status.label), gravedad \(injury.severity.label), \(InjuryDateText.since(injury.onsetDate))"
    }
}
