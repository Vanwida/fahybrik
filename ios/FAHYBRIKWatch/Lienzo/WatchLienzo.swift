import SwiftUI

// EL LIENZO DE LA MUÑECA — un solo sitio donde se decide cuánto mide cada cosa.
//
// Espejo de `web/components/design-twin/kit-watch/`: las vistas en vivo no dibujan
// layout suelto — DECLARAN páginas y el lienzo hace la aritmética. Eso impide
// que salgan cinco escalas del mismo número (el fallo del watch-live de hoy).
//
// Lo que el lienzo hace cumplir:
//  1. El MODO manda sobre el formato (ciego / ojeada / mando).
//  2. Un sujeto por página y un segundo nivel. No hay tercero.
//  3. Sin zona no hay tinte: el color es un dato (§7, §10.1).
//  4. La pantalla ES el botón: el gesto lo recoge el área de contenido; no hay
//     un botón de 52 pt que robe altura al numeral.

// MARK: - Modo

/// Lo que el atleta PUEDE hacer ahora mismo — manda sobre el formato.
enum WatchModo {
    /// Ni mirar ni tocar: el reloj enuncia y espera. Oferta atenuada, jamás petición.
    case ciego
    /// Mirar sin tocar: un dato a sangre. Gesto latente sin franja anunciada.
    case ojeada
    /// Mirar y tocar: aquí van la decisión y la franja a plena luz.
    case mando

    var pintaFranja: Bool {
        switch self {
        case .ciego, .mando: return true
        case .ojeada: return false
        }
    }

    var franjaAtenuada: Bool {
        switch self {
        case .ciego: return true
        case .ojeada, .mando: return false
        }
    }
}

// MARK: - Página

/// Una página del reloj. Lo que no cabe no encoge: se va a la siguiente.
struct WatchPagina: Identifiable {
    let id: String
    /// Banda superior de una línea: dónde estás.
    let contexto: String
    let modo: WatchModo
    /// El numeral a sangre.
    let sujeto: String
    var unidad: String? = nil
    var tono: Color = WatchTheme.ink
    /// Segundo nivel — y no hay tercero.
    var segundoEtiqueta: String? = nil
    var segundoValor: String? = nil
    var segundoTono: Color? = nil
    /// Franja de acción. En `ojeada` el lienzo no la pinta (gesto latente).
    var accion: String? = nil
    var onToca: (() -> Void)? = nil
    /// Versales al pie: procedencia u honestidad.
    var nota: String? = nil
}

// MARK: - Destello

/// Golpe de luz a pantalla completa por SUCESO (cierre de serie, ronda nueva).
struct WatchDestello: Equatable {
    var n: Int = 0
    var color: Color = WatchTheme.orangeSoft
}

// MARK: - Zona (nombres de box, no jerga de corredor)

enum WatchZonaNombre {
    static func de(_ zone: HRZone) -> String {
        switch zone {
        case .z1: return "muy suave"
        case .z2: return "suave"
        case .z3: return "medio"
        case .z4: return "fuerte"
        case .z5: return "máximo"
        }
    }
}

// MARK: - Honestidad (§7)

enum WatchNota {
    static let delMovil = "del móvil"
    static let sinMaquina = "sin máquina emparejada"
    static let sinAncla = "sin umbral · no hay zona"
    static let umbralEstimado = "umbral estimado"
    static let loDicesTu = "lo dices tú"
    static let sinSenal = "sin señal · buscando"
}

// MARK: - Tinte del lienzo

enum WatchTinte {
    /// Tope del tinte de zona. Por encima el aro y las versales pierden contraste.
    static let maxOpacity: Double = 0.38

    /// Color de relleno del fondo, o nil → negro puro (sin ancla / sin zona).
    static func color(for zone: HRZone?) -> Color? {
        zone.map { WatchTheme.zoneColor($0) }
    }

