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
    /// EN QUÉ PÁGINA SE ABRE, por id. Existe porque la del esfuerzo es la del
    /// CENTRO y es la que tiene que estar puesta mientras corres: ni los datos ni
    /// los controles están a más de un gesto, y volver al esfuerzo tampoco.
    /// Nil = la primera, que es lo que hacen las familias de una sola página útil.
    var inicial: String? = nil
    /// Un lienzo PROPIO en vez del tinte plano. Lo usa la página de zona, cuyo
    /// fondo no es un color sino un dato: la pantalla se llena del color de tu
    /// zona conforme te acercas a la siguiente. Cuando viene, `tinte` se ignora —
    /// los dos pintan lo mismo y superponerlos ensuciaría el hue.
    var fondo: AnyView? = nil
    var bisel: AnyView? = nil
    var destello: WatchDestello = WatchDestello()

    /// LA PÁGINA SE GUARDA POR SU NOMBRE, NO POR SU SITIO.
    ///
    /// Un guion no devuelve una lista fija: `GuionRodaje` publica la del ritmo y
    /// la de la distancia sólo cuando el GPS fija, y pone el pulso PRIMERO en
    /// cuanto hay zona viva. Con el índice como memoria, el atleta que se dejaba
    /// el reloj en la página 1 sin señal se lo encontraba en «distancia» al fijar
    /// el GPS, y de nuevo en otra al llegar el primer latido: la página que
    /// eligió cambiaba debajo del pulgar sin que él tocara nada.
    ///
    /// Con el id, cada página es ella misma mientras exista. Y si deja de existir
    /// —se pierde la señal y el ritmo desaparece— se cae al sujeto, que es la
    /// primera, en vez de a la que haya heredado ese número.
    @State private var paginaId: String?
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

    /// Dónde está la página guardada DENTRO de la lista de ahora. Sin memoria, o
    /// con una página que ya no existe, manda la de arranque (`inicial`) — y si
    /// tampoco existe, la primera.
    private var indice: Int {
        if let paginaId, let i = paginas.firstIndex(where: { $0.id == paginaId }) { return i }
        return indiceInicial
    }

    private var indiceInicial: Int {
        guard let inicial, let i = paginas.firstIndex(where: { $0.id == inicial }) else { return 0 }
        return i
    }

    private var paginaActiva: WatchPagina {
        guard !paginas.isEmpty else {
            return WatchPagina(id: "vacio", contexto: "", modo: .ojeada, sujeto: "—")
        }
        return paginas[min(indice, paginas.count - 1)]
    }

    private var varias: Bool { paginas.count > 1 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                WatchTheme.bg.ignoresSafeArea()
                if let propio = paginaActiva.fondo, !atenuado {
                    // El fondo de la PÁGINA manda sobre el tinte de zona. Lo usa el
                    // descanso: es el único tramo en marcha en el que la zona deja
                    // de gobernar, porque lo que importa es que estás parado.
                    propio.ignoresSafeArea()
                } else if let fondo, !atenuado {
                    // El lienzo de zona sustituye al tinte, no se suma: los dos
                    // pintan lo mismo y superponerlos ensuciaría el hue.
                    fondo.ignoresSafeArea()
                } else if let tinte, !atenuado {
                    // PLANO. Antes iba al 38 % debajo de un degradado a negro puro
                    // que dejaba el color vivo sólo en la franja del centro — justo
                    // donde va el numeral, que lo tapa —, así que la zona no se leía
                    // de un vistazo por mucho que se subiera el porcentaje.
                    tinte.opacity(WatchTinte.maxOpacity)
                        .ignoresSafeArea()
                        .animation(.easeInOut(duration: 0.7), value: tinte.description)
                }
                // Y del degradado de antes queda esto: contraste en las esquinas y
                // en las dos bandas de versales, cuerpo de la pantalla intacto.
                WatchVineta(atenuado: atenuado)

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
        // Bajas la muñeca → vuelves al sujeto. Igual que la app de Apple, que
        // regresa sola a métricas: al levantar el brazo no puedes encontrarte en
        // una página que no pediste y que ya no puedes abandonar deslizando. Y
        // «el sujeto» es la de ARRANQUE, no la primera de la lista: en correr la
        // primera es el panel de datos, que es justo la que no se mira en marcha.
        .onChange(of: atenuado) { _, reducida in
            if reducida, !paginas.isEmpty { paginaId = paginas[indiceInicial].id }
        }
    }

    @ViewBuilder
    private func contenido(size: CGSize) -> some View {
        let p = paginaActiva
        let franja = p.modo.pintaFranja ? p.accion : nil
        let alto = WatchSujeto.alto(de: p, varias: varias)

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

                switch p.cuerpo {
                case let .panel(filas):
                    panel(filas)
                case let .controles(botones):
                    controles(botones)
                case nil:
                    sujeto(p, alto: alto)
                }

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
                        // Como el contexto y la nota: una franja larga («TOCA ·
                        // SOLO PARA TI») encoge antes que envolverse a dos líneas
                        // dentro de un alto fijo y salirse por el borde curvo.
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
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
            // VoiceOver NO atraviesa un DragGesture: el doble toque de activación
            // y los deslizamientos del rotor jamás llegan a `gestoPrincipal`, así
            // que «la pantalla es el botón» no existía con VoiceOver encendido.
            // Se declaran los dos gestos como acciones de accesibilidad: activar
            // dispara la acción de la página, ajustar (deslizar arriba/abajo)
            // pasa de página, y el valor anuncia en cuál estás.
            .accionAccesible(p.onToca)
            .paginadoAccesible(total: paginas.count, indice: indice, ir: ir)

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
                // La posición ya la anuncia el valor de accesibilidad del área de
                // contenido; unos círculos sin nombre solo añadirían paradas mudas
                // al rotor.
                .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(width: size.width, height: size.height)
    }

    /// EL NUMERAL A SANGRE — el cuerpo de siempre y el de siete de las nueve
    /// familias.
    @ViewBuilder
    private func sujeto(_ p: WatchPagina, alto: CGFloat) -> some View {
        // EL DECIMAL NO ES EL DATO, ES LA PRECISIÓN. Lo parte el lienzo, no las
        // vistas: pasan «4,76» y aquí se resuelve. Escrito todo al mismo cuerpo se
        // lee «4 , 76» —la coma abre un hueco igual que un dígito y parte el número
        // en dos— y encima se come el ancho que necesita la cifra.
        let (entero, decimal) = WatchSujeto.partirDecimal(p.sujeto)
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            // El numeral del CONTRATO (§10.2): LA monoespaciada de cero rachado,
            // recta — la del doble. La display itálica del port hacía bailar el
            // crono y no era el canon aprobado.
            Text(entero)
                .font(.custom("Menlo-Bold", size: alto))
                .foregroundStyle(p.tono)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if !decimal.isEmpty {
                Text(decimal)
                    .font(.custom("Menlo-Bold", size: alto * WatchSujeto.decimalEm / WatchSujeto.capEm))
                    .foregroundStyle(p.tono)
                    .lineLimit(1)
            }
            if let u = p.unidad {
                Text(u)
                    .font(.system(size: alto * WatchSujeto.unidadEm, weight: .heavy).monospacedDigit())
                    .foregroundStyle(WatchTheme.dim)
                    .lineLimit(1)
                    .padding(.leading, 2)
            }
        }
        // EL LATIDO. Un golpe de escala cuando `p.latido` cambia — nunca al montar
        // la página, sólo al CAMBIAR: si disparara con el primer valor puesto, la
        // ronda 1 de un tabata pulsaría sin que hubiera pasado nada todavía.
        .scaleEffect(golpe)
        .onChange(of: p.latido) { _, _ in
            golpe = 1
            withAnimation(.easeOut(duration: 0.18)) { golpe = 1.14 }
            withAnimation(.easeOut(duration: 0.16).delay(0.18)) { golpe = 1 }
        }
        .frame(maxWidth: .infinity)
    }

    /// EL PANEL — la única página sin sujeto. Cuatro cifras de la sesión de un
    /// vistazo, cada una con su etiqueta encima: es la respuesta a «¿cómo va la
    /// carrera?», que no es la misma pregunta que «¿cuánto me falta?».
    ///
    /// El precio está medido y se acepta a cambio: cuatro filas bajan cada número a
    /// 24 pt (≈3,5 mm de alto), que se lee con el brazo levantado pero no de reojo
    /// en marcha. Para eso está la página de al lado.
    @ViewBuilder
    private func panel(_ filas: [WatchFila]) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(filas) { f in
                Text(f.etiqueta.uppercased())
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.0)
                    .foregroundStyle(WatchTheme.dim)
                    .lineLimit(1)
                HStack(alignment: .lastTextBaseline, spacing: 0) {
                    let (entero, decimal) = WatchSujeto.partirDecimal(f.valor)
                    Text(entero)
                        .font(.custom("Menlo-Bold", size: 24))
                        .foregroundStyle(WatchTheme.ink)
                        .lineLimit(1)
                    if !decimal.isEmpty {
                        Text(decimal)
                            .font(.custom("Menlo-Bold", size: 24 * WatchSujeto.decimalEm / WatchSujeto.capEm))
                            .foregroundStyle(WatchTheme.ink)
                            .lineLimit(1)
                    }
                    if let u = f.unidad {
                        Text(u)
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundStyle(WatchTheme.dim)
                            .padding(.leading, 1)
                    }
                    if let cola = f.cola {
                        // La zona no es una fila aparte: es lo que SIGNIFICA tu
                        // pulso, así que va con él y con su color.
                        Text(cola)
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundStyle(f.colaTono ?? WatchTheme.dim)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .padding(.leading, 6)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// LOS CONTROLES — la única página con botones, porque es la única a la que se
    /// llega habiendo decidido dejar de mirar y tocar. En las otras dos un botón le
    /// quitaría 52 pt al dato (el 21 % del lienzo) para ofrecer algo que corriendo
    /// no se usa.
    ///
    /// Rueda con la corona a propósito: es la única página de la interfaz donde eso
    /// vale, porque a esta se llega parado.
    @ViewBuilder
    private func controles(_ botones: [WatchBoton]) -> some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(botones) { b in
                    WatchBotonDeControl(boton: b)
                }
            }
            .padding(.vertical, 2)
        }
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
        withAnimation(.easeInOut(duration: 0.2)) { paginaId = paginas[n].id }
    }

    private func accesibilidad(_ p: WatchPagina) -> String {
        var parts = [p.contexto]
        switch p.cuerpo {
        case let .panel(filas):
            // El panel se lee fila a fila: sin esto VoiceOver anunciaba el contexto
            // y nada más, porque su sujeto está vacío a propósito.
            parts += filas.map { f in
                [f.etiqueta, f.valor, f.unidad, f.cola].compactMap { $0 }.joined(separator: " ")
            }
        case let .controles(botones):
            parts += botones.map(\.titulo)
        case nil:
            parts.append(p.sujeto)
            if let u = p.unidad { parts.append(u) }
        }
        if let s = p.segundoValor { parts.append(s) }
        if let a = p.accion { parts.append(a) }
        if let n = p.nota { parts.append(n) }
        return parts.filter { !$0.isEmpty }.joined(separator: ", ")
    }
}

