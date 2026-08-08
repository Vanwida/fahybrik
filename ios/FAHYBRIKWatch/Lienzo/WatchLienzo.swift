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
    /// Un lienzo PROPIO en vez del tinte plano. Lo usa la página de zona, cuyo
    /// fondo no es un color sino un dato: la pantalla se llena del color de tu
    /// zona conforme te acercas a la siguiente. Cuando viene, `tinte` se ignora —
    /// los dos pintan lo mismo y superponerlos ensuciaría el hue.
    var fondo: AnyView? = nil
    var bisel: AnyView? = nil
    var destello: WatchDestello = WatchDestello()

    @State private var indice = 0
    @State private var destelloOpacity: Double = 0
    @State private var dragOffset: CGFloat = 0

    /// LA MUÑECA BAJADA — el estado que decide si esta app sirve para entrenar.
    ///
    /// Es la queja número uno contra las apps de entreno de terceros en Apple
    /// Watch: bajas el brazo a mitad de serie y o se apaga la pantalla o el reloj
    /// del sistema tapa los datos. Apple no: en Always-On mantiene las métricas
    /// visibles y sólo quita lo que no aporta.
    ///
    /// Aquí se resuelve UNA vez, en el lienzo, y lo heredan las seis vistas. Lo
    /// que hace Apple en su propia app de entreno y copiamos:
    ///   · quitar lo que se mueve (centésimas, animaciones, destellos),
    ///   · esconder los puntos de página,
    ///   · **volver solo a la primera página**, para que al levantar la muñeca no
    ///     te encuentres en la de pulso sin haberla pedido,
    ///   · y apagar los rellenos grandes: el HIG pide cambiar áreas llenas por
    ///     trazos y bajar el brillo, no repintar la pantalla de otro color.
    ///
    /// Y una regla dura que cambia el diseño, no sólo el brillo: **con la muñeca
    /// baja el sistema ignora los deslizamientos, pero NO los toques**. Así que
    /// pasar de página deja de existir en atenuado — de ahí la vuelta a la
    /// primera — mientras que el toque de «serie hecha» sigue funcionando, que es
    /// justo el que hace falta con el brazo abajo.
    @Environment(\.isLuminanceReduced) private var atenuado
    @State private var golpe: CGFloat = 1

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
                if let fondo, !atenuado {
                    // El lienzo de zona sustituye al tinte, no se suma: los dos
                    // pintan lo mismo y superponerlos ensuciaría el hue.
                    fondo.ignoresSafeArea()
                } else if let tinte, !atenuado {
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
                // Con la muñeca baja el degradado sube: menos píxeles encendidos
                // alrededor del sujeto, que es lo único que hay que poder leer.
                .opacity(atenuado ? 0.75 : 0.55)
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
            guard destello.n > 0, !atenuado else { return }
            destelloOpacity = 0.55
            withAnimation(.easeOut(duration: 0.45)) { destelloOpacity = 0 }
            WatchHaptics.transition()
        }
        .onChange(of: paginas.count) { _, _ in
            if indice >= paginas.count { indice = max(0, paginas.count - 1) }
        }
        // Bajas la muñeca → vuelves al sujeto. Igual que la app de Apple, que
        // regresa sola a métricas: al levantar el brazo no puedes encontrarte en
        // una página que no pediste y que ya no puedes abandonar deslizando.
        .onChange(of: atenuado) { _, reducida in
            if reducida { indice = 0 }
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
                        // EL LATIDO. Un golpe de escala de 340 ms cuando `p.latido`
                        // cambia — nunca al montar la página, sólo al CAMBIAR: si
                        // disparara con el primer valor puesto, la ronda 1 de un
                        // tabata pulsaría sin que hubiera pasado nada todavía.
                        .scaleEffect(golpe)
                        .onChange(of: p.latido) { _, _ in
                            golpe = 1
                            withAnimation(.easeOut(duration: 0.18)) { golpe = 1.14 }
                            withAnimation(.easeOut(duration: 0.16).delay(0.18)) { golpe = 1 }
                        }
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
                        // En atenuado baja aún más, pero NO se quita: el HIG pide
                        // llevar un control a un aspecto «no disponible», no
                        // reorganizar la pantalla al bajar el brazo.
                        .foregroundStyle(
                            atenuado
                                ? WatchTheme.dim.opacity(0.45)
                                : (p.modo.franjaAtenuada
                                    ? WatchTheme.dim.opacity(0.55)
                                    : WatchTheme.ink.opacity(0.92))
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
                        .foregroundStyle(atenuado ? WatchTheme.dim.opacity(0.5) : WatchTheme.dim)
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

            // Los puntos de página no existen con la muñeca baja: no se puede
            // deslizar, así que anunciar que hay más páginas sería ofrecer algo
            // que el sistema no deja hacer. Apple los esconde igual.
            if varias, !atenuado {
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

// MARK: - El lienzo de ZONA
//
// EL COLOR COMO DATO, no como decoración. Idea de Alex (8-ago, tras salir a
// hacer series): la zona en grande, cada zona con su color, y la pantalla
// llenándose de ese color en degradado hacia el de la siguiente conforme te
// acercas.
//
// Por qué funciona corriendo: «Z3» a 145 y a 158 pone lo mismo, y uno de los
// dos está a un latido de irse a Z4. La ALTURA del relleno es esa diferencia, y
// su borde superior deriva hacia el hue de la zona siguiente — así que el
// atleta sabe si está entrando o saliendo sin enfocar la vista en una cifra. Al
// cruzar, el lienzo cambia de color y el relleno vuelve abajo: el salto ES el
// aviso, y no cuesta ni una línea de texto.
//
// En la ÚLTIMA zona no hay hacia dónde derivar y el degradado se queda en su
// propio color: inventar un sexto hue prometería una zona que no existe.
struct WatchLienzoZona: View {
    let posicion: HRZoneProfile.Posicion

    /// El relleno nunca desaparece del todo: al entrar en una zona por abajo hay
    /// que poder ver QUÉ zona es, no un lienzo negro.
    private static let altoMinimo: Double = 0.12
    /// A sangre pura el numeral blanco se pierde sobre el ámbar; a este tope
    /// el hue se lee y el texto se mantiene por encima de 4.5:1.
    private static let opacidad: Double = 0.55
    /// No se mezcla al 100 %: el borde tiene que leerse como el PASO hacia la
    /// siguiente zona, no como si ya estuvieras en ella.
    private static let derivaMax: Double = 0.85

    var body: some View {
        let mio = WatchTheme.zoneHex(posicion.zona)
        let desde = WatchTheme.hex(mio)
        let hasta = posicion.siguiente.map { WatchTheme.mezcla(mio, WatchTheme.zoneHex($0), Self.derivaMax) }
            ?? desde
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                WatchTheme.bg
                LinearGradient(colors: [desde, hasta], startPoint: .bottom, endPoint: .top)
                    .frame(height: geo.size.height * max(Self.altoMinimo, posicion.fraccion))
                    .opacity(Self.opacidad)
                    .animation(.easeInOut(duration: 0.7), value: posicion.fraccion)
                    .animation(.easeInOut(duration: 0.7), value: posicion.zona)
            }
        }
    }
}
