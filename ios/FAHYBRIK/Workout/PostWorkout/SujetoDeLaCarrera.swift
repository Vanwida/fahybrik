import SwiftUI

// EL SUJETO — el número grande, uno por lectura y solo uno.
//
// Vive aparte porque es donde está la decisión de producto: la precedencia la
// resuelve `Lectura.deCorrer` (qué lectura toca) y aquí se decide CÓMO SE CUENTA.
//
// LA VOZ ES LA QUE ALEX ELIGIÓ (DECISIONS, 12-ago): manda el VEREDICTO. La
// alternativa —el ritmo medio de sujeto y el veredicto debajo, «enseñar sin
// juzgar»— se montó, se vio y se DESCARTÓ, y queda en el doble (escenario ① B)
// para que la decisión no haya que volver a tomarla a ciegas. Aquí no se porta:
// una bifurcación de tono que ya está decidida es código muerto con aspecto de
// opción.

struct SujetoDeLaCarrera: View {
    let carrera: Carrera
    let lectura: Lectura

    var body: some View {
        switch lectura.sujeto {
        case .veredicto(let dentro, let evaluables, let sesgo, let peorDesvio, _):
            veredicto(dentro: dentro, evaluables: evaluables,
                      sesgo: sesgo, peorDesvio: peorDesvio)
        case .contraste(let n, let fuerte, let suave, let contraste, let recuperacion):
            self.contraste(n: n, fuerte: fuerte, suave: suave,
                           contraste: contraste, recuperacion: recuperacion)
        case .tiempoEnZona(let zona, let segundos, let pct):
            tiempoEnZona(zona: zona, segundos: segundos, pct: pct)
        case .ritmoMedio(let skm, let veredicto):
            ritmoMedio(skm: skm, veredicto: veredicto)
        case .tiempoPorRepeticion(let n, let media, let primera, let ultima, let pendiente):
            tiempoPorRepeticion(n: n, media: media, primera: primera,
                                ultima: ultima, pendiente: pendiente)
        case .kilometros(_, let porque):
            kilometros(porque: porque)
        }
    }

    // MARK: - 1 · El veredicto

    @ViewBuilder
    private func veredicto(
        dentro: Int, evaluables: Int, sesgo: Sesgo?, peorDesvio: Double?
    ) -> some View {
        let fuera = evaluables - dentro
        let tono = fuera == 0 ? Theme.Color.ok : Theme.Color.foreground
        EtiquetaSujeto(texto: "Series dentro", tono: fuera == 0 ? Theme.Color.ok : Theme.Color.muted)
        Numeral(texto: "\(dentro) de \(evaluables)", tono: tono)
        VStack(spacing: Theme.Spacing.xs) {
            Text(Self.fraseSesgo(sesgo, fuera: fuera) ?? "")
                .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            if let pedida = Self.loQueTePedian(lectura.banda) {
                Apunte(peorDesvio != nil && peorDesvio! > 0
                       ? "\(pedida) · la peor se fue \(Int(peorDesvio!.rounded())) s"
                       : pedida)
            }
        }
        .padding(.top, Theme.Spacing.m)
    }

    /// Cómo se cuenta lo que se salió, en una línea de gimnasio.
    static func fraseSesgo(_ sesgo: Sesgo?, fuera: Int) -> String? {
        _ = sesgo
        _ = fuera
        return nil
    }

    /// LO QUE TE PEDÍAN, DICHO ENTERO O NO DICHO.
    ///
    /// Una banda puede tener un solo borde: «no bajes de 3:20» no tiene suelo, y
    /// llega con el otro extremo escrito como el infinito que significa. Escribirlo
    /// como un rango —«0:00 a 3:20»— sería inventar el borde que no se pidió, así
    /// que cada forma tiene su frase.
    static func loQueTePedian(_ banda: Banda?) -> String? {
        guard case .ritmo(let rapido, let lento) = banda else { return nil }
        let hayRapido = rapido.isFinite && rapido > 0
        let hayLento = lento.isFinite
        switch (hayRapido, hayLento) {
        case (true, true):
            return "Te pedían \(Formato.clock(rapido)) a \(Formato.ritmo(lento, .porKm))"
        case (true, false):
            return "Te pedían \(Formato.ritmo(rapido, .porKm)) o más suave"
        case (false, true):
            return "Te pedían \(Formato.ritmo(lento, .porKm)) o más rápido"
        case (false, false):
            return nil
        }
    }