// MARK: - El botón de la página de controles
//
// Tres pesos, y no son estética: son cuánto cuesta equivocarse.
//   · `principal`   — la más frecuente y la más urgente (Pausar). Arriba, la más
//     grande y en el naranja de la acción.
//   · `normal`      — una acción más (Nuevo tramo, Siguiente bloque).
//   · `destructiva` — la única que no se puede deshacer (Terminar). Abajo, en rojo
//     y CONFIRMADA: un desliz de más no puede acabar una carrera.
private struct WatchBotonDeControl: View {
    let boton: WatchBoton
    @State private var preguntando = false

    var body: some View {
        Button {
            WatchHaptics.tap()
            if boton.confirma != nil {
                preguntando = true
            } else {
                boton.onToca()
            }
        } label: {
            Text(boton.titulo)
                .font(.system(size: boton.peso == .principal ? 17 : 15, weight: .heavy))
                .foregroundStyle(tinta)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .frame(height: boton.peso == .principal ? 56 : 48)
                .background(relleno)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(borde, lineWidth: boton.peso == .destructiva ? 1.5 : 0)
                )
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .confirmationDialog(
            boton.confirma ?? "",
            isPresented: $preguntando,
            titleVisibility: .visible
        ) {
            Button(boton.titulo, role: .destructive) { boton.onToca() }
            Button("Seguir", role: .cancel) { }
        }
    }

