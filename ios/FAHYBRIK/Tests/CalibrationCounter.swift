import SwiftUI

// El contador «3/4» de la batería de tests. Lo pinta el hub de tests (`TestsHubView`); la tarjeta de
// Inicio que lo compartía se retiró con «Hoy · El día» (ahora es una fila de «Contigo»).

/// «3/4» — cuántos tests has calibrado. UN solo sitio: el hub y la tarjeta de
/// Inicio lo escribían por separado, con la misma anatomía y dos tipografías
/// distintas para el denominador.
///
/// Se pinta TAMBIÉN en cero (contrato §6.2 bis): un contador en cero es
/// información, y es justo cuando más falta hace explicarlo. `total` es nil
/// cuando el coach todavía no ha publicado batería — entonces no hay
/// denominador que inventar (§7) y se enseña sólo lo que se sabe.
struct CalibrationCounter: View {
    let done: Int
    /// Nil = aún no hay batería publicada, así que no hay «de cuántos».
    let total: Int?
    /// El contador como SUJETO de la pantalla (estado vacío del hub), no como
    /// dato de la esquina de una tarjeta.
    var hero: Bool = false
    /// Qué cuenta, cuando no hay denominador que lo diga. Un «0» suelto a 48 pt
    /// es un glifo, no una cifra: sin el «de cuántos» hace falta la palabra para
    /// que se lea como el contador que es.
    var unidad: String? = nil

    private var complete: Bool { total.map { done >= $0 && $0 > 0 } ?? false }

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs) {
            Text("\(done)")
                .font(hero ? Theme.Typography.readoutL : Theme.Typography.readoutM)
                .foregroundStyle(complete ? Theme.Color.ok : Theme.Color.foreground)
            if let total {
                Text("/\(total)")
                    .font(hero ? Theme.Typography.readoutM : Theme.Typography.readoutS)
                    .foregroundStyle(Theme.Color.muted)
            } else if let unidad {
                Text(unidad)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.muted)
                    // Una cifra y una palabra respiran más que una cifra y su
                    // denominador, que van pegados a propósito.
                    .padding(.leading, Theme.Spacing.xs)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            total.map { "\(done) de \($0) tests con resultado" } ?? "\(done) tests calibrados"
        )
    }
}
