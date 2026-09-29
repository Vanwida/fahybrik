import SwiftUI

// LAS FILAS — una familia en Progreso, una marca en Récords (espejo de
// `kit-analiticas/piezas.tsx#FilaProgreso` y `#FilaRecord`). Las usan la
// portada y, en la segunda tanda, los detalles por familia.

private typealias TA = AnaliticasTokens.TA
private typealias C = AnaliticasColor

/// Una familia en Progreso: punto, nombre + métrica clave · cifra · delta ·
/// chispa · «›». `nombre` sustituye al de la familia (un ejercicio de fuerza).
struct AnaliticasFilaProgreso: View {
    let familia: FamiliaLectura?
    let metrica: String
    /// Nulo = sin dato; entonces manda la `nota`.
    let valor: Double?
    let unidad: UnidadLectura
    var delta: DeltaVista? = nil
    var tendencia: [PuntoDeSerie]? = nil
    /// Lo que se dice cuando falta dato o cuando aún no hay tendencia.
    var nota: String? = nil
    var nombre: String? = nil
    var onAbrir: (() -> Void)? = nil

    var body: some View {
        let fila = HStack(alignment: .center, spacing: 12) {
            AnaliticasPuntoFamilia(familia: familia)
            VStack(alignment: .leading, spacing: 3) {
                AnaliticasFlujo(espacioH: 8, espacioV: 0) {
                    AnaliticasCuerpo(texto: nombre ?? familia?.nombre ?? "", fuerte: true)
                    AnaliticasEtiqueta(texto: metrica)
                }
                if let valor {
                    HStack(alignment: .lastTextBaseline, spacing: 5) {
                        AnaliticasNumeral(texto: AnaliticasFormato.cifra(valor, unidad), cuerpo: TA.datoMenor)
                        let u = AnaliticasFormato.unidadCorta(unidad, valor: valor)
                        if !u.isEmpty { AnaliticasEtiqueta(texto: u) }
                    }
                    if let delta { AnaliticasDelta(delta: delta, corto: true) } else if let nota { AnaliticasEtiqueta(texto: nota) }
                } else {
                    AnaliticasEtiqueta(texto: nota ?? "sin dato")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let tendencia, tendencia.compactMap(\.v).count >= 2 {
                AnaliticasChispa(puntos: tendencia, color: C.familia(familia))
            }
            if onAbrir != nil {
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .semibold)).foregroundStyle(C.tinta2).accessibilityHidden(true)
            }
        }
        .padding(.vertical, 10)
        .frame(minHeight: 64)
        .overlay(alignment: .bottom) { Rectangle().fill(C.rejilla).frame(height: 1) }
        .contentShape(Rectangle())

        if let onAbrir {
            Button(action: onAbrir) { fila }
                .buttonStyle(VivoPulsarStyle())
                .accessibilityLabel("Abrir \(nombre ?? familia?.nombre ?? metrica)")
        } else {
            fila
        }
    }
}

/// Una marca: prueba, fecha (y «antes X» · ancla), sello «Nuevo» y valor.
struct AnaliticasFilaRecord: View {
    let familia: FamiliaLectura?
    let prueba: String
    let valor: Double
    let unidad: UnidadLectura
    var fecha: String? = nil
    var anterior: Double? = nil
    var ancla: AnclaDeLectura? = nil
    var nuevo = false
    let hoy: String

    private var pie: String {
        var partes: [String] = []
        if let fecha { partes.append(AnaliticasFormato.fechaLegible(fecha, hoy: hoy)) }
        if let anterior { partes.append("antes \(AnaliticasFormato.formatear(anterior, unidad))") }
        if let ancla, ancla != .medida, let e = ancla.etiqueta { partes.append(e) }
        return partes.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            AnaliticasPuntoFamilia(familia: familia)
            VStack(alignment: .leading, spacing: 3) {
                AnaliticasCuerpo(texto: prueba, fuerte: true)
                if !pie.isEmpty { AnaliticasEtiqueta(texto: pie) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if nuevo { AnaliticasSello(texto: "Nuevo") }
            AnaliticasNumeral(texto: AnaliticasFormato.formatear(valor, unidad), cuerpo: TA.datoMenor)
        }
        .padding(.vertical, 8)
        .frame(minHeight: 56)
        .overlay(alignment: .bottom) { Rectangle().fill(C.rejilla).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
