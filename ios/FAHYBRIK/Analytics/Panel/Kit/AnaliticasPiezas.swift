import SwiftUI

// LAS PIEZAS DEL IPHONE — el cromo y los átomos de la pestaña de analíticas
// (espejo de `kit-analiticas/piezas.tsx`), sobre el lenguaje del vivo: negro, SF
// tabular, tinta y tinta2, naranja SOLO en la acción, suelo 15 pt en todo.
// Ninguna pieza escribe un hex ni un cuerpo que no salga de `AnaliticasTokens`.
//
//   AnaliticasEtiqueta / Cuerpo / Numeral   texto
//   AnaliticasSeccion       título 24 pt + pregunta + «›» al detalle
//   AnaliticasSuperficie    una superficie sobre el negro
//   AnaliticasCelda         un dato: etiqueta, cifra, unidad, delta y ancla
//   AnaliticasDelta         ▲ / ▼ / ≈ con el texto en la unidad que lo juzga
//   AnaliticasChipAncla     «medido», «declarado», «estimado», «por edad»
//   AnaliticasPuntoFamilia · AnaliticasSello · AnaliticasNota
//   AnaliticasBoton         la ÚNICA pieza naranja de la pestaña
//   AnaliticasPlazo         «llevas 3 de 6 semanas», dibujado
//   AnaliticasHueco         vacío / poco / viejo, con salida obligatoria
//   AnaliticasLeyenda       la leyenda de un gráfico (siempre con ≥ 2 series)

private typealias TA = AnaliticasTokens.TA
private typealias C = AnaliticasColor

// MARK: - Texto

