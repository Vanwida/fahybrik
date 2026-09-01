import SwiftUI

// EL HOST DEL LIVE que aún no tenía marco propio.
//
// EMOM y fuerza ya montan `MarcoVivo`. Ergo, descanso, carrera, formatos,
// estructural y relevo eran sujetos metidos en el cromo antiguo. Aquí el
// sujeto sigue siendo ESA lectura (`ErgHUDContent`, `RestSurface`, el HUD
// de formato, `RunLiveHUD`…); cromo y acción son `LenguajeVivoUI`.
//
// No es un HUD nuevo. No es un tercer diseño. Es el mismo marco que ya
// hablan el hierro y el EMOM.

/// La acción de la quinta fila: una, o las dos del Death By.
enum AccionDelHost {
    case una(titulo: String, unicaSalida: Bool, nota: String?, act: () -> Void)
    case deathBy(falle: () -> Void, logre: () -> Void)
}

struct HostVivo<Cromo: View, Sujeto: View, Apoyos: View>: View {
    let session: WorkoutSession
    let accion: AccionDelHost
    @ViewBuilder var cromo: Cromo
    @ViewBuilder var sujeto: Sujeto
    @ViewBuilder var apoyos: Apoyos

    var body: some View {
        MarcoVivo {
            cromo
        } contexto: {
            contexto
        } sujeto: {
            BandaSujeto { sujeto }
        } apoyos: {
            apoyos
        } accion: {
            franja
        }
    }

    private var contexto: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 2) {
                Text(tituloDeContexto)
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote, italic: true)
                    .tracking(0.6)
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                if let sub = subtituloDeContexto {
                    Text(sub)
                        .scaledFont(12, weight: .medium, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            ChipPulsoVivo(session: session)
        }
    }

    private var tituloDeContexto: String {
        if session.tramoIsErg { return session.currentTramo.label }
        return session.currentSegment?.title ?? session.currentTramo.label
    }

    /// El formato que envuelve, cuando no ES el título. Un EMOM de máquina no
    /// puede perder el minuto: la lectura la tiene el ergo, el contexto dice
    /// el reloj que la envuelve.
    private var subtituloDeContexto: String? {
        if session.currentSegment?.isEMOM == true, session.tramoIsErg {
            return session.currentSegment?.title
        }
        if let nombre = session.currentSegment?.formatScheme?.displayName,
           nombre.caseInsensitiveCompare(tituloDeContexto) != .orderedSame {
            return nombre
        }
        return nil
    }

    @ViewBuilder
    private var franja: some View {
        switch accion {
        case let .una(titulo, unica, nota, act):
            BotonVivo(titulo: titulo, unicaSalida: unica, nota: nota, accion: act)
        case let .deathBy(falle, logre):
            HStack(spacing: Theme.Spacing.s) {
                Button(action: { Haptics.medium(); falle() }) {
                    Text("FALLÉ")
                        .scaledFont(17, weight: .heavy, relativeTo: .body, italic: true)
                        .tracking(1)
                        .foregroundStyle(Theme.Color.danger)
                        .frame(maxWidth: 120, maxHeight: .infinity)
                        .background(Theme.Color.surface.opacity(0.7))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                .stroke(Theme.Color.danger.opacity(0.55), lineWidth: 1.5)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel("Fallé, termina el Death By")
                BotonVivo(titulo: "LO LOGRÉ", unicaSalida: false, accion: logre)
            }
        }
    }
}

extension HostVivo where Apoyos == EmptyView {
    init(session: WorkoutSession,
         accion: AccionDelHost,
         @ViewBuilder cromo: () -> Cromo,
         @ViewBuilder sujeto: () -> Sujeto) {
        self.session = session
        self.accion = accion
        self.cromo = cromo()
        self.sujeto = sujeto()
        self.apoyos = EmptyView()
    }
}
