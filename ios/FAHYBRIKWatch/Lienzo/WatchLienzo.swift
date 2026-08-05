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
//
// Aquí queda sólo lo que PINTA. El MODELO (`WatchModo`, `WatchPagina`,
// `WatchTinte`, `WatchSujeto`…) vive en `FAHYBRIK/Watch/Lienzo/`, compilado
// también en iOS para que los guiones se puedan testear desde FAHYBRIKTests.

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
                WatchTheme.bg.ignoresSafeArea()
                if let tinte {
                    tinte.opacity(WatchTinte.maxOpacity)
                        .ignoresSafeArea()
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
                .opacity(0.55)
                .ignoresSafeArea()

                if let bisel { bisel.ignoresSafeArea() }

                contenido(size: geo.size)

                // Destello de transición.
                destello.color
                    .opacity(destelloOpacity)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }
        }
        // EL FONDO va a sangre; EL CONTENIDO no. En watchOS la franja superior no
        // es nuestra: el sistema pinta ahí la hora en toda app de entreno y no se
        // puede quitar. El safe area superior existe justo para eso, y al ignorarlo
        // la banda de contexto se metía DEBAJO de «10:59» y no se leía ninguna de
        // las dos. Se ignora sólo para pintar el color hasta el borde.
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
                // Y aunque el safe area ya baja el contenido, la banda se queda en
                // la mitad izquierda: la hora vive arriba a la derecha y un
                // contexto largo («SERIE 1 / 5 · TE FALTAN») llegaría hasta ella.
                Text(p.contexto.uppercased())
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.0)
                    .foregroundStyle(Color.white.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, 44)

                Spacer(minLength: 4)

                HStack(alignment: .lastTextBaseline, spacing: 2) {
                    // El numeral del CONTRATO (§10.2): LA monoespaciada de cero
                    // rachado, recta — la del doble. La display itálica del port
                    // hacía bailar el crono y no era el canon aprobado.
                    Text(p.sujeto)
                        .font(.custom("Menlo-Bold", size: alto))
                        .foregroundStyle(p.tono)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
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
                    // CENTRADO, como en el doble. Iba pegado a la izquierda y en el
                    // borde inferior el aro curva hacia dentro: un segundo nivel
                    // largo («OBJETIVO Z4 · 4:49/km») se metía DEBAJO del aro y se
                    // leía cortado. Centrarlo lo mantiene dentro del ancho útil
                    // pase lo que pase, que es la razón por la que el kit lo centra.
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.horizontal, 8)
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
                    // 10 pt y no 9: si una versal existe es para leerse, y en la
                    // muñeca sudando 9 pt no se lee (petición explícita de Alex).
                    Text(nota.uppercased())
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(1.0)
                        .foregroundStyle(WatchTheme.dim)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        // Centrada, como el segundo nivel y como el doble: es la
                        // fila que más abajo queda y por tanto la que más cerca
                        // pasa del borde curvo del bisel.
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.horizontal, 8)
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