/// Etiqueta o unidad: 15 pt semibold en tinta2. El suelo.
struct AnaliticasEtiqueta: View {
    let texto: String
    var tono: Color = C.tinta2
    var peso: Font.Weight = .semibold
    var body: some View {
        Text(texto)
            .font(.system(size: TA.etiqueta, weight: peso))
            .foregroundStyle(tono)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Una línea de cuerpo (17 pt). Se parte en dos líneas; nunca se trunca.
struct AnaliticasCuerpo: View {
    let texto: String
    var tono: Color = C.tinta
    var fuerte = false
    var body: some View {
        Text(texto)
            .font(.system(size: TA.cuerpo, weight: fuerte ? .semibold : .medium))
            .foregroundStyle(tono)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Toda cifra del panel: SF tabular, recto. Nunca naranja.
struct AnaliticasNumeral: View {
    let texto: String
    var cuerpo: CGFloat = TA.dato
    var tono: Color = C.tinta
    var body: some View {
        Text(texto)
            .font(AnaliticasTokens.numeral(cuerpo))
            .foregroundStyle(tono)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }
}

/// Una nota de honestidad bajo un gráfico: procedencia, cobertura, dato viejo.
struct AnaliticasNota: View {
    let texto: String
    var body: some View { AnaliticasEtiqueta(texto: texto) }
}

// MARK: - Sección

/// Título 24 pt + la pregunta + «›» al detalle. El accesorio (un conmutador) va
/// en su propia fila: nunca dentro del botón del título ni robándole sitio.
struct AnaliticasSeccion<Contenido: View, Accesorio: View>: View {
    let titulo: String
    var pregunta: String? = nil
    var onAbrir: (() -> Void)? = nil
    @ViewBuilder var accesorio: () -> Accesorio
    @ViewBuilder var contenido: () -> Contenido

    init(titulo: String, pregunta: String? = nil, onAbrir: (() -> Void)? = nil,
         @ViewBuilder accesorio: @escaping () -> Accesorio, @ViewBuilder contenido: @escaping () -> Contenido) {
        self.titulo = titulo; self.pregunta = pregunta; self.onAbrir = onAbrir
        self.accesorio = accesorio; self.contenido = contenido
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AnaliticasTokens.hueco + 2) {
            if let onAbrir {
                Button(action: onAbrir) { cabeza }
                    .buttonStyle(VivoPulsarStyle())
                    .accessibilityLabel("Abrir \(titulo)")
            } else {
                cabeza
            }
            accesorio()
            contenido()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var cabeza: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(.system(size: TA.titulo.cuerpo, weight: TA.titulo.peso))
                    .tracking(-0.3)
                    .foregroundStyle(C.tinta)
                    .fixedSize(horizontal: false, vertical: true)
                if let pregunta { AnaliticasEtiqueta(texto: pregunta) }
            }
            Spacer(minLength: 0)
            if onAbrir != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(C.tinta2)
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
        .contentShape(Rectangle())
    }
}

extension AnaliticasSeccion where Accesorio == EmptyView {
    init(titulo: String, pregunta: String? = nil, onAbrir: (() -> Void)? = nil, @ViewBuilder contenido: @escaping () -> Contenido) {
        self.init(titulo: titulo, pregunta: pregunta, onAbrir: onAbrir, accesorio: { EmptyView() }, contenido: contenido)
    }
}

// MARK: - Superficie y celdas

/// Una superficie sobre el negro (la celda del vivo).
struct AnaliticasSuperficie<Contenido: View>: View {
    var padding: CGFloat = 14
    /// El estado «viejo» lleva un filete a la izquierda.
    var filete = false
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        contenido()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(C.superficie, in: RoundedRectangle(cornerRadius: AnaliticasTokens.Radio.celda, style: .continuous))
            .overlay(alignment: .leading) {
                if filete {
                    RoundedRectangle(cornerRadius: AnaliticasTokens.Radio.celda, style: .continuous)
                        .fill(C.tinta2)
                        .frame(width: 3 + AnaliticasTokens.Radio.celda)
                        .mask(alignment: .leading) { Rectangle().frame(width: 3) }
                }
            }
    }
}

/// Un delta ya interpretado: la marca, el texto en la unidad que lo juzga y contra qué.
struct DeltaVista: Equatable {
    let delta: Double
    let unidad: UnidadLectura
    /// Nulo = no hay umbral: se pinta como cambio.
    let significativo: Bool?
    let etiqueta: String?
    /// ¿Es mejor? La comparación lo dice si lo sabe; si no, la unidad.
    let mejor: Bool

    var igual: Bool { significativo == false || AnaliticasFormato.esCero(delta, unidad) }
    var marca: String { igual ? "≈" : mejor ? "▲" : "▼" }
    var texto: String { AnaliticasFormato.esCero(delta, unidad) ? "igual" : AnaliticasFormato.formatearDelta(delta, unidad) }
}

/// ▲ mejor · ▼ peor · ≈ dentro del ruido, con el texto del delta y contra qué.
/// El color no cambia: la marca y la palabra lo dicen. Se parte en dos líneas si no cabe.
struct AnaliticasDelta: View {
    let delta: DeltaVista
    var corto = false

    var body: some View {
        AnaliticasFlujo(espacioH: 6, espacioV: 2) {
            Text("\(delta.marca) \(delta.texto)")
                .font(.system(size: TA.etiqueta, weight: .semibold).monospacedDigit())
                .foregroundStyle(delta.igual ? C.tinta2 : C.tinta)
                .lineLimit(1)
                .fixedSize()
                .accessibilityLabel("\(delta.igual ? "sin cambio" : delta.mejor ? "mejor" : "peor") \(delta.texto)")
            if !corto, let etiqueta = delta.etiqueta {
                AnaliticasEtiqueta(texto: etiqueta)
            }
        }
    }
}

struct AnaliticasChipAncla: View {
    let ancla: AnclaDeLectura
    var body: some View {
        if let etiqueta = ancla.etiqueta {
            Text(etiqueta)
                .font(.system(size: TA.etiqueta, weight: .semibold))
                .foregroundStyle(C.tinta2)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .overlay(
                    Capsule().strokeBorder(C.carril, style: StrokeStyle(lineWidth: 1.5, dash: ancla.esEstimada ? [4, 3] : []))
                )
                .fixedSize()
        }
    }
}

/// Un dato: etiqueta arriba, cifra a 30 pt con la unidad a 15 pt, y debajo el
/// delta en la unidad que lo juzga y el ancla. Sin dato no hay celda: la
/// ausencia se dice en el hueco del bloque, no con guiones.
struct AnaliticasCelda<Pie: View>: View {
    let etiqueta: String
    let valor: Double
    let unidad: UnidadLectura
    var delta: DeltaVista? = nil
    var ancla: AnclaDeLectura? = nil
    /// Una línea en tinta2 debajo (la fecha del récord, el basal).
    var nota: String? = nil
    var cuerpo: CGFloat = TA.dato
    @ViewBuilder var pie: () -> Pie

    init(etiqueta: String, valor: Double, unidad: UnidadLectura, delta: DeltaVista? = nil, ancla: AnclaDeLectura? = nil,
         nota: String? = nil, cuerpo: CGFloat = TA.dato, @ViewBuilder pie: @escaping () -> Pie) {
        self.etiqueta = etiqueta; self.valor = valor; self.unidad = unidad; self.delta = delta
        self.ancla = ancla; self.nota = nota; self.cuerpo = cuerpo; self.pie = pie
    }

    var body: some View {
        AnaliticasSuperficie {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    AnaliticasEtiqueta(texto: etiqueta)
                    Spacer(minLength: 0)
                    if let ancla { AnaliticasChipAncla(ancla: ancla) }
                }
                HStack(alignment: .lastTextBaseline, spacing: 5) {
                    AnaliticasNumeral(texto: AnaliticasFormato.cifra(valor, unidad), cuerpo: cuerpo)
                    let u = AnaliticasFormato.unidadCorta(unidad, valor: valor)
                    if !u.isEmpty { AnaliticasEtiqueta(texto: u) }
                }
                if let delta { AnaliticasDelta(delta: delta) }
                if let nota { AnaliticasEtiqueta(texto: nota) }
                pie()
            }
        }
    }
}

