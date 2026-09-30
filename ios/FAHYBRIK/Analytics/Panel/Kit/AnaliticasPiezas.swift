import SwiftUI

// LAS PIEZAS DEL IPHONE — el cromo y los átomos de la pestaña de analíticas
// (espejo de `kit-analiticas/piezas.tsx`), hechos con el kit de «El día»: el
// tema del atleta (claro u oscuro, ninguna pantalla fuerza el suyo), los
// papeles tipográficos (`.papel`, suelo 15 pt), el acento del CLUB en lo que
// es marca o acción, y ninguna pieza escribe un hex ni un cuerpo.
//
//   AnaliticasEtiqueta / Cuerpo / Numeral   texto
//   AnaliticasSeccion       título de sección + pregunta + «›» al detalle
//   AnaliticasSuperficie    una tarjeta con su filete de «dato viejo» (`tarjetaDia`); `ListaDia`, una tarjeta con filas
//   AnaliticasCelda         una tesela de dato: etiqueta, cifra, unidad, delta y ancla
//   AnaliticasDelta         ▲ / ▼ / ≈ con el texto en la unidad que lo juzga
//   AnaliticasChipAncla     «medido», «declarado», «estimado», «por edad»
//   AnaliticasPuntoFamilia
//   AnaliticasBoton         la salida de un hueco (acento del club) o la acción de tinta (`BotonAccionDia`)
//   AnaliticasPlazo         «llevas 3 de 6 semanas», dibujado
//   AnaliticasHueco         vacío / poco / viejo, con salida obligatoria
//   AnaliticasLeyenda       la leyenda de un gráfico (siempre con ≥ 2 series)
//
// Lo genérico ya no vive aquí: el conmutador es `SegmentoDia`, el flujo `FlowLayout`, el «Nuevo» un
// `InfoPill(.velo)`, la vuelta `AtrasDia` y la cifra de una fila `.papel(.cifra)`.
//
// EL COLOR. El acento del club es marca y acción (el conmutador elegido, la
// salida de un hueco): NUNCA el color de una familia ni de un dato. El veredicto
// no cambia el color de la cifra: cambia la marca ▲▼≈ y la palabra.

// MARK: - Texto

/// Etiqueta o unidad: 15 pt, en el gris de apoyo. El suelo.
struct AnaliticasEtiqueta: View {
    let texto: String
    var tono: Color = Theme.Color.muted
    var body: some View {
        Text(texto)
            .papel(.notaFuerte)
            .foregroundStyle(tono)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Una línea de cuerpo (17 pt). Se parte en dos líneas; nunca se trunca.
struct AnaliticasCuerpo: View {
    let texto: String
    var tono: Color = Theme.Color.foreground
    var fuerte = false
    var body: some View {
        Text(texto)
            .papel(fuerte ? .cuerpoFuerte : .cuerpo)
            .foregroundStyle(tono)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Toda cifra del panel. El dato de una tesela va en cursiva pesada como toda cifra de «El día»;
/// la de una fila (una familia, un récord) va recta y más pequeña, para leerse en columna.
struct AnaliticasNumeral: View {
    enum Talla {
        /// 32 pt, cursiva de marca: el dato de una tesela.
        case dato
        /// 22 pt, recta: la cifra de una fila.
        case fila
    }

    let texto: String
    var talla: Talla = .dato
    var tono: Color = Theme.Color.foreground

    var body: some View {
        Group {
            switch talla {
            case .dato: Text(texto).papel(.dato)
            case .fila: Text(texto).papel(.cifra)
            }
        }
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

/// Título de sección de «El día» (24 pt, cursiva de marca) + la pregunta que responde + «›» al
/// detalle cuando lo hay. El accesorio (un conmutador) va en su propia fila: nunca dentro del
/// título ni robándole sitio.
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
        VStack(alignment: .leading, spacing: Theme.Spacing.m + 2) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                TituloSeccionDia(titulo) { chevron }
                if let pregunta { AnaliticasEtiqueta(texto: pregunta) }
            }
            accesorio()
            contenido()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// El «›» es el botón: 48 pt de área táctil (más que los 44 de la HIG) sobre un glifo de 20.
    @ViewBuilder
    private var chevron: some View {
        if let onAbrir {
            Button(action: onAbrir) {
                IconoDia(.chevron, tam: 20)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.9))
            .padding(.vertical, -Theme.Spacing.m)
            .padding(.trailing, -Theme.Spacing.m)
            .accessibilityLabel("Abrir \(titulo)")
        }
    }
}

extension AnaliticasSeccion where Accesorio == EmptyView {
    init(titulo: String, pregunta: String? = nil, onAbrir: (() -> Void)? = nil, @ViewBuilder contenido: @escaping () -> Contenido) {
        self.init(titulo: titulo, pregunta: pregunta, onAbrir: onAbrir, accesorio: { EmptyView() }, contenido: contenido)
    }
}

// MARK: - Superficies

/// La tarjeta de «El día»: superficie, raya fina y radio 22. Los gráficos van dentro de una.
/// El estado «viejo» lleva un filete a la izquierda.
struct AnaliticasSuperficie<Contenido: View>: View {
    var padding: CGFloat = Theme.Spacing.l
    var filete = false
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        contenido()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) {
                if filete { Rectangle().fill(Theme.Color.muted).frame(width: 4) }
            }
            .tarjetaDia()
    }
}

// MARK: - Delta, ancla y celdas

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