    private var tinta: Color {
        switch boton.peso {
        case .principal:   return WatchTheme.bg
        case .normal:      return WatchTheme.ink
        case .destructiva: return WatchTheme.zoneRed
        }
    }

    private var relleno: Color {
        switch boton.peso {
        case .principal:   return WatchTheme.orange
        case .normal:      return WatchTheme.surfaceRaised
        // Rellenarlo de rojo pondría la acción destructiva como la más pesada de la
        // pantalla; en rojo sobre casi negro se lee igual y no compite con Pausar.
        case .destructiva: return WatchTheme.zoneRed.opacity(0.16)
        }
    }

    private var borde: Color {
        boton.peso == .destructiva ? WatchTheme.zoneRed.opacity(0.55) : .clear
    }
}

// MARK: - Gestos del lienzo, en la voz de VoiceOver
//
// El área de contenido recoge toque y deslizamiento con UN DragGesture, y los
// gestos de SwiftUI no reciben los eventos sintetizados de VoiceOver. Estas dos
// ayudas son la traducción: la acción de la página como acción por defecto
// (doble toque) y el paso de página como acción ajustable (deslizar arriba /
// abajo), que es como pagina cualquier pager del sistema con VoiceOver.
private extension View {
    /// Acción por defecto de VoiceOver = el `onToca` de la página. Solo cuando la
    /// página LO TIENE: declararla siempre ofrecería un doble toque que no hace
    /// nada, y el trait de botón ya se pone aparte solo cuando corresponde.
    @ViewBuilder
    func accionAccesible(_ onToca: (() -> Void)?) -> some View {
        if let onToca {
            accessibilityAction {
                WatchHaptics.tap()
                onToca()
            }
        } else {
            self
        }
    }