extension AnaliticasCelda where Pie == EmptyView {
    init(etiqueta: String, valor: Double, unidad: UnidadLectura, delta: DeltaVista? = nil, ancla: AnclaDeLectura? = nil,
         nota: String? = nil, cuerpo: CGFloat = TA.dato) {
        self.init(etiqueta: etiqueta, valor: valor, unidad: unidad, delta: delta, ancla: ancla, nota: nota, cuerpo: cuerpo) { EmptyView() }
    }
}

/// Dos celdas a lo ancho, a partes iguales (la rejilla del vivo).
struct AnaliticasFilaDeCeldas<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido
    var body: some View {
        HStack(alignment: .top, spacing: AnaliticasTokens.hueco - 2) { contenido() }
    }
}

// MARK: - Marcas pequeñas

struct AnaliticasPuntoFamilia: View {
    let familia: FamiliaLectura?
    var talla: CGFloat = 10
    var body: some View {
        Circle().fill(C.familia(familia)).frame(width: talla, height: talla).accessibilityHidden(true)
    }
}

/// Un sello sin naranja: fondo sobre tinta. El naranja es acción.
struct AnaliticasSello: View {
    let texto: String
    var body: some View {
        Text(texto)
            .font(.system(size: TA.etiqueta, weight: .bold))
            .foregroundStyle(C.fondo)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(C.tinta, in: Capsule())
            .fixedSize()
    }
}

// MARK: - Botón y hueco

/// La ÚNICA pieza naranja de la pestaña: una acción que el atleta puede hacer ahora.
struct AnaliticasBoton: View {
    let texto: String
    var secundario = false
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(texto)
                .font(.system(size: secundario ? TA.cuerpo : TA.boton.cuerpo, weight: .bold))
                .foregroundStyle(secundario ? C.tinta : C.sobreAccion)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 18)
                .frame(height: secundario ? TA.botonMenor : TA.boton.alto)
                .background(secundario ? C.superficie2 : C.accion, in: Capsule())
        }
        .buttonStyle(VivoPulsarStyle())
        .accessibilityLabel(texto)
    }
}

/// «llevas 3 de 6 semanas»: el plazo, dibujado.
struct AnaliticasPlazo: View {
    let plazo: PlazoHueco
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                ForEach(0..<max(1, plazo.hacen), id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2).fill(i < plazo.llevas ? C.tinta : C.carril).frame(height: 8)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(plazo.llevas) de \(plazo.hacen) \(plazo.unidad)")
            AnaliticasEtiqueta(texto: "\(plazo.llevas) de \(plazo.hacen) \(plazo.unidad)")
        }
    }
}

