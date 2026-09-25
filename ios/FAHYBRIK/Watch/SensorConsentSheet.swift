import SwiftUI

// «El movimiento de tu muñeca» — la hoja del consentimiento, al acabar el primer
// entreno grabado en el reloj (DECISIONS 2026-09-25; el doble:
// web/components/design-twin/screens/consentimiento-sensores/hoja.tsx).
//
// SALE TRAS UN GUARDAR BUENO, justo antes de que el resumen se cierre: antes
// taparía el registro en el único momento en que el atleta lo quiere mirar, y el
// archivo cuelga de la ejecución guardada. Si el entreno fue solo del reloj y el
// móvil no tuvo resumen, sale la próxima vez que se abre la app (AppShell).
//
// LAS DOS SALIDAS PESAN IGUAL: SUBIRLO relleno y «Ahora no» contorneado, los dos a
// lo ancho y con alto de botón. Un «no» escondido en un enlace sería arrancar el
// sí, y un consentimiento arrancado no vale. Cerrar la hoja sin elegir (tocar el
// velo, bajarla) cuenta como «Ahora no»: sin un sí, nada se sube.

/// El texto del consentimiento — el de `consentimiento-sensores/texto.ts`, frase a
/// frase. UNA fuente para la hoja y para Perfil: si cada superficie lo redactara por
/// su cuenta, acabarían prometiendo cosas distintas. Cada frase tiene que ser verdad
/// sobre lo que el código hace hoy (el porqué de cada una está en texto.ts):
/// el reloj graba siempre y cuenta en vivo digas lo que digas; lo único que depende
/// del sí es que el archivo SALGA del móvil.
enum SensorConsentCopy {
    // La hoja
    static let titulo = "El movimiento de tu muñeca"
    /// Qué es y para qué. «Ha grabado», en pasado: se graba siempre; se pide subirlo.
    static let queYParaQue = "Mientras entrenabas, el reloj ha grabado cómo se movía tu muñeca. Si nos dejas subirlo, lo usamos para que la app aprenda a contar tus repeticiones y a reconocer los ejercicios sola, cada vez mejor."
    /// Qué NO es, y por qué aun así se pregunta.
    static let queNoEs = "Es solo movimiento: ni tu pulso ni dónde estabas. Aun así es tuyo y puede identificarte, así que te lo preguntamos."
    /// Que decir que no no cuesta nada, y dónde se cambia.
    static let sinCoste = "Tu entreno se guarda igual digas lo que digas. Puedes cambiarlo en Perfil › Privacidad."
    static let subir = "SUBIRLO"
    static let ahoraNo = "Ahora no"

    // Perfil › Privacidad
    static let perfilTitulo = "Privacidad"
    static let grupo = "El movimiento de tu muñeca"
    static let grupoPie = "El reloj lo graba mientras entrenas. Subirlo es cosa tuya."
    static let fila = "Subir el movimiento del reloj"
    /// La línea bajo la fila dice qué pasa AHORA, no qué es el interruptor.
    static let filaSi = "Para que la app aprenda a contar repeticiones y a reconocer ejercicios."
    /// Apagar retira el permiso Y borra lo subido (Alex, 25-09): la línea lo dice.
    static let filaNo = "No se sube, y lo que ya subiste se borra. Tus entrenos se guardan igual."
    static let notaAlPie = "Solo el movimiento del reloj —aceleración y giro— mientras dura el entreno: ni tu pulso ni dónde estabas. Aun así puede identificarte; por eso decides tú."
    static let grupoDatos = "Tus datos"
    static let grupoDatosPie = "Todo lo que guardamos sobre ti, y cómo lo tratamos."
    static let exportar = "Exportar mis datos"
    static let exportarLinea = "Descarga un JSON con todo lo que guardamos sobre ti"
    static let politica = "Política de privacidad"
}

