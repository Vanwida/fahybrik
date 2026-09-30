import SwiftUI

// LAS PIEZAS DE LA CARA DE CORRER — los átomos que pintan un `CuadroMuneca`
// (espejo de `kit-reloj/piezas.tsx`). Ninguna decide QUÉ se pinta: el cuadro ya
// trae el texto, el cuerpo al que cabe y la fila que ocupa. Aquí solo se decide
// CÓMO se dibuja, con los tokens de `MunecaTokens`.
//
// Toda pieza es una función pura de su entrada: sin sesión, sin motor, sin
// estado. Por eso las mismas vistas sirven al reloj en solitario y al espejo.

// MARK: - La columna de toda cara

/// La columna de toda cara: safe areas del reloj (arriba la hora del sistema),
/// centrada, sin scroll, con el aire entre filas del kit.
struct MunecaColumna<Contenido: View>: View {
    var alineacion: HorizontalAlignment = .center
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(alignment: alineacion, spacing: CGFloat(Vivo.huecoFila), content: contenido)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.top, CGFloat(Vivo.MedidasMuneca.arribaSafe))
            .padding(.bottom, CGFloat(Vivo.MedidasMuneca.abajoSafe))
            .padding(.horizontal, CGFloat(Vivo.MedidasMuneca.ladoSafe))
    }
}

/// El hueco elástico donde se centra el héroe.
struct MunecaCentro<Contenido: View>: View {
    @ViewBuilder var contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            contenido()
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Contexto, nota, instrucción

/// Dónde estás, a 16 pt semibold. Las partes ya vienen recortadas (por el final)
/// y el cuerpo ya baja de 16 a 15 si hace falta: aquí solo se dibuja.
struct MunecaContexto: View {
    let linea: Vivo.LineaTexto
    var tono: Color = MunecaPaleta.tinta

    @Environment(\.munecaMedidas) private var medidas

    /// Un título de página (Datos, Vueltas, Estructura): el núcleo lo mide.
    init(partes: [String], medidas: Vivo.MedidasMuneca, tono: Color = MunecaPaleta.tinta2) {
        self.linea = Vivo.contextoQueCabe(partes, medidas)
        self.tono = tono
    }

    init(linea: Vivo.LineaTexto, tono: Color = MunecaPaleta.tinta) {
        self.linea = linea
        self.tono = tono
    }

    var body: some View {
        Text(linea.texto)
            .font(MunecaTipo.contexto(linea.cuerpo))
            .foregroundStyle(tono)
            .lineLimit(1)
            .minimumScaleFactor(MunecaTipo.reduccionMaxima(linea.cuerpo))
            .fixedSize(horizontal: true, vertical: false)
            .frame(maxWidth: CGFloat(medidas.anchoCabeza * Vivo.TipoMuneca.holguraEstima))
            .frame(height: CGFloat(Vivo.Fila.contexto.alto))
    }
}

/// Honestidad, procedencia o el cue del coach. 15 pt, el suelo. Si no cabe en una
/// línea va en DOS (`nota.lineas`) antes que encogerse.
struct MunecaNota: View {
    let nota: Vivo.NotaVista
    var tono: Color = MunecaPaleta.tinta2

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        // Una línea que se pasa menos de la holgura del estimador se deja en una (SF Compact mide
        // casi lo que estima el núcleo): se dibuja entera, nunca con «…». Dos líneas, al ancho útil.
        texto
            .font(MunecaTipo.nota)
            .lineLimit(nota.lineas)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: nota.lineas == 1, vertical: nota.lineas > 1)
            .frame(maxWidth: CGFloat(medidas.anchoUtil * Vivo.TipoMuneca.holguraEstima))
            .frame(height: CGFloat(Vivo.filaDeNota(nota).alto))
    }

    /// El arranque («Luego ·», «Viene:») en tinta2 y el resto en su tono.
    private var texto: Text {
        guard let prefijo = nota.prefijo else { return Text(nota.texto).foregroundStyle(tono) }
        return Text("\(Text(prefijo).foregroundStyle(MunecaPaleta.tinta2)) \(Text(nota.texto).foregroundStyle(tono))")
    }
}

/// Lo que no es un número vivo pero manda: «RPE 7 · fuerte». 22 pt, en tinta.
struct MunecaInstruccion: View {
    let linea: Vivo.LineaTexto
    var tono: Color = MunecaPaleta.tinta

    var body: some View {
        Text(linea.texto)
            .font(MunecaTipo.fuente(linea.cuerpo, 600))
            .foregroundStyle(tono)
            .lineLimit(1)
            .minimumScaleFactor(MunecaTipo.reduccionMaxima(linea.cuerpo))
            .frame(height: CGFloat(Vivo.Fila.instruccion.alto))
    }
}

// MARK: - El héroe

/// El número grande, a la talla que el núcleo ha calculado para el ancho y el
/// alto que le dejan las filas presentes.
struct MunecaHeroe: View {
    let heroe: Vivo.HeroeMuneca
    var tono: Color = MunecaPaleta.tinta

    @Environment(\.munecaMedidas) private var medidas

