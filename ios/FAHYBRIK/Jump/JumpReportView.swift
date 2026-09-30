import SwiftUI

// EL INFORME DE UNA OCURRENCIA DE SALTO — la ficha permanente, la misma para atleta y coach. No es el
// último número: es de dónde sale (altura, respuesta a la carga, LRI), qué significa (la lectura) y con
// qué intentos se hizo.
//
// Arquetipo Detalle (CONTRATO-UI §6.2): el sujeto es el dato que te trajo a abrirla — los centímetros — y
// el hueco se gana con lo que le da sentido: la carga, el LRI, la lectura y la escala completa (plegada,
// porque solo importa a quien la busca). Lo que decide qué bloques hay vive en `LecturaInformeSalto`.
//
// Se abre como cover desde el hub (con su ✕) y como colofón de una captura recién guardada.

struct JumpReportView: View {
    let report: CmjReportDTO
    var onClose: (() -> Void)? = nil

    var body: some View {
        JumpReportContenido(lectura: .desde(report), alCerrar: onClose)
    }
}

/// El informe pintado a partir de su lectura: sin decidir nada (así se ve en la galería sin un DTO real).
struct JumpReportContenido: View {
    let lectura: LecturaInformeSalto
    var alCerrar: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            cabecera
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    sujeto
                    if let carga = lectura.carga { bloqueDeCarga(carga) }
                    bloque("Lectura") {
                        Text(lectura.lectura)
                            .papel(.cuerpo)
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(Theme.Spacing.l + 2)
                            .tarjetaDeTests(alAncho: true)
                    }
                    if lectura.escalaDeAltura != nil || lectura.escalaDeLri != nil {
                        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                            if let escala = lectura.escalaDeAltura { EscalaPlegable(escala: escala) }
                            if let escala = lectura.escalaDeLri { EscalaPlegable(escala: escala) }
                        }
                    }
                    if let pie = lectura.pie {
                        Text(pie)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(EdgeInsets(top: 6, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.xxl, trailing: Theme.Spacing.pantalla))
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }

    // MARK: Cabecera

    private var cabecera: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Informe del test")
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.accentText)
                Text(lectura.titulo)
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
                    .accessibilityAddTraits(.isHeader)
                if let fecha = lectura.fecha {
                    Text(fecha)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            if let alCerrar {
                BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: alCerrar)
            }
        }
        .padding(EdgeInsets(top: Theme.Spacing.s, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.m, trailing: alCerrar == nil ? Theme.Spacing.pantalla : Theme.Spacing.s))
    }

    // MARK: El sujeto — la altura

    private var sujeto: some View {
        SujetoDia(tono: .acento, etiqueta: "Sin carga: \(lectura.altura.cm) cm. \(lectura.altura.frase)") {
            KickerDia("Sin carga")
            TituloDia("\(lectura.altura.cm) cm")
            ApoyoDia(lectura.altura.frase)
        } abajo: {
            RegletaDia(n: lectura.altura.nivel, de: 5)
        }
    }

    // MARK: Con carga

    private func bloqueDeCarga(_ carga: LecturaInformeSalto.Carga) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(carga.titulo)
            let teselas = [
                Teselado(rotulo: "Con carga", cifra: "\(carga.cm)", unidad: "cm", pie: carga.nivel),
            ] + carga.metricas.map { Teselado(rotulo: $0.rotulo, cifra: $0.valor, unidad: nil, pie: nil) }
            ForEach(Array(stride(from: 0, to: teselas.count, by: 2)), id: \.self) { i in
                TeselasDia {
                    ForEach(Array(teselas[i..<min(i + 2, teselas.count)])) { t in
                        TeselaDia(rotulo: t.rotulo, etiqueta: t.etiqueta) {
                            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs + 2) {
                                Text(t.cifra).papel(.dato).foregroundStyle(Theme.Color.foreground)
                                if let unidad = t.unidad {
                                    Text(unidad).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                                }
                            }
                            if let pie = t.pie {
                                Text(pie).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                            }
                        }
                    }
                }
            }
            if let lri = carga.lri { teselaDeLri(lri) }
        }
    }

    private struct Teselado: Identifiable {
        let rotulo: String
        let cifra: String
        let unidad: String?
        let pie: String?
        var id: String { rotulo }
        var etiqueta: String {
            [rotulo + ":", cifra, unidad, pie].compactMap { $0 }.joined(separator: " ")
        }
    }

    /// El LRI, con su nivel en la regleta de cinco: es la cifra que resume cómo responde a la carga.
    private func teselaDeLri(_ lri: LecturaInformeSalto.Lri) -> some View {
        TeselasDia {
            TeselaDia(rotulo: "LRI", etiqueta: "LRI: \(lri.valor)\(lri.frase.map { ". \($0)" } ?? "")") {
                Text(lri.valor).papel(.dato).foregroundStyle(Theme.Color.foreground)
                if let nivel = lri.nivel { RegletaDia(n: nivel, de: 5) }
                if let frase = lri.frase {
                    Text(frase).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    private func bloque<C: View>(_ titulo: String, @ViewBuilder _ contenido: () -> C) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo)
            contenido()
        }
    }
}

// MARK: - La escala plegable

/// La escala completa de niveles, plegada: el nivel del atleta ya está en el sujeto y en la regleta; los
/// cortes solo importan a quien quiere ver dónde está cada uno. El nivel activo va marcado por la forma
/// (un check y el tinte), no solo por el color.
struct EscalaPlegable: View {
    let escala: EscalaDeSalto
    @State private var abierta = false

    var body: some View {
        VStack(spacing: 0) {
            BotonTextoTests(
                escala.titulo,
                tono: .tinta,
                expandido: abierta,
                accion: { abierta.toggle() },
                icono: { EmptyView() },
                derecha: {
                    // El chevron apunta abajo cerrado y arriba abierto.
                    IconoDia(.chevron, tam: 18, peso: .semibold).rotationEffect(.degrees(abierta ? -90 : 90))
                }
            )
            if abierta {
                Hairline()
                ForEach(escala.bandas, id: \.level) { fila($0) }
            }
        }
        .tarjetaDeTests(alAncho: true)
    }

    private func fila(_ banda: CmjScaleBandDTO) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Text("\(banda.level)")
                .papel(.notaPesada)
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 24, alignment: .leading)
            Text(banda.label)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: Theme.Spacing.s)
            Text(banda.rangeLabel)
                .papel(.nota)
                .foregroundStyle(banda.active ? Theme.Color.foreground : Theme.Color.muted)
            if banda.active {
                IconoDia(.check, tam: 18, peso: .bold)
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
        .padding(.horizontal, Theme.Spacing.l + 2)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque)
        .background(banda.active ? Theme.Color.accentTint : SwiftUI.Color.clear)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Nivel \(banda.level), \(banda.label), \(banda.rangeLabel)\(banda.active ? ", tu nivel" : "")")
        .accessibilityAddTraits(banda.active ? .isSelected : [])
    }
}