    /// El color va en la MARCA y nunca en la cifra: verde mejor, ámbar peor, gris dentro del ruido. La
    /// forma (▲▼≈) y la palabra dicen lo mismo sin color.
    var colorDeLaMarca: Color { igual ? Theme.Color.muted : mejor ? Theme.Color.ok : Theme.Color.warning }
}

/// ▲ mejor · ▼ peor · ≈ dentro del ruido, con el texto del delta y contra qué. Se parte en dos
/// líneas si no cabe.
struct AnaliticasDelta: View {
    let delta: DeltaVista
    var corto = false

    var body: some View {
        FlowLayout(spacing: 6, lineSpacing: 2) {
            HStack(spacing: Theme.Spacing.xs) {
                Text(delta.marca).foregroundStyle(delta.colorDeLaMarca)
                Text(delta.texto).foregroundStyle(delta.igual ? Theme.Color.muted : Theme.Color.foreground)
            }
            .papel(.notaPesada)
            .lineLimit(1)
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(delta.igual ? "sin cambio" : delta.mejor ? "mejor" : "peor") \(delta.texto)")
            if !corto, let etiqueta = delta.etiqueta {
                AnaliticasEtiqueta(texto: etiqueta)
            }
        }
    }
}

/// De dónde sale la cifra. El estimado va con la raya a trazos: se distingue de un dato medido sin
/// depender del color.
struct AnaliticasChipAncla: View {
    let ancla: AnclaDeLectura
    var body: some View {
        if let etiqueta = ancla.etiqueta {
            Text(etiqueta)
                .papel(.rotulo)
                .foregroundStyle(Theme.Color.muted)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .overlay(
                    Capsule().strokeBorder(Theme.Color.faint, style: StrokeStyle(lineWidth: 1.5, dash: ancla.esEstimada ? [4, 3] : []))
                )
                .fixedSize()
        }
    }
}

/// Un dato: etiqueta arriba, cifra a 32 pt con la unidad a 15 pt, y debajo el delta en la unidad que
/// lo juzga y el ancla. Es una `TeselaDia`: dentro de `TeselasDia` se iguala en alto con
/// su vecina. Sin dato no hay celda: la ausencia se dice en el hueco del bloque, no con guiones.
struct AnaliticasCelda<Pie: View>: View {
    let etiqueta: String
    let valor: Double
    let unidad: UnidadLectura
    var delta: DeltaVista? = nil
    var ancla: AnclaDeLectura? = nil
    /// Una línea de apoyo debajo (la fecha del récord, el basal).
    var nota: String? = nil
    @ViewBuilder var pie: () -> Pie

    init(etiqueta: String, valor: Double, unidad: UnidadLectura, delta: DeltaVista? = nil, ancla: AnclaDeLectura? = nil,
         nota: String? = nil, @ViewBuilder pie: @escaping () -> Pie) {
        self.etiqueta = etiqueta; self.valor = valor; self.unidad = unidad; self.delta = delta
        self.ancla = ancla; self.nota = nota; self.pie = pie
    }

    var body: some View {
        TeselaDia(
            cabecera: {
                let rotulo = Text(etiqueta)
                    .papel(.rotulo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let ancla {
                    // En una celda de media pantalla, «Vatios al mismo pulso» y su ancla no caben en la misma línea: el ancla baja.
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                            rotulo.lineLimit(1)
                            Spacer(minLength: 0)
                            AnaliticasChipAncla(ancla: ancla)
                        }
                        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                            rotulo
                            AnaliticasChipAncla(ancla: ancla)
                        }
                    }
                } else {
                    rotulo
                }
            },
            contenido: {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    let numeral = AnaliticasNumeral(texto: AnaliticasFormato.cifra(valor, unidad))
                    let u = AnaliticasFormato.unidadCorta(unidad, valor: valor)
                    // Una cifra ancha («98.171») no deja sitio a su unidad en media pantalla: «kg» se partía en «k» y «g». Si no caben en la
                    // misma línea, la unidad baja debajo.
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.xs + 1) {
                            numeral
                            if !u.isEmpty { AnaliticasEtiqueta(texto: u) }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            numeral
                            if !u.isEmpty { AnaliticasEtiqueta(texto: u) }
                        }
                    }
                    if let delta { AnaliticasDelta(delta: delta) }
                    if let nota { AnaliticasEtiqueta(texto: nota) }
                    pie()
                }
            }
        )
    }
}