    /// Paginado accesible: con más de una página, el elemento se vuelve ajustable
    /// y anuncia su posición. `ir` ya envuelve el índice (módulo), igual que el
    /// deslizamiento físico.
    @ViewBuilder
    func paginadoAccesible(total: Int, indice: Int, ir: @escaping (Int) -> Void) -> some View {
        if total > 1 {
            accessibilityValue("página \(indice + 1) de \(total)")
                .accessibilityAdjustableAction { direccion in
                    switch direccion {
                    case .increment: ir(indice + 1)
                    case .decrement: ir(indice - 1)
                    @unknown default: break
                    }
                }
        } else {
            self
        }
    }
}

// MARK: - La viñeta
//
// LO QUE QUEDA DEL DEGRADADO, y por qué se cambió. El degradado OLED iba a negro
// puro arriba y abajo y dejaba el color vivo en una franja estrecha del centro —
// exactamente donde va el numeral, que la tapa. Con eso la zona no se leía, y el
// diagnóstico fácil («el tinte es flojo, súbelo») no arregla nada: el problema no
// era el porcentaje, era que el degradado apagaba el color en las dos terceras
// partes de la pantalla.
//
// La viñeta hace lo que el degradado hacía bien y nada más: oscurece las ESQUINAS,
// donde la curva del bisel se come el lienzo y el aro necesita separarse del
// fondo, y las dos BANDAS DE VERSALES, donde hay texto pequeño. El cuerpo de la
// pantalla se queda plano y con su color entero.
struct WatchVineta: View {
    let atenuado: Bool

    /// Con la muñeca baja la viñeta aprieta: menos píxeles encendidos alrededor del
    /// sujeto, que es lo único que hay que poder leer con el brazo colgando. Va en
    /// los negros y no en un `.opacity` del conjunto porque por encima de 1 se
    /// satura y no oscurecería nada.
    private var k: Double { atenuado ? 1.7 : 1 }

    private func negro(_ alfa: Double) -> Color {
        Color.black.opacity(min(1, alfa * k))
    }

    var body: some View {
        GeometryReader { geo in
            let lado = max(geo.size.width, geo.size.height)
            ZStack {
                // Esquinas: transparente hasta el 54 % del radio, negro al 34 % en
                // el borde. Es el único sitio donde el fondo tiene que ceder.
                RadialGradient(
                    gradient: Gradient(stops: [
                        .init(color: .clear, location: 0.54),
                        .init(color: negro(0.34), location: 1),
                    ]),
                    center: UnitPoint(x: 0.5, y: 0.46),
                    startRadius: 0,
                    endRadius: lado * 0.64
                )
                // Las dos bandas de texto pequeño: la de contexto arriba y la de
                // nota / puntos abajo. En el 73 % de en medio no toca nada.
                LinearGradient(
                    stops: [
                        .init(color: negro(0.34), location: 0.00),
                        .init(color: .clear, location: 0.13),
                        .init(color: .clear, location: 0.86),
                        .init(color: negro(0.30), location: 1.00),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
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