/// La hoja. Resuelve su propia respuesta: quien la presenta solo decide cuándo, y
/// sigue con lo suyo al cerrarse (`sensorConsentSheet(isPresented:onClosed:)`).
struct SensorConsentSheet: View {
    var bearer: String?

    @Environment(\.dismiss) private var dismiss
    @State private var respondida = false
    @State private var altoCuerpo: CGFloat = 0
    @State private var altoBotones: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            // El texto se desplaza si no cabe (letra muy grande); los dos botones
            // quedan siempre a la vista, abajo.
            ScrollView {
                cuerpo
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        proxy.size.height
                    } action: { alto in
                        altoCuerpo = alto
                    }
            }
            .scrollBounceBehavior(.basedOnSize)
            botones
                .onGeometryChange(for: CGFloat.self) { proxy in
                    proxy.size.height
                } action: { alto in
                    altoBotones = alto
                }
        }
        .background(Theme.Color.surface.ignoresSafeArea())
        // La hoja mide lo que su contenido: ni media pantalla que corte los botones
        // ni una pantalla entera que tape el resumen ya guardado.
        .presentationDetents([detente])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Theme.Radius.xl)
        .presentationBackground(Theme.Color.surface)
        // Cerrarla sin elegir — tocar el velo, bajarla, el gesto de escape de
        // VoiceOver — es «Ahora no».
        .onDisappear {
            guard !respondida else { return }
            respondida = true
            SensorConsentPrompt.answer(.ahoraNo, bearer: bearer)
        }
    }

    private var detente: PresentationDetent {
        let alto = altoCuerpo + altoBotones
        return alto > 0 ? .height(alto) : .large
    }

    private var cuerpo: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            // «El reloj ha notado algo»: el reloj con ondas, en la tinta del texto
            // sobre un círculo en reposo. El naranja es de lo que se toca, y esto
            // solo dice de qué va la hoja.
            Image(systemName: "applewatch.radiowaves.left.and.right")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.Color.surfaceElevated))
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
                .padding(.bottom, Theme.Spacing.xs)
                .accessibilityHidden(true)
            Text(SensorConsentCopy.titulo)
                .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                .tracking(-0.24)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            parrafo(SensorConsentCopy.queYParaQue)
            parrafo(SensorConsentCopy.queNoEs)
            Text(SensorConsentCopy.sinCoste)
                .scaledFont(13, relativeTo: .footnote)
                .lineSpacing(2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Theme.Spacing.l + 4)
        // Deja sitio al asa del sistema, como el doble (asa + 16).
        .padding(.top, Theme.Spacing.xl + 4)
    }

    private func parrafo(_ texto: String) -> some View {
        Text(texto)
            .scaledFont(15, relativeTo: .subheadline)
            .lineSpacing(3)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var botones: some View {
        VStack(spacing: Theme.Spacing.s) {
            PrimaryButton(title: SensorConsentCopy.subir) { responder(.subirlo) }
            SecondaryButton(title: SensorConsentCopy.ahoraNo) { responder(.ahoraNo) }
        }
        .padding(.horizontal, Theme.Spacing.l + 4)
        .padding(.top, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.m)
    }

    private func responder(_ respuesta: SensorConsentPrompt.Respuesta) {
        guard !respondida else { return }
        respondida = true
        SensorConsentPrompt.answer(respuesta, bearer: bearer)
        dismiss()
    }
}

extension View {
    /// Presenta la hoja del consentimiento. `onClosed` corre cuando se ha ido,
    /// conteste lo que conteste (o sin contestar, que es «Ahora no»): el resumen
    /// del entreno lo usa para cerrarse DESPUÉS de la hoja, no debajo de ella.
    func sensorConsentSheet(
        isPresented: Binding<Bool>,
        onClosed: @escaping () -> Void = {}
    ) -> some View {
        sheet(isPresented: isPresented, onDismiss: onClosed) {
            SensorConsentSheet(bearer: KeychainTokenStore.shared.read())
        }
    }
}