extension AnaliticasCelda where Pie == EmptyView {
    init(etiqueta: String, valor: Double, unidad: UnidadLectura, delta: DeltaVista? = nil, ancla: AnclaDeLectura? = nil, nota: String? = nil) {
        self.init(etiqueta: etiqueta, valor: valor, unidad: unidad, delta: delta, ancla: ancla, nota: nota) { EmptyView() }
    }
}

// MARK: - Marcas pequeñas

struct AnaliticasPuntoFamilia: View {
    let familia: FamiliaLectura?
    var talla: CGFloat = 12
    var body: some View {
        Circle().fill(FamiliaGrande(familia).color).frame(width: talla, height: talla).accessibilityHidden(true)
    }
}

// MARK: - Botón y hueco

/// La acción de una salida. La principal es la pastilla de tinta invertida de «El día» (`AccionDia`: 52 pt,
/// cursiva de marca, flecha): una sola por sujeto. La secundaria, la de un hueco, es una pastilla de
/// contorno con el tinte del acento del CLUB (ocho tarjetas con la misma pastilla de tinta no serían
/// «una sola acción clara»). Sobre un tinte del acento el texto es la tinta del tema (CONTRATO-UI §11.2).
struct AnaliticasBoton: View {
    let texto: String
    var secundario = false
    let accion: () -> Void

    var body: some View {
        if secundario {
            Button(action: accion) {
                Text(texto)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, 18)
                    .padding(.vertical, Theme.Spacing.s)
                    .frame(minHeight: Theme.Size.toque - 4)
                    .background(Theme.Color.accentTint(sobre: Theme.Color.surface), in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
                    .contentShape(Capsule())
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .accessibilityLabel(texto)
        } else {
            BotonAccionDia(texto, glifo: .flecha, accion: accion)
        }
    }
}

/// «llevas 3 de 6 semanas»: el plazo, dibujado con la regleta del kit.
struct AnaliticasPlazo: View {
    let plazo: PlazoHueco
    var tono: Color = Theme.Color.muted

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            RegletaDia(n: plazo.llevas, de: max(1, plazo.hacen), alto: 8)
            AnaliticasEtiqueta(texto: "\(plazo.llevas) de \(plazo.hacen) \(plazo.unidad)", tono: tono)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(plazo.llevas) de \(plazo.hacen) \(plazo.unidad)")
    }
}

/// vacío: qué hacer para tenerlo · poco: cuánto falta (el plazo dibujado) · viejo: desde cuándo, y qué
/// lo reanuda. Nunca una silueta muda.
struct AnaliticasHueco: View {
    let texto: TextoHueco
    var viejo = false
    let onSalida: (DestinoDeSalida) -> Void

    var body: some View {
        AnaliticasSuperficie(filete: viejo) {
            VStack(alignment: .leading, spacing: 10) {
                AnaliticasCuerpo(texto: texto.titulo, fuerte: true)
                AnaliticasCuerpo(texto: texto.cuerpo, tono: Theme.Color.muted)
                if let plazo = texto.plazo { AnaliticasPlazo(plazo: plazo) }
                switch texto.salida {
                case .accion(let etiqueta, let destino):
                    AnaliticasBoton(texto: etiqueta, secundario: true) { onSalida(destino) }
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
        FlowLayout(spacing: 16, lineSpacing: 6) {
            ForEach(items) { it in
                HStack(spacing: 6) {
                    clave(it)
                    Text(it.etiqueta)
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.muted)
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
            Rectangle().fill(it.color).frame(width: w, height: Theme.Chart.linea).clipShape(Capsule())
        case .lineaDiscontinua:
            Path { p in p.move(to: CGPoint(x: 0, y: 1)); p.addLine(to: CGPoint(x: w, y: 1)) }
                .stroke(it.color, style: StrokeStyle(lineWidth: Theme.Chart.linea, lineCap: .round, dash: Theme.Chart.discontinuo))
                .frame(width: w, height: Theme.Chart.linea)
        case .relleno:
            RoundedRectangle(cornerRadius: 3).fill(it.color).frame(width: w, height: h)
        case .contorno:
            RoundedRectangle(cornerRadius: 3).strokeBorder(it.color, lineWidth: Theme.Chart.contorno).frame(width: w, height: h)
        case .punto:
            Circle().fill(it.color).frame(width: 8, height: 8)
        }
    }
}

