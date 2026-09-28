import SwiftUI

// LA REJILLA, «LUEGO» Y LA TIRA (I5.5–I5.7) — lo que acompaña al sujeto
// (espejo de `kit-iphone-vivo/rejilla.tsx`).
//   VivoRejilla          2–4 métricas propias (`Vivo.metricasDelPaso`), el pulso
//                        siempre. Es la franja ELÁSTICA: el sobrante del lienzo
//                        entra en sus celdas, y si la celda es alta el valor crece.
//   VivoLuego            el siguiente PASO con su objetivo, y el «después».
//   VivoTiraEstructura   la sesión entera como barra segmentada por pasos:
//                        trabajo naranja, lo demás gris, el paso vivo marcado.

private struct VivoCelda: View {
    let m: Vivo.Metrica
    let alta: Bool
    let compacta: Bool
    var apretada = false

    var body: some View {
        let crece = alta && !m.texto
        let cuerpo: CGFloat = crece ? VivoTokens.TI.trabajo : compacta ? VivoTokens.TI.datoTexto + 2 : apretada ? VivoTokens.Celda.datoApretado : VivoTokens.TI.dato
        let fila = HStack(alignment: .firstTextBaseline, spacing: 4) {
            VivoNumeral(texto: m.valor, cuerpo: cuerpo)
            if let u = m.unidad { VivoEtiqueta(texto: u) }
            if let t = m.tendencia, t != .estable { VivoEtiqueta(texto: t == .baja ? "↓" : "↑", tono: VivoColor.tinta) }
            if let z = m.zona { VivoChipZona(zona: z) }
            if let a = m.aviso { VivoEtiqueta(texto: "\(a.marca) \(a.texto)", tono: VivoColor.tinta) }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        Group {
            if compacta {
                HStack(spacing: 6) {
                    etiqueta
                    Spacer(minLength: 0)
                    if m.texto { textoValor } else { fila }
                }
                .padding(.horizontal, VivoTokens.Celda.padding + 2)
                .frame(maxWidth: .infinity, minHeight: VivoTokens.Celda.compacta)
            } else {
                VStack(alignment: .leading, spacing: apretada ? 0 : 6) {
                    if alta { Spacer(minLength: 0) }
                    etiqueta
                    if !alta { Spacer(minLength: 0) }
                    if m.texto { textoValor } else { fila }
                    if alta { Spacer(minLength: 0) }
                }
                .padding(apretada ? VivoTokens.Celda.paddingApretada : VivoTokens.Celda.padding)
                .frame(maxWidth: .infinity, minHeight: apretada ? 0 : VivoTokens.Celda.minAlto, alignment: .leading)
            }
        }
        .frame(maxHeight: .infinity)
        .background(VivoColor.celda, in: RoundedRectangle(cornerRadius: VivoTokens.Celda.radio, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var etiqueta: some View {
        HStack(spacing: 5) {
            if m.glifo { VivoCorazon() }
            VivoEtiqueta(texto: m.etiqueta)
        }
    }

    private var textoValor: some View {
        Text(m.valor)
            .font(.system(size: alta ? VivoTokens.TI.datoTexto + 4 : VivoTokens.TI.datoTexto, weight: .semibold))
            .foregroundStyle(VivoColor.tinta)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
    }
}

/// Un texto largo («12 Wall Ball · 9 kg») va a lo ancho; uno corto («1/4») comparte fila.
private func aLoAncho(_ m: Vivo.Metrica) -> Bool { m.texto && m.valor.count > 12 }

/// LA REJILLA DE APOYO. Siempre dos columnas. Dos celdas en una fila; tres, dos y
/// la tercera a lo ancho; cuatro, en 2 × 2. `apoyo`: lo que la familia mete
/// ANTES de las celdas en la misma franja (la anotación de la serie).
struct VivoRejilla<Apoyo: View>: View {
    let metricas: [Vivo.Metrica]
    var compacta = false
    /// Horizontal (§3): celdas sin alto mínimo, el valor un punto más bajo.
    var apretada = false
    @ViewBuilder var apoyo: () -> Apoyo

    init(metricas: [Vivo.Metrica], compacta: Bool = false, apretada: Bool = false, @ViewBuilder apoyo: @escaping () -> Apoyo = { EmptyView() }) {
        self.metricas = metricas
        self.compacta = compacta
        self.apretada = apretada
        self.apoyo = apoyo
    }

    var body: some View {
        let celdas = Array(metricas.prefix(4))
        let ultimaSuelta = celdas.count % 2 == 1 && !celdas.contains(where: aLoAncho)
        VStack(spacing: VivoTokens.hueco) {
            apoyo()
            if !celdas.isEmpty {
                GeometryReader { g in
                    let filas = filasDe(celdas)
                    let altoCelda = (g.size.height - VivoTokens.hueco * CGFloat(Swift.max(0, filas - 1))) / CGFloat(Swift.max(1, filas))
                    let alta = !compacta && !apretada && altoCelda >= VivoTokens.Celda.alta
                    VStack(spacing: VivoTokens.hueco) {
                        ForEach(filasCeldas(celdas, ultimaSuelta: ultimaSuelta), id: \.self) { fila in
                            HStack(spacing: VivoTokens.hueco) {
                                ForEach(fila, id: \.self) { k in
                                    VivoCelda(m: celdas[k], alta: alta, compacta: compacta, apretada: apretada)
                                }
                            }
                            .frame(maxHeight: .infinity)
                        }
                    }
                }
            } else {
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, VivoTokens.margen)
        .frame(maxHeight: .infinity)
    }

    private func filasDe(_ celdas: [Vivo.Metrica]) -> Int {
        let anchas = celdas.filter(aLoAncho).count
        return anchas + Int((Double(celdas.count - anchas) / 2).rounded(.up))
    }

    /// Los índices de las celdas por fila: las anchas solas, las demás de dos en dos.
    private func filasCeldas(_ celdas: [Vivo.Metrica], ultimaSuelta: Bool) -> [[Int]] {
        var filas: [[Int]] = []
        var pendiente: [Int] = []
        for k in celdas.indices {
            let ancha = aLoAncho(celdas[k]) || (ultimaSuelta && k == celdas.count - 1)
            if ancha {
                if !pendiente.isEmpty { filas.append(pendiente); pendiente = [] }
                filas.append([k])
            } else {
                pendiente.append(k)
                if pendiente.count == 2 { filas.append(pendiente); pendiente = [] }
            }
        }
        if !pendiente.isEmpty { filas.append(pendiente) }
        return filas
    }
}

// MARK: - Luego

/// «Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55».
struct VivoLuego: View {
    let luego: Vivo.LuegoVista?
    var prefijo = "Luego"

    var body: some View {
        Group {
            if let l = luego {
                VivoCuerpo(texto: Text("\(prefijo == "Luego" ? "Luego · " : "Viene: ")").foregroundStyle(VivoColor.tinta2)
                           + Text(l.que)
                           + (l.despues.map { Text(" · después ").foregroundStyle(VivoColor.tinta2) + Text($0) } ?? Text("")))
                    .frame(maxWidth: .infinity, minHeight: VivoTokens.Alto.luego, alignment: .leading)
                    .padding(.horizontal, VivoTokens.margen)
            } else {
                Color.clear.frame(height: VivoTokens.Alto.luego)
            }
        }
    }
}

// MARK: - La tira de estructura

/// LA SESIÓN ENTERA EN UNA TIRA: un segmento por paso, proporcional a lo que
/// dura, trabajo en naranja y lo demás en gris. Tocar abre la Estructura.
struct VivoTiraEstructura: View {
    let arcos: [Vivo.ArcoDeTramo]
    let enCurso: Int
    let fraccion: Double
    var alAbrir: (() -> Void)? = nil

    private static let minSegmento: CGFloat = 3
    private static let huecoSegmento: CGFloat = 2

    var body: some View {
        let total = arcos.reduce(0) { $0 + Swift.max(0, $1.peso) }
        let pesoTotal = total > 0 ? total : Double(Swift.max(1, arcos.count))
        Button(action: { alAbrir?() }) {
            GeometryReader { g in
                let libre = g.size.width - Self.huecoSegmento * CGFloat(Swift.max(0, arcos.count - 1))
                HStack(spacing: Self.huecoSegmento) {
                    ForEach(Array(arcos.enumerated()), id: \.offset) { i, a in
                        let peso = (Swift.max(0, a.peso) > 0 ? a.peso : pesoTotal / Double(Swift.max(1, arcos.count))) / pesoTotal
                        let w = Swift.max(Self.minSegmento, libre * peso)
                        let color = a.trabajo ? VivoColor.accion : VivoColor.tinta2
                        let opacidad: Double = i < enCurso ? 1 : i == enCurso ? 0.45 : 0.22
                        ZStack(alignment: .leading) {
                            Capsule().fill(color).opacity(opacidad)
                            if i == enCurso, fraccion > 0 {
                                Capsule().fill(color).frame(width: w * Swift.min(1, Swift.max(0, fraccion)))
                                    .animation(.linear(duration: 0.9), value: fraccion)
                            }
                        }
                        .frame(width: w, height: 7)
                    }
                }
            }
            .frame(height: VivoTokens.Alto.tira)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, VivoTokens.margen)
        .accessibilityLabel("Abrir la estructura de la sesión")
    }
}