    var body: some View {
        let vista = heroe.vista
        let talla = heroe.talla
        VStack(spacing: 0) {
            if let etiqueta = vista.etiqueta {
                Text(etiqueta)
                    .font(MunecaTipo.nota)
                    .foregroundStyle(MunecaPaleta.tinta2)
                    .frame(height: CGFloat(Vivo.Fila.etiquetaHeroe.alto))
            }
            HStack(alignment: .firstTextBaseline, spacing: CGFloat(Vivo.huecoUnidad)) {
                Text(vista.texto)
                    .font(MunecaTipo.fuente(talla.cuerpo, Vivo.escalaMuneca.peso))
                    .foregroundStyle(tono)
                if let unidad = vista.unidad {
                    Text(unidad)
                        .font(MunecaTipo.fuente(talla.cuerpoUnidad, 600))
                        .foregroundStyle(MunecaPaleta.tinta2)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: CGFloat(medidas.anchoHeroe))
            .frame(height: CGFloat(talla.cuerpo * Vivo.escalaMuneca.caja))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.dicho(vista))
    }

    /// Para el lector de pantalla: «quedan 12:30», «4:52 por km».
    static func dicho(_ v: Vivo.HeroeVista) -> String {
        [v.etiqueta, v.texto, v.unidad].compactMap { $0 }.joined(separator: " ")
    }
}

// MARK: - Las líneas de apoyo

/// El corazón del pulso. En tinta2: el rojo es de la zona 5, no del pulso.
struct MunecaCorazon: View {
    var talla: CGFloat = 14

    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: talla))
            .foregroundStyle(MunecaPaleta.tinta2)
            .accessibilityHidden(true)
    }
}

/// Una marca de zona: «Z4» en el color de su zona. El espectro es el único color de dato.
struct MunecaChipZona: View {
    let zona: Vivo.ZonaVista

    var body: some View {
        Text("Z\(zona.n)")
            .font(MunecaTipo.notaNegrita)
            .foregroundStyle(MunecaPaleta.zona(zona.color))
    }
}

/// Una línea de dato (segundo a 30 pt, tercero a 22 pt): etiqueta y unidad a 15
/// en tinta2, el valor a su cuerpo (ya reducido si no cabía, nunca por debajo de 15).
struct MunecaLinea: View {
    let linea: Vivo.LineaDeDato

    var body: some View {
        let l = linea.vista
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            if let etiqueta = l.etiqueta {
                Text(etiqueta).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2).padding(.trailing, 6)
            }
            if l.glifo {
                MunecaCorazon(talla: linea.cuerpo >= 30 ? 16 : 14).padding(.trailing, 5)
            }
            Text(l.valor)
                .font(MunecaTipo.fuente(linea.cuerpoValor, 600))
                .foregroundStyle(MunecaPaleta.tinta)
            if let unidad = l.unidad {
                Text(unidad).font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta2).padding(.leading, 3)
            }
            if let tendencia = l.tendencia {
                Text(tendencia == .baja ? "↓" : "↑").font(MunecaTipo.nota).foregroundStyle(MunecaPaleta.tinta).padding(.leading, 3)
            }
            if let zona = l.zona {
                MunecaChipZona(zona: zona).padding(.leading, 6)
            }
            if let aviso = l.aviso {
                Text("\(aviso.marca) \(aviso.texto)").font(MunecaTipo.notaSemibold).foregroundStyle(MunecaPaleta.tinta).padding(.leading, 8)
            }
        }
        .lineLimit(1)
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxWidth: CGFloat(linea.ancho * Vivo.TipoMuneca.holguraEstima))
        .frame(height: CGFloat(linea.cuerpo >= 30 ? Vivo.Fila.segundo.alto : Vivo.Fila.tercero.alto))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.dicho(l))
    }

    /// «pulso 152 ppm zona 4».
    static func dicho(_ l: Vivo.LineaVista) -> String {
        var partes: [String] = []
        if let e = l.etiqueta { partes.append(e) }
        if l.glifo { partes.append("pulso") }
        partes.append(l.valor)
        if let u = l.unidad { partes.append(u) }
        if let t = l.tendencia { partes.append(t == .baja ? "bajando" : "subiendo") }
        if let z = l.zona { partes.append("zona \(z.n)") }
        if let a = l.aviso { partes.append(a.texto) }
        return partes.joined(separator: " ")
    }
}

// MARK: - Botones

/// Un botón acotado (≥ 44 pt). Naranja SOLO si es la acción del momento.
struct MunecaBoton: View {
    enum Variante { case accion, superficie }

    let titulo: String
    var variante: Variante = .accion
    var alto: CGFloat = MunecaForma.tocableMin
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Text(titulo)
                .font(MunecaTipo.boton)
                .lineLimit(1)
                .minimumScaleFactor(MunecaTipo.reduccionMaxima(17))
                .padding(.horizontal, MunecaForma.aireBoton)
                .frame(maxWidth: .infinity)
                .frame(height: alto)
        }
        .buttonStyle(Estilo(variante: variante))
    }

    private struct Estilo: ButtonStyle {
        let variante: Variante

        func makeBody(configuration: Configuration) -> some View {
            let accion = variante == .accion
            configuration.label
                .foregroundStyle(accion ? MunecaPaleta.sobreAccion : MunecaPaleta.tinta)
                .background(
                    Capsule().fill(accion ? (configuration.isPressed ? WatchTheme.orangePress : MunecaPaleta.accion) : MunecaPaleta.superficie2)
                )
                .contentShape(Capsule())
        }
    }
}
