import SwiftUI

// LAS FILAS — una familia en Progreso, una marca en Récords (espejo de
// `kit-analiticas/piezas.tsx#FilaProgreso` y `#FilaRecord`). Viven dentro de una
// `ListaDia`, que pone las rayas; las usan la portada y, en la segunda
// tanda, los detalles por familia.

/// Una familia en Progreso: punto, nombre + métrica clave · cifra · delta · chispa · «›».
/// `nombre` sustituye al de la familia (un ejercicio de fuerza).
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

    private var nombreVisible: String { nombre ?? familia?.nombre ?? "" }

    var body: some View {
        if let onAbrir {
            Button(action: onAbrir) { fila }
                .buttonStyle(PressScaleStyle(escala: 0.982))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiquetaAccesible)
                .accessibilityAddTraits(.isButton)
        } else {
            fila.accessibilityElement(children: .combine)
        }
    }

    /// Lo que lee VoiceOver de la fila entera: quién, qué mide, cuánto y cómo va.
    private var etiquetaAccesible: String {
        var partes = [nombreVisible, metrica]
        if let valor { partes.append(AnaliticasFormato.formatear(valor, unidad)) }
        if let delta { partes.append("\(delta.igual ? "sin cambio" : delta.mejor ? "mejor" : "peor") \(delta.texto)") } else if let nota { partes.append(nota) }
        return partes.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private var fila: some View {
        HStack(alignment: .center, spacing: 14) {
            AnaliticasPuntoFamilia(familia: familia)
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                FlowLayout(spacing: 8, lineSpacing: 0) {
                    AnaliticasCuerpo(texto: nombreVisible, fuerte: true)
                    AnaliticasEtiqueta(texto: metrica)
                }
                if let valor {
                    HStack(alignment: .lastTextBaseline, spacing: 5) {
                        AnaliticasNumeral(texto: AnaliticasFormato.cifra(valor, unidad), talla: .fila)
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
                AnaliticasChispa(puntos: tendencia, color: Theme.Color.chispa(FamiliaGrande(familia).color))
            }
            if onAbrir != nil {
                IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
        .frame(minHeight: 76)
        .contentShape(Rectangle())
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
        HStack(alignment: .center, spacing: 14) {
            AnaliticasPuntoFamilia(familia: familia)
            VStack(alignment: .leading, spacing: 3) {
                AnaliticasCuerpo(texto: prueba, fuerte: true)
                if !pie.isEmpty { AnaliticasEtiqueta(texto: pie) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // El valor y, debajo, el sello: a 15 pt un nombre largo («Sentadilla · 1RM estimado») no cabe
            // entre el punto y un valor con su sello al lado, y se partía en tres líneas.
            VStack(alignment: .trailing, spacing: Theme.Spacing.xs) {
                AnaliticasNumeral(texto: AnaliticasFormato.formatear(valor, unidad), talla: .fila)
                if nuevo { InfoPill(text: "Nuevo", estilo: .velo) }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
        .frame(minHeight: 68)
        .accessibilityElement(children: .combine)
    }
}

extension AnaliticasFilaRecord {
    /// La fila de un récord del panel: su prueba, su día (el último punto de su progresión), lo que había antes y si es nuevo. Nula
    /// si la lectura no tiene número.
    init?(_ l: LecturaAnalitica, hoy: String) {
        guard let dato = l.dato else { return nil }
        self.init(
            familia: l.familia, prueba: l.tituloEs, valor: dato.valor, unidad: dato.unidad,
            fecha: AnaliticasDerivados.ultimoDeLaSerie(l), anterior: AnaliticasDerivados.recordAnterior(l), ancla: l.procedencia.ancla,
            nuevo: l.veredicto?.code == IdsDelPanel.veredictoRecordNuevo, hoy: hoy
        )
    }
}
