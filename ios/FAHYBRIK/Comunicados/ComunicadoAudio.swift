import SwiftUI

// LA VOZ DEL COACH DENTRO DE UN COMUNICADO.
//
// «Ahora te hago un podcast»: la explicación hablada es la mitad del valor de un
// feedback, y hoy vive en un audio de mensajería que nadie vuelve a encontrar.
// Aquí suena DENTRO de lo que explica, sin salir a ningún sitio, y se queda
// donde está el resto: si en octubre vuelve al briefing, la voz sigue ahí.
//
// UNA por comunicado y en los CINCO tipos. No es de la nota: un protocolo de día
// de carrera con la voz del coach encima es exactamente el mismo caso.
//
// El motor es el compartido (`Audio/NotaDeVoz.swift`), el mismo que suena en el
// chat: arrancar aquí pausa la burbuja que estuviera sonando allí.

// MARK: - El bearer, para poder ir a por los bytes

private struct BearerDeSesionKey: EnvironmentKey {
    static let defaultValue: String? = nil
}

extension EnvironmentValues {
    /// La sesión del atleta, para las piezas hondas que tienen que pedir un
    /// fichero protegido. Viaja por el entorno y no por parámetro porque si no
    /// habría que cruzarlo por los cinco cuerpos de detalle sólo para que llegue
    /// a una fila; nulo por defecto, así que una captura de diseño dibuja igual.
    var bearerDeSesion: String? {
        get { self[BearerDeSesionKey.self] }
        set { self[BearerDeSesionKey.self] = newValue }
    }
}

// MARK: - La fila

/// El reproductor, bajo el titular del comunicado. Va ahí y no al pie porque es
/// de QUIÉN te habla, no de lo que te pide: el atleta le da al play y sigue
/// leyendo mientras suena.
struct AudioDelComunicado: View {
    let comunicado: Comunicado

    @Environment(\.bearerDeSesion) private var bearer
    @StateObject private var reproductor = ReproductorDeVoz()

    private var fuente: FuenteDeVoz { FuenteDeVoz(remota: comunicado.audioUrl) }

    /// Cuánto dura, si se sabe. Primero la del fichero ya cargado, luego la que
    /// vino con el comunicado. Sin ninguna de las dos NO se escribe un «0:00»:
    /// un cero plausible es exactamente lo que esta app lleva retirando.
    private var duracion: String? {
        if let real = reproductor.duracionReal, real > 0 { return Formato.clock(real) }
        if let segundos = comunicado.audioSeconds, segundos > 0 { return Formato.clock(segundos) }
        return nil
    }

    private var pie: String {
        if reproductor.fallo { return "No se ha podido cargar. Prueba otra vez." }
        let quien = "Nota de voz de \(comunicado.nombreCoach)"
        return duracion.map { "\(quien) · \($0)" } ?? quien
    }

    var body: some View {
        if comunicado.tieneAudio {
            HStack(spacing: Theme.Spacing.m) {
                boton
                VStack(alignment: .leading, spacing: 5) {
                    // Más barras que en la burbuja del chat: aquí la fila ocupa
                    // el ancho de la pantalla, y treinta barras repartidas por
                    // ahí dejan de parecer una voz y parecen una valla.
                    OndaConProgreso(
                        barras: OndaDeVoz.barras(semilla: fuente.semilla, cuantas: 64),
                        avance: reproductor.avance,
                        sonada: Theme.Color.accentText,
                        porSonar: Theme.Color.muted.opacity(0.4)
                    )
                    .frame(height: 20)
                    Text(pie)
                        .scaledFont(11.5, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(reproductor.fallo ? Theme.Color.danger : Theme.Color.faint)
                        .lineLimit(1)
                }
            }
            .padding(Theme.Spacing.m)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(pie)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(reproductor.sonando ? "Toca dos veces para pausar" : "Toca dos veces para escuchar")
            .accessibilityAction { reproductor.alternar(fuente: fuente, bearer: bearer) }
        }
    }

    private var boton: some View {
        Button {
            reproductor.alternar(fuente: fuente, bearer: bearer)
        } label: {
            Group {
                if reproductor.cargando {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    Image(systemName: glifo)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
            .frame(width: 40, height: 40)
            .background(Theme.Color.accent.opacity(0.15))
            .clipShape(Circle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityHidden(true)
    }

    private var glifo: String {
        if reproductor.fallo { return "exclamationmark.triangle.fill" }
        return reproductor.sonando ? "pause.fill" : "play.fill"
    }
}

// MARK: - En la lista

/// Que lo lleva, dicho sin abrirlo. Discreto a propósito: en la bandeja el color
/// es la cola de trabajo, y un audio no es una cola — es un motivo más para
/// entrar.
struct GlifoAudioComunicado: View {
    let comunicado: Comunicado

    var body: some View {
        if comunicado.tieneAudio {
            HStack(spacing: 4) {
                Image(systemName: "waveform")
                    .font(.system(size: 10, weight: .semibold))
                if let segundos = comunicado.audioSeconds, segundos > 0 {
                    MonoText(text: Formato.clock(segundos), size: 10, weight: .semibold,
                             color: Theme.Color.faint)
                }
            }
            .foregroundStyle(Theme.Color.faint)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Lleva nota de voz")
        }
    }
}