    static func urgente(_ quedaS: Double) -> Color {
        quedaS > 0 && quedaS <= WatchTheme.urgentThreshold ? WatchTheme.orange : WatchTheme.ink
    }
}

// MARK: - Página del pulso (compartida por las nueve familias)

enum WatchPaginasComunes {
    /// Página del cuerpo. Sin pulso no se pinta (nil). Sin zona → ppm crudos + nota.
    static func pulso(bpm: Int?, zone: HRZone?, modo: WatchModo = .ojeada) -> WatchPagina? {
        guard let bpm else { return nil }
        if let zone {
            return WatchPagina(
                id: "pulso",
                contexto: "Pulso",
                modo: modo,
                sujeto: "\(bpm)",
                segundoValor: "Z\(zone.rawValue) \(WatchZonaNombre.de(zone))",
                segundoTono: WatchTheme.zoneColor(zone)
            )
        }
        return WatchPagina(
            id: "pulso",
            contexto: "Pulso",
            modo: modo,
            sujeto: "\(bpm)",
            segundoValor: "ppm",
            nota: WatchNota.sinAncla
        )
    }

    static func tiempo(segundos: Double, contexto: String = "Llevas", nota: String? = nil, modo: WatchModo = .ojeada) -> WatchPagina {
        WatchPagina(
            id: "tiempo",
            contexto: contexto,
            modo: modo,
            sujeto: WatchFormat.clock(segundos),
            nota: nota
        )
    }
}

// MARK: - Altura del sujeto (ancho manda)

enum WatchSujeto {
    /// Techo / suelo del numeral (pt de cifra), espejo del kit-watch.
    static let techo: CGFloat = 110
    static let suelo: CGFloat = 44

    /// Altura de cifra por número de glifos. En la muñeca limita el ANCHO, no el alto.
    static func alto(para texto: String) -> CGFloat {
        let n = max(1, texto.count)
        let porAncho: CGFloat
        switch n {
        case 1: porAncho = techo
        case 2: porAncho = 96
        case 3: porAncho = 72
        case 4: porAncho = 56
        default: porAncho = suelo
        }
        return porAncho
    }
}

// MARK: - Lienzo Reloj

/// El marco de todas las vistas en vivo del reloj.
struct WatchReloj: View {
    let paginas: [WatchPagina]
    /// Color de zona o de estado (recuperación). Nil = fondo negro, sin tinte.
    let tinte: Color?
    var bisel: AnyView? = nil
    var destello: WatchDestello = WatchDestello()

    @State private var indice = 0
    @State private var destelloOpacity: Double = 0
    @State private var dragOffset: CGFloat = 0

    private var paginaActiva: WatchPagina {
        guard !paginas.isEmpty else {
            return WatchPagina(id: "vacio", contexto: "", modo: .ojeada, sujeto: "—")
        }
        return paginas[min(max(0, indice), paginas.count - 1)]
    }

    private var varias: Bool { paginas.count > 1 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                WatchTheme.bg
                if let tinte {
                    tinte.opacity(WatchTinte.maxOpacity)
                        .animation(.easeInOut(duration: 0.7), value: tinte.description)
                }
                // Degradado OLED: aire arriba/abajo, sujeto legible en el centro.
                LinearGradient(
                    colors: [
                        Color.black,
                        Color.black.opacity(0.80),
                        Color.black.opacity(0),
                        Color.black.opacity(0.72),
                        Color.black,
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .opacity(0.9)

                if let bisel { bisel }

                contenido(size: geo.size)

                // Destello de transición.
                destello.color
                    .opacity(destelloOpacity)
                    .allowsHitTesting(false)
            }
        }
        .ignoresSafeArea()
        .onChange(of: destello.n) { _, _ in
            guard destello.n > 0 else { return }
            destelloOpacity = 0.55
            withAnimation(.easeOut(duration: 0.45)) { destelloOpacity = 0 }
            WatchHaptics.transition()
        }
        .onChange(of: paginas.count) { _, _ in
            if indice >= paginas.count { indice = max(0, paginas.count - 1) }
        }
    }

