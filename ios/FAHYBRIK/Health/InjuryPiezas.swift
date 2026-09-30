import SwiftUI

// LAS PIEZAS DE «MOLESTIAS»: el mapeo de gravedad y estado a su color, la nota con contador y el nombre de quien
// aparece en el texto. Las comparten la lista, el reporte y la evolución.
//
// El color de una gravedad o de un estado va en la MARCA (un punto delante de la palabra), nunca solo en el
// texto, y sale de los colores de estado del tema: el acento del club no es un color de dato (CONTRATO-UI §11.1).

extension InjurySeverity {
    /// leve → info, moderada → warning, severa → danger.
    var marca: Color {
        switch self {
        case .leve:     return Theme.Color.info
        case .moderada: return Theme.Color.warning
        case .severa:   return Theme.Color.danger
        }
    }
}

extension InjuryStatus {
    /// activa → danger, en recuperación → warning, resuelta → ok.
    var marca: Color {
        switch self {
        case .activa:         return Theme.Color.danger
        case .enRecuperacion: return Theme.Color.warning
        case .resuelta:       return Theme.Color.ok
        }
    }
}

extension String {
    /// Pone en mayúscula solo la primera letra (deja intacto el nombre real de un coach y convierte el «tu coach»
    /// de respaldo en «Tu coach» al empezar una frase).
    var conMayusculaInicial: String {
        isEmpty ? self : prefix(1).uppercased() + dropFirst()
    }
}

/// Cómo se llama a quien lleva al atleta: su nombre, o «tu coach» si no hay (nunca un nombre escrito en el código).
func etiquetaDeCoach(_ coachName: String?) -> String {
    (coachName?.isEmpty == false) ? coachName! : "tu coach"
}

/// Un campo de texto de varias líneas con su marcador y un contador de caracteres, con tope `maxChars` (el
/// servidor acepta hasta 2000). Es el cuerpo de una fila de `GrupoPerfil`.
struct NotaEditorPerfil: View {
    @Binding var text: String
    var placeholder: String
    var maxChars: Int = 2000

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                TextEditor(text: $text)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                    .tint(Theme.Color.accentText)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 110)
                    .accessibilityLabel(placeholder)
                    .onChange(of: text) { _, new in
                        if new.count > maxChars { text = String(new.prefix(maxChars)) }
                    }
            }
            Text("\(text.count)/\(maxChars)")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .monospacedDigit()
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityHidden(true)
        }
        .padding(Theme.Spacing.m)
    }
}
