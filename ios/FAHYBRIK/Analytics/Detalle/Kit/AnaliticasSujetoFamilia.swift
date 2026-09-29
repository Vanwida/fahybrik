import SwiftUI

// EL SUJETO DE UN DETALLE — la marca clave de la familia con el cascarón de «El día» (`SujetoDia`, tinte neutro): el punto
// de la familia y lo que mide, el ancla de donde sale la cifra, la cifra a 44 pt con su unidad, cuánto cambió y de dónde
// sale (espejo de `kit-analiticas/piezas-detalle.tsx#CabeceraFamilia` y `#SujetoVacio`).
//
// El color de la familia va SOLO en su punto: la cifra, el delta y la nota van en la tinta del tema (sobre un tinte el gris de
// apoyo no llega a 4,5:1, y aquí nada es una alarma ni un aplauso). El delta lleva ▲▼≈ y su palabra: el veredicto cambia la
// marca, no el color de la cifra.
//
// Una familia sin nada todavía es un VACÍO (CONTRATO-UI §6.2): el sujeto ES el vacío, con lo que falta, por qué y la salida. Cuando
// hay accesorio (el conmutador de máquina del ergo) va dentro, abajo, para no ser un widget suelto entre widgets (§10.4).

struct AnaliticasSujetoFamilia<Accesorio: View>: View {
    let sujeto: SujetoDeFamilia
    /// La etiqueta del sujeto vacío (la familia, o la máquina): «Correr», «SkiErg».
    let etiquetaDelVacio: String
    let onSalida: (DestinoDeSalida) -> Void
    @ViewBuilder var accesorio: () -> Accesorio

    var body: some View {
        switch sujeto.cuerpo {
        case .marca(let m):
            SujetoDia(tono: .neutro, etiqueta: etiquetaAccesible(m)) {
                cabecera(m.etiqueta, ancla: m.ancla)
                cifra(m)
                if let delta = m.delta { AnaliticasDelta(delta: delta) }
                // Sin cifra no hay nota que la sostenga: lo que falta se dice justo bajo la etiqueta (el vacío).
            } abajo: {
                if let nota = m.nota { ApoyoDia(nota) }
                accesorio()
            }
        case .vacio(let texto):
            SujetoDia(tono: .neutro, etiqueta: "\(texto.titulo). \(texto.cuerpo)") {
                cabecera(etiquetaDelVacio, ancla: nil)
                TituloDia(texto.titulo)
                ApoyoDia(texto.cuerpo)
            } abajo: {
                accesorio()
                AnaliticasBoton(texto: texto.accion) { onSalida(.inicio) }
            }
        }
    }

    /// El punto de la familia, lo que mide y, a la derecha, de dónde sale la cifra.
    private func cabecera(_ etiqueta: String, ancla: AnclaDeLectura?) -> some View {
        HStack(alignment: .center, spacing: Theme.Spacing.m) {
            HStack(spacing: 10) {
                AnaliticasPuntoFamilia(familia: sujeto.familia, talla: 12)
                Text(etiqueta).papel(.notaPesada).foregroundStyle(Tinta.sujeto).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: Theme.Spacing.s)
            if let ancla { AnaliticasChipAncla(ancla: ancla) }
        }
        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
    }

    private func cifra(_ m: SujetoDeFamilia.Marca) -> some View {
        HStack(alignment: .lastTextBaseline, spacing: 8) {
            Text(AnaliticasFormato.cifra(m.valor, m.unidad)).papel(.sujeto).foregroundStyle(Tinta.sujeto).lineLimit(1).minimumScaleFactor(0.5)
            let u = AnaliticasFormato.unidadCorta(m.unidad, valor: m.valor)
            if !u.isEmpty { Text(u).papel(.cuerpoFuerte).foregroundStyle(Tinta.sujeto) }
        }
    }

    private func etiquetaAccesible(_ m: SujetoDeFamilia.Marca) -> String {
        var partes = ["\(m.etiqueta): \(AnaliticasFormato.formatear(m.valor, m.unidad))"]
        if let d = m.delta { partes.append("\(d.igual ? "sin cambio" : d.mejor ? "mejor" : "peor") \(d.texto)") }
        if let a = m.ancla?.etiqueta { partes.append(a) }
        return partes.joined(separator: ", ")
    }
}

extension AnaliticasSujetoFamilia where Accesorio == EmptyView {
    init(sujeto: SujetoDeFamilia, etiquetaDelVacio: String, onSalida: @escaping (DestinoDeSalida) -> Void) {
        self.init(sujeto: sujeto, etiquetaDelVacio: etiquetaDelVacio, onSalida: onSalida, accesorio: { EmptyView() })
    }
}

/// La tinta del sujeto neutro: la del tema, sólida (`TonoDia.neutro`), jamás un gris.
private enum Tinta {
    static var sujeto: Color { TonoDia.neutro.papeles.tinta }
}

// MARK: - Un dato sin número, como tarjeta

/// Una lectura sin número, dicha en una tarjeta: su título, por qué falta y su salida o su plazo. Para que un detalle a medio
/// llenar no sea una silueta muda (espejo de `piezas-detalle.tsx#FilaSinDato`).
///
/// Un hueco se declara cuando el atleta puede llenarlo con un acto concreto o cuando solo falta tiempo (el plazo, dibujado); se
/// calla cuando no (`ocasion`, `intencion`): quien pinta esto decide con `AnaliticasFilaSinDato.dice(_:)` si hay algo que decir.
struct AnaliticasFilaSinDato: View {
    let lectura: LecturaAnalitica
    /// En qué se cuenta el plazo de una falta de historia: «semanas» en el progreso, «esfuerzos» en la velocidad crítica.
    var unidadDelPlazo = "semanas"
    var onSalida: ((DestinoDeSalida) -> Void)? = nil

    /// ¿La falta de esta lectura dice algo al atleta? Un silencio (`ocasion`, `intencion`) o una razón que este binario no conoce, no.
    static func dice(_ l: LecturaAnalitica) -> Bool {
        guard l.estado == .sinDato, let falta = l.cobertura.falta else { return false }
        if case .historia = falta { return true }
        return AnaliticasEstados.salida(de: falta) != nil || AnaliticasEstados.notaDeFalta(falta, bloque: .progreso, hoy: "") != nil
    }

    var body: some View {
        AnaliticasSuperficie {
            VStack(alignment: .leading, spacing: 10) {
                AnaliticasCuerpo(texto: lectura.tituloEs, fuerte: true)
                cuerpo
            }
        }
    }

    @ViewBuilder
    private var cuerpo: some View {
        if case .historia(let llevas, let hacen)? = lectura.cobertura.falta {
            AnaliticasEtiqueta(texto: "Todavía es pronto: \(lectura.procedencia.explicaEs)")
            AnaliticasPlazo(plazo: PlazoHueco(llevas: min(llevas, hacen), hacen: hacen, unidad: unidadDelPlazo))
        } else {
            AnaliticasEtiqueta(texto: lectura.procedencia.explicaEs)
            if let falta = lectura.cobertura.falta, let salida = AnaliticasEstados.salida(de: falta) {
                switch salida {
                case .accion(let texto, let destino): AnaliticasBoton(texto: texto, secundario: true) { onSalida?(destino) }
                case .espera(let texto): AnaliticasEtiqueta(texto: texto)
                }
            }
        }
    }
}