    // MARK: - 2 · El contraste

    @ViewBuilder
    private func contraste(
        n: Int, fuerte: Double, suave: Double?, contraste: Double?,
        recuperacion: ModoRecuperacion?
    ) -> some View {
        EtiquetaSujeto(texto: "\(n) \(n == 1 ? "fuerte" : "fuertes")")
        Numeral(texto: Formato.clock(fuerte), unidad: Formato.UnidadRitmo.porKm.rawValue)
        if let suave, let contraste {
            VStack(spacing: Theme.Spacing.xs) {
                Numeral(texto: Formato.clock(suave), escala: .segundo, tono: Theme.Color.muted,
                        unidad: Formato.UnidadRitmo.porKm.rawValue)
                Apunte("suave · contraste \(Formato.clock(contraste))")
            }
            .padding(.top, 10)
        } else {
            Apunte(recuperacion == .parado
                   ? "Recuperaste parado: no hay ritmo suave con el que comparar"
                   : "No se guardó lo suave: no hay contra qué comparar")
                .padding(.top, Theme.Spacing.m)
        }
    }

    // MARK: - 3 · El tiempo en la zona pedida

    @ViewBuilder
    private func tiempoEnZona(zona: Zona, segundos: Double, pct: Int) -> some View {
        let tono = HRZone(rawValue: zona)?.color ?? Theme.Color.foreground
        EtiquetaSujeto(texto: "En Z\(zona), lo que pedías", tono: tono)
        Numeral(texto: Formato.clock(segundos), tono: tono)
        Apunte("de \(Formato.clock(carrera.duracionS)) · el \(pct) % de la sesión")
    }

    // MARK: - 4 · El ritmo medio

    @ViewBuilder
    private func ritmoMedio(skm: Double, veredicto: RunComplianceVerdict?) -> some View {
        EtiquetaSujeto(texto: "Ritmo medio")
        Numeral(texto: Formato.clock(skm), unidad: Formato.UnidadRitmo.porKm.rawValue)
        VStack(spacing: Theme.Spacing.s) {
            if let veredicto, veredicto != .sinDato {
                PastillaDeVeredicto(veredicto: veredicto)
            }
            Apunte(Self.loQueTePedian(lectura.banda).map {
                "\($0), y fuiste una sola cosa: esta media describe cada kilómetro"
            } ?? "Corriste a una sola intensidad: esta media describe cada kilómetro")
        }
        .padding(.top, Theme.Spacing.m)
    }

    // MARK: - 5 · El tiempo por repetición, en cuesta

    @ViewBuilder
    private func tiempoPorRepeticion(
        n: Int, media: Double, primera: Double, ultima: Double, pendiente: Double
    ) -> some View {
        EtiquetaSujeto(texto: "\(n) subidas")
        Numeral(texto: Formato.clock(media), unidad: "de media")
        VStack(spacing: Theme.Spacing.xs) {
            Text("De \(Formato.clock(primera)) la primera a \(Formato.clock(ultima)) la última")
                .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Apunte("En una cuesta del \(Int(pendiente.rounded())) % el ritmo no se compara: lo que cuenta es el tiempo")
        }
        .padding(.top, Theme.Spacing.m)
    }

    // MARK: - 6 · Lo que sí se midió

    @ViewBuilder
    private func kilometros(porque: String) -> some View {
        EtiquetaSujeto(texto: "Recorriste")
        Numeral(texto: Formato.esDecimal(carrera.distanciaM / 1000, decimals: 2,
                                         siempreDecimales: true),
                unidad: "km")
        Apunte(porque)
    }
}

/// La línea de apoyo del sujeto: siempre bajo el numeral, siempre en apagado.
private struct Apunte: View {
    let texto: String
    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .scaledFont(12, weight: .medium, relativeTo: .caption)
            .foregroundStyle(Theme.Color.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: 300)
    }
}
