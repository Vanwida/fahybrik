import SwiftUI

// El contador «2 de 4» de la batería de tests: el SUJETO del hub (CONTRATO-UI §6.2 bis), con o sin batería.
// La tarjeta de Inicio que lo compartía se retiró con «Hoy · El día» (ahora es una fila de «Contigo»).

/// Cuántos tests has calibrado. UN solo sitio: el hub lo pinta en su sujeto, con batería y sin ella.
///
/// Se pinta TAMBIÉN en cero (contrato §6.2 bis): un contador en cero es información, y es justo cuando
/// más falta hace explicarlo. `total` es nil cuando el coach todavía no ha publicado batería — entonces
/// no hay denominador que inventar (§7) y se enseña sólo lo que se sabe. Sin el «de cuántos» hace falta
/// la palabra para que un «0» suelto se lea como el contador que es.
///
/// El color es siempre la tinta del tema: va dentro de un sujeto teñido y el color del momento lo pone
/// el sujeto (`TonoDia`), jamás el texto.
struct CalibrationCounter: View {
    let done: Int
    /// Nil = aún no hay batería publicada, así que no hay «de cuántos».
    let total: Int?
    /// Qué cuenta.
    var unidad: String = "tests calibrados"
    /// El papel de la cifra: el sujeto (44 pt) cuando manda la pantalla, el dato (32 pt) cuando comparte
    /// sujeto con un título.
    var papelDeLaCifra: Theme.Typography.Papel = .sujeto

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
                Text("\(done)").papel(papelDeLaCifra)
                if let total {
                    Text("de \(total)").papel(.dato)
                }
            }
            .foregroundStyle(Theme.Color.foreground)
            Text(unidad)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.lectura(done: done, total: total))
    }

    /// Lo que lee VoiceOver: «2 de 4 tests con resultado» / «0 tests calibrados».
    static func lectura(done: Int, total: Int?) -> String {
        total.map { "\(done) de \($0) tests con resultado" } ?? "\(done) tests calibrados"
    }
}