/// vacío: qué hacer para tenerlo · poco: cuánto falta (el plazo dibujado) ·
/// viejo: desde cuándo, y qué lo reanuda. Nunca una silueta muda.
struct AnaliticasHueco: View {
    let texto: TextoHueco
    var viejo = false
    let onSalida: (DestinoDeSalida) -> Void

    var body: some View {
        AnaliticasSuperficie(filete: viejo) {
            VStack(alignment: .leading, spacing: 10) {
                AnaliticasCuerpo(texto: texto.titulo, fuerte: true)
                AnaliticasCuerpo(texto: texto.cuerpo, tono: C.tinta2)
                if let plazo = texto.plazo { AnaliticasPlazo(plazo: plazo) }
                switch texto.salida {
                case .accion(let etiqueta, let destino):
                    AnaliticasBoton(texto: etiqueta) { onSalida(destino) }
                case .espera(let etiqueta):
                    AnaliticasEtiqueta(texto: etiqueta)
                }
            }
        }
    }
}

// MARK: - Leyenda

enum MuestraDeLeyenda { case linea, lineaDiscontinua, relleno, contorno, punto }

struct ItemDeLeyenda: Identifiable {
    let etiqueta: String
    let muestra: MuestraDeLeyenda
    let color: Color
    var id: String { etiqueta }
}

/// Siempre que haya ≥ 2 series; ninguna con una sola. Se parte en filas si no cabe.
struct AnaliticasLeyenda: View {
    let items: [ItemDeLeyenda]
    var body: some View {
        AnaliticasFlujo(espacioH: 16, espacioV: 6) {
            ForEach(items) { it in
                HStack(spacing: 6) {
                    clave(it)
                    Text(it.etiqueta)
                        .font(.system(size: TA.etiqueta, weight: .semibold))
                        .foregroundStyle(C.tinta2)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
        }
        .accessibilityLabel("Leyenda")
    }

    @ViewBuilder
    private func clave(_ it: ItemDeLeyenda) -> some View {
        let w: CGFloat = 18, h: CGFloat = 12
        switch it.muestra {
        case .linea:
            Rectangle().fill(it.color).frame(width: w, height: 2).clipShape(Capsule())
        case .lineaDiscontinua:
            Path { p in p.move(to: CGPoint(x: 0, y: 1)); p.addLine(to: CGPoint(x: w, y: 1)) }
                .stroke(it.color, style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [4, 3]))
                .frame(width: w, height: 2)
        case .relleno:
            RoundedRectangle(cornerRadius: 3).fill(it.color).frame(width: w, height: h)
        case .contorno:
            RoundedRectangle(cornerRadius: 3).strokeBorder(it.color, lineWidth: 1.5).frame(width: w, height: h)
        case .punto:
            Circle().fill(it.color).frame(width: 8, height: 8)
        }
    }
}

// MARK: - Un flujo (los ítems se parten en filas cuando no caben)

/// Lo que en el doble es `flex-wrap`. Los hijos conservan su tamaño ideal.
struct AnaliticasFlujo: Layout {
    var espacioH: CGFloat = 8
    var espacioV: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ancho = proposal.width ?? .infinity
        return colocar(ancho: ancho, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let r = colocar(ancho: bounds.width, subviews: subviews)
        for (i, origen) in r.origenes.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + origen.x, y: bounds.minY + origen.y), proposal: .unspecified)
        }
    }

    private func colocar(ancho: CGFloat, subviews: Subviews) -> (size: CGSize, origenes: [CGPoint]) {
        var origenes: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, altoFila: CGFloat = 0, anchoMax: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x > 0, x + t.width > ancho {
                x = 0
                y += altoFila + espacioV
                altoFila = 0
            }
            origenes.append(CGPoint(x: x, y: y))
            x += t.width + espacioH
            altoFila = max(altoFila, t.height)
            anchoMax = max(anchoMax, x - espacioH)
        }
        return (CGSize(width: ancho.isFinite ? min(ancho, anchoMax) : anchoMax, height: y + altoFila), origenes)
    }
}