    @ViewBuilder
    private func contenido(size: CGSize) -> some View {
        let p = paginaActiva
        let franja = p.modo.pintaFranja ? p.accion : nil
        let alto = WatchSujeto.alto(para: p.sujeto)

        VStack(spacing: 0) {
            // Área principal = el botón (toque) + deslizamiento (páginas).
            VStack(spacing: 0) {
                Text(p.contexto.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.1)
                    .foregroundStyle(Color.white.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer(minLength: 4)

                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    Text(p.sujeto)
                        .font(.system(size: alto, weight: .heavy).italic().monospacedDigit())
                        .foregroundStyle(p.tono)
                        .lineLimit(1)
                        .minimumScaleFactor(0.45)
                    if let u = p.unidad {
                        Text(u)
                            .font(.system(size: alto * 0.30, weight: .heavy).monospacedDigit())
                            .foregroundStyle(WatchTheme.dim)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity)

                Spacer(minLength: 4)

                if let valor = p.segundoValor {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        if let et = p.segundoEtiqueta {
                            Text(et.uppercased())
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(1.0)
                                .foregroundStyle(WatchTheme.dim)
                        }
                        Text(valor)
                            .font(.system(size: 18, weight: .heavy).monospacedDigit())
                            .foregroundStyle(p.segundoTono ?? WatchTheme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 2)
                }

                if let franja {
                    Text(franja.uppercased())
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(0.8)
                        .foregroundStyle(
                            p.modo.franjaAtenuada
                                ? WatchTheme.dim.opacity(0.55)
                                : WatchTheme.ink.opacity(0.92)
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                        .padding(.bottom, 2)
                }

                if let nota = p.nota {
                    Text(nota.uppercased())
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(1.0)
                        .foregroundStyle(WatchTheme.dim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .offset(x: dragOffset)
            .gesture(gestoPrincipal)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accesibilidad(p))
            .accessibilityAddTraits(p.onToca != nil ? .isButton : [])

            if varias {
                HStack(spacing: 6) {
                    ForEach(0..<paginas.count, id: \.self) { i in
                        Circle()
                            .fill(i == indice ? WatchTheme.ink : Color.white.opacity(0.28))
                            .frame(width: 6, height: 6)
                    }
                }
                .padding(.top, 4)
                .padding(.bottom, 2)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(width: size.width, height: size.height)
    }

    private var gestoPrincipal: some Gesture {
        let p = paginaActiva
        return DragGesture(minimumDistance: 0)
            .onChanged { value in
                // Solo deslizamiento horizontal cuenta para paginar.
                if abs(value.translation.width) > abs(value.translation.height) {
                    dragOffset = value.translation.width * 0.35
                }
            }
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                let distancia = hypot(dx, dy)
                withAnimation(.easeOut(duration: 0.18)) { dragOffset = 0 }

                // Deslizamiento horizontal ≥ 24 pt → página.
                if abs(dx) >= 24, abs(dx) > abs(dy), varias {
                    if dx < 0 { ir(indice + 1) } else { ir(indice - 1) }
                    return
                }
                // Toque (poco movimiento) → acción de la página, si la hay.
                if distancia < 18, let onToca = p.onToca {
                    WatchHaptics.tap()
                    onToca()
                }
            }
    }

    private func ir(_ destino: Int) {
        guard !paginas.isEmpty else { return }
        let n = ((destino % paginas.count) + paginas.count) % paginas.count
        withAnimation(.easeInOut(duration: 0.2)) { indice = n }
    }

    private func accesibilidad(_ p: WatchPagina) -> String {
        var parts = [p.contexto, p.sujeto]
        if let u = p.unidad { parts.append(u) }
        if let s = p.segundoValor { parts.append(s) }
        if let a = p.accion { parts.append(a) }
        return parts.joined(separator: ", ")
    }
}
