import SwiftUI

// EL AVISO — un mensaje que sale sobre la barra de pestañas, donde el pulgar no lo tapa.
//
// Dos temperamentos:
//   · `.ok`     una buena noticia o la confirmación de lo que acabas de hacer: se va sola.
//   · `.fallo`  algo que no salió y hay que leer: se queda hasta descartarlo con «Entendido»,
//               con el peligro en la MARCA (el icono y el borde) y jamás en el texto.
// Tinta invertida (fondo = la tinta del tema, texto = el fondo del tema): destaca sobre cualquier
// pantalla, en claro y en oscuro, sin gastar el acento del club.
//
// Es el ÚNICO aviso pasajero de la app: los dos que había (el de Perfil, a 13 pt y sin caso de fallo)
// se retiraron para que un mismo mensaje no se vea de dos maneras según la pantalla.
//
// Se monta con el modificador, que lo coloca sobre la barra de pestañas (`safeAreaInset` inferior),
// lo anuncia a VoiceOver y retira solo el `.ok`:
//
//     .avisoDia($aviso)
//     …
//     aviso = .init(tono: .ok, texto: "Check-in guardado. Tu cifra se actualiza en unos segundos.")

struct AvisoDia: View {
    enum Tono { case ok, fallo }

    /// Lo que hay que avisar. Cada aviso es nuevo aunque el texto se repita: por eso lleva `id`.
    struct Contenido: Equatable, Identifiable {
        let id = UUID()
        let tono: Tono
        let texto: String
    }

    /// Cuánto tarda en irse solo un aviso `.ok`.
    static let duracionOk: Duration = .seconds(3.6)

    let tono: Tono
    let texto: String
    /// Descarta el aviso. Sólo lo pinta el `.fallo` («Entendido»); el `.ok` se va solo.
    var alCerrar: (() -> Void)?

    var body: some View {
        let fallo = tono == .fallo
        HStack(spacing: Theme.Spacing.m) {
            if fallo {
                Text("!")
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.background)
                    .frame(width: 24, height: 24)
                    .background(Theme.Color.danger, in: Circle())
                    .accessibilityHidden(true)
            } else {
                IconoDia(.check, tam: 20, peso: .bold)
            }
            Text(texto)
                .papel(.rotulo)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            if fallo, let alCerrar {
                Button(action: alCerrar) {
                    Text("Entendido")
                        .papel(.notaPesada)
                        .padding(.horizontal, 14)
                        .frame(minHeight: Theme.Size.toque)
                        .background(Theme.Color.background.opacity(0.16), in: Capsule())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
        }
        .foregroundStyle(Theme.Color.background)
        .padding(EdgeInsets(top: 10, leading: 18, bottom: 10, trailing: fallo ? 10 : 18))
        .frame(minHeight: 52)
        .background(Theme.Color.foreground, in: RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        .overlay {
            if fallo {
                RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
                    .strokeBorder(Theme.Color.danger.opacity(0.8), lineWidth: 2)
            }
        }
        .brandShadow(Theme.Shadow.hero)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isStaticText)
    }
}

extension View {
    /// Monta el aviso del día sobre esta vista: lo pone sobre la barra de pestañas, lo anuncia y, si es
    /// un `.ok`, lo retira solo. Un `.fallo` se queda hasta que el atleta lo descarte.
    func avisoDia(_ aviso: Binding<AvisoDia.Contenido?>) -> some View {
        modifier(AvisoDiaModifier(aviso: aviso))
    }
}

private struct AvisoDiaModifier: ViewModifier {
    @Binding var aviso: AvisoDia.Contenido?

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let actual = aviso {
                    AvisoDia(tono: actual.tono, texto: actual.texto, alCerrar: { aviso = nil })
                        .padding(.horizontal, Theme.Spacing.pantalla)
                        .padding(.bottom, Theme.Spacing.m)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(Theme.Motion.reveal, value: aviso)
            .task(id: aviso?.id) {
                guard let actual = aviso else { return }
                AccessibilityNotification.Announcement(actual.texto).post()
                guard actual.tono == .ok else { return }
                try? await Task.sleep(for: AvisoDia.duracionOk)
                if !Task.isCancelled, aviso?.id == actual.id { aviso = nil }
            }
    }
}

#if DEBUG
#Preview("Aviso · fábrica") { EnAmbasDia { GaleriaDia.Avisos() } }
#Preview("Aviso · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Avisos() } }
#endif
