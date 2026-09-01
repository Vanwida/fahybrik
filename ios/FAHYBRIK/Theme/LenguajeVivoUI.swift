import SwiftUI

// EL LENGUAJE DEL ENTRENO EN VIVO — el pintado (§10 del CONTRATO-UI).
//
// El NÚCLEO (la banda, la escala, el juicio del delta, el trabajo contable) vive
// en `LenguajeVivo.swift`, que compila también en el reloj. Aquí está lo que
// necesita `Theme.Color` / `Theme.Typography`, y por eso se queda en el teléfono:
// el reloj se pinta con su propio `WatchTheme`. Es el mismo reparto que ya hace
// `ZoneColors.swift`.
//
// Aquí vive UNA vez cada una de las cosas que hacen que las vistas en vivo se
// reconozcan como la misma app:
//
//   Ambiente        — la zona tiñe el lienzo (§10.1)
//   Numeral         — un solo numeral, el del cero rachado (§10.2)
//   MarcoVivo       — el sujeto cae SIEMPRE a la misma altura (§10.3, §10.4)
//   FranjaAccion    — la acción no pesa como el sujeto (§10.5)
//   TrabajoVista    — lo que de verdad haces no va en gris (§10.6)
//   DeltaPastilla   — «+2 s vs objetivo»: el número ya interpretado
//
// Regla de mantenimiento (§0): si hay que cambiar el tinte, se cambia AQUÍ y
// cambia en las diez. Una pantalla que vuelva a escribir su propio degradado de
// zona o su propio tamaño de sujeto está rompiendo el §10.

// MARK: - §10.1 · La zona tiñe el lienzo. Siempre.

/// Cuánto color aguanta cada tema.
///
/// En oscuro el tinte tiene que subir para que se lea a dos metros; en claro, con
/// el mismo porcentaje, el lienzo se emborrona y el texto pierde contraste. Por
/// eso el reparto es por apariencia y no un número único.
private enum MezclaAmbiente {
    static func centro(_ esquema: ColorScheme) -> Double { esquema == .dark ? 0.30 : 0.17 }
    static func suelo(_ esquema: ColorScheme) -> Double { esquema == .dark ? 0.14 : 0.08 }
    /// Lo que tarda el lienzo en pasar de una zona a la siguiente. Largo a
    /// propósito: un cambio de zona es fisiología, no un evento de interfaz, y a
    /// 200 ms parpadea en la periferia mientras corres.
    static let transicion: Double = 1.1
}

/// EL FONDO DE UNA VISTA EN VIVO **ES** TU ZONA DE PULSO.
///
/// Un tinte ambiente, oscuro y saturado apenas, que cambia contigo. Aplica a
/// todas las vistas donde haya FC — correr, ergo, fuerza, EMOM, For Time, AMRAP y
/// dobles.
///
/// SIN ANCLA DE FC NO HAY TINTE y el lienzo queda neutro (§7): el color es un
/// DATO, y una pantalla sin pulso teñida de algo estaría inventando intensidad.
/// Esa pantalla no es la versión rota de la buena — es la misma pantalla diciendo
/// la verdad, y por eso conserva banda, numeral y acción intactos.
///
/// El tinte es AMBIENTE: vive detrás de todo, no tiñe el texto y no compite con
/// el sujeto. Y el naranja de marca NO es un color de zona (§9.1): `acento` se
/// reserva para el instante en que algo se logra, nunca para un estado sostenido.
struct Ambiente: View {
    /// Nil = no hay zona que enseñar. Ni por falta de pulso, ni por falta de
    /// umbral con el que clasificarlo. En los dos casos, lienzo neutro.
    let zona: HRZone?
    /// Tiñe de naranja: SOLO el instante en que algo se logra.
    var acento: Bool = false
    /// UN TONO QUE NO ES UNA ZONA, para las pantallas cuyo sujeto no es el pulso.
    ///
    /// En las analíticas el lienzo lo tiñe el VEREDICTO, no una zona: no hay una
    /// intensidad que valga para doce semanas. Es el mismo ambiente y la misma
    /// mezcla — se añade aquí en vez de escribir un segundo degradado, porque dos
    /// definiciones del fondo de la app acaban separándose y entonces dos
    /// pantallas hermanas dejan de parecer la misma. Nil = manda `zona`.
    var tono: Color? = nil

    @Environment(\.colorScheme) private var esquema

    var body: some View {
        if let tono {
            capa(tono)
                .animation(.easeInOut(duration: MezclaAmbiente.transicion), value: tono)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        } else {
            porZona
        }
    }

    private var porZona: some View {
        ZStack {
            // Una capa por zona, y solo la viva a opacidad 1: así el cambio de
            // zona se TRANSICIONA. Un degradado no interpola de un color a otro;
            // dos capas cruzándose, sí.
            ForEach(HRZone.allCases, id: \.rawValue) { z in
                capa(z.color)
                    .opacity(!acento && zona == z ? 1 : 0)
            }
            capa(Theme.Color.accent)
                .opacity(acento ? 1 : 0)
        }
        .animation(.easeInOut(duration: MezclaAmbiente.transicion), value: zona)
        .animation(.easeInOut(duration: MezclaAmbiente.transicion / 2), value: acento)
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// El ambiente de un color: un halo alto que nace por encima del sujeto y un
    /// poso que sube desde el suelo. Los dos se apagan antes de llegar al centro,
    /// que es donde vive el numeral y donde el color no debe competir.
    private func capa(_ color: Color) -> some View {
        ZStack {
            EllipticalGradient(
                colors: [color.opacity(MezclaAmbiente.centro(esquema)), .clear],
                center: UnitPoint(x: 0.5, y: 0.2),
                startRadiusFraction: 0,
                endRadiusFraction: 0.7
            )
            LinearGradient(
                colors: [color.opacity(MezclaAmbiente.suelo(esquema)), .clear],
                startPoint: .bottom,
                endPoint: UnitPoint(x: 0.5, y: 0.55)
            )
        }
    }
}

// MARK: - §10.2 · Un solo numeral, y es el del cero rachado

/// El lienzo del que cuelga la escala del numeral: el sitio que de verdad tiene
/// el sujeto. Lo inyecta `MarcoVivo`; sin él el numeral no sabría a qué escalar y
/// se quedaría en el suelo del rango, que es como tres pantallas del doble
/// acabaron con el sujeto clavado en el mínimo sin que nadie lo notara.
private struct LienzoVivoKey: EnvironmentKey {
    static let defaultValue = CGSize(width: 378, height: BandaViva.sujeto)
}

extension EnvironmentValues {
    var lienzoVivo: CGSize {
        get { self[LienzoVivoKey.self] }
        set { self[LienzoVivoKey.self] = newValue }
    }
}

/// TODO número grande de una vista en vivo pasa por aquí.
///
/// Mono recta, pesada y tabular — la cara de instrumento con el cero rachado, la
/// que se lee sudando y en movimiento. Nada de tres tratamientos distintos para
/// el 139 del pulso, el 0:25 del reloj y el 5×100 de la serie: **un numeral para
/// toda la app**.
///
/// `tono` existe porque el pulso SÍ se pinta del color de su zona; el resto de
/// los sujetos van en la tinta normal y le dejan el color al ambiente.
struct Numeral: View {
    let texto: String
    var escala: EscalaNumeral = .sujeto
    var tono: Color = Theme.Color.foreground
    /// La ranura de unidad no siempre recibe una unidad: a veces recibe una nota
    /// de honestidad («sin lecturas»), que es §7 y no cabe en la misma línea.
    var unidad: String?

    @Environment(\.lienzoVivo) private var lienzo
    /// Dynamic Type sobre el número (§4: `scaledFont` en TODO, números incluidos).
    @ScaledMetric(relativeTo: .largeTitle) private var factor: CGFloat = 1

    private var tamano: CGFloat {
        EscalaNumeral.tamano(texto: texto,
                             alto: lienzo.height,
                             ancho: lienzo.width,
                             escala: escala,
                             escalaTipografica: factor)
    }

    var body: some View {
        // `lastTextBaseline` y no `center`: la unidad se apoya en la línea del
        // número, que es como se lee «139 ppm» y no «139  ppm» flotando.
        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
            Text(texto)
                .font(.system(size: tamano, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(tono)
                .lineLimit(1)
                .animation(.linear(duration: 0.6), value: tono)
            if let unidad {
                Text(unidad)
                    .font(Theme.Typography.readoutLabel)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// La etiqueta del sujeto — micro-versales, encima del numeral.
struct EtiquetaSujeto: View {
    let texto: String
    var tono: Color = Theme.Color.muted

    var body: some View {
        Text(texto)
            .scaledFont(11, weight: .semibold, relativeTo: .caption2)
            .uppercaseTracked()
            .foregroundStyle(tono)
            .animation(.linear(duration: 0.6), value: tono)
    }
}

// MARK: - §10.3 y §10.4 · El sujeto cae siempre a la misma altura, y manda

/// EL MARCO DE TODA VISTA EN VIVO. Cinco filas, y el sujeto siempre en la tercera.
///
/// Las filas de cromo y contexto se RESERVAN aunque vengan vacías — ahí está el
/// truco: una pantalla sin franja de contexto sigue empujando el sujeto a la
/// misma altura que una que sí la tiene, y por eso el numeral no se mueve al
/// cambiar de formato a mitad de entreno.
///
/// El reparto del sobrante lo hace `MarcoVivoLayout`, y sigue el orden del §10.3:
/// crecen los apoyos, luego el sujeto, y si aun así sobra es que falta contenido.
struct MarcoVivo<Cromo: View, Contexto: View, Sujeto: View, Apoyos: View, Accion: View>: View {
    @ViewBuilder var cromo: Cromo
    @ViewBuilder var contexto: Contexto
    @ViewBuilder var sujeto: Sujeto
    @ViewBuilder var apoyos: Apoyos
    @ViewBuilder var accion: Accion

    var body: some View {
        GeometryReader { geo in
            MarcoVivoLayout(compacto: geo.size.height < BandaViva.altoMinimoVertical) {
                ZStack { cromo }
                ZStack { contexto }
                ZStack { sujeto }
                ZStack { apoyos }
                ZStack { accion }
            }
            // El numeral escala con el LIENZO, y este es el único sitio que lo
            // conoce: el ancho real menos el relleno del marco, por el techo de
            // la banda del sujeto.
            .environment(\.lienzoVivo,
                          CGSize(width: max(0, geo.size.width - 2 * BandaViva.hueco),
                                 height: BandaViva.sujeto))
        }
    }
}

/// El reparto del alto de una vista en vivo, con el ancla del §10.3.
///
/// Se escribe como `Layout` y no como un `VStack` con espaciadores porque la
/// regla necesita medir el sujeto: la banda ancla su CENTRO, y los apoyos
/// empiezan donde el sujeto ACABA de verdad, no donde acabaría una caja de 340
/// pt. Con un `VStack` esa medida no existe, y el resultado es el hueco de ~230
/// pt que el EMOM tenía entre el reloj y su traza de rondas.
struct MarcoVivoLayout: Layout {
    /// El móvil girado (402 pt de alto): la banda de 340 no cabe y la estrategia
    /// `gobierna` deja de sostenerse, así que el marco degrada a `centra` (§6.1).
    /// La VOZ no cambia — mismo tinte, mismo numeral, misma acción.
    let compacto: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 5 else { return }
        let pad = BandaViva.hueco
        let ancho = bounds.width - 2 * pad
        guard ancho > 0 else { return }
        let x = bounds.minX + pad

        // Fila 1 y 2: cromo y contexto, pegados arriba y con su alto reservado
        // aunque vengan vacíos.
        var y = bounds.minY + pad
        coloca(subviews[0], x: x, y: y, ancho: ancho, alto: BandaViva.cromo)
        y += BandaViva.cromo + pad
        coloca(subviews[1], x: x, y: y, ancho: ancho, alto: BandaViva.contexto)
        y += BandaViva.contexto + pad

        // Fila 5: la acción, anclada abajo y a una mano (§6.2).
        let accionY = bounds.maxY - pad - BandaViva.accion
        coloca(subviews[4], x: x, y: accionY, ancho: ancho, alto: BandaViva.accion)

        // Fila 3: el sujeto. Se le OFRECE la banda entera y se mide lo que de
        // verdad ocupa; luego se centra en el ancla. Ese «lo que de verdad ocupa»
        // es toda la corrección del 29-jul: la banda ancla el centro óptico, no
        // reserva un alto.
        let techoBanda = min(BandaViva.sujeto, max(0, accionY - pad - y))
        let medida = subviews[2].sizeThatFits(
            ProposedViewSize(width: ancho, height: techoBanda)
        )
        let altoSujeto = min(medida.height, techoBanda)

        // El ancla es el mismo en las diez vistas mientras haya sitio. Cuando no
        // lo hay (pantalla corta, móvil girado) se centra en el hueco que queda,
        // que es lo que manda el §6.1 al degradar a `centra`.
        let ancla: CGFloat = compacto
            ? (y + accionY - pad) / 2
            : bounds.minY + BandaViva.centroSujeto
        let sujetoY = max(y, ancla - altoSujeto / 2)
        coloca(subviews[2], x: x, y: sujetoY, ancho: ancho, alto: altoSujeto)

        // Fila 4: los apoyos se quedan TODO lo que hay entre el sujeto y la
        // acción. Es el §6.1 literal: el sobrante entra en las filas, nunca en
        // una cola — ni al final ni, como pasaba aquí, en medio.
        let apoyosY = sujetoY + altoSujeto + pad
        let apoyosAlto = max(0, accionY - pad - apoyosY)
        coloca(subviews[3], x: x, y: apoyosY, ancho: ancho, alto: apoyosAlto)
    }

    private func coloca(_ v: LayoutSubview, x: CGFloat, y: CGFloat, ancho: CGFloat, alto: CGFloat) {
        v.place(at: CGPoint(x: x, y: y),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: ancho, height: alto))
    }
}

/// EL SUJETO, centrado en su banda.
///
/// Sin superficie: el número manda DIRECTO sobre el lienzo teñido. Si una
/// pantalla necesita superficie bajo el sujeto, la regla del §10.4 es que esa
/// superficie sea la DOMINANTE de la pantalla (`dominante`), no una caja que pese
/// lo mismo que las tarjetas de debajo — que es justo lo que convertía el «5» del
/// AMRAP en un ítem más de una lista.
struct BandaSujeto<Content: View>: View {
    var dominante: Bool = false
    @ViewBuilder var contenido: Content

    var body: some View {
        VStack(spacing: 6) {
            contenido
        }
        .frame(maxWidth: .infinity)
        .padding(dominante ? Theme.Spacing.l : 0)
        .background {
            if dominante {
                // Nace del lienzo y se levanta apenas: es la superficie que
                // manda, no una tarjeta más. La regla de acento arriba la corona.
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(Theme.Color.surface.opacity(0.62))
                    .overlay(alignment: .top) {
                        Rectangle().fill(Theme.Color.accent).frame(height: 2)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
            }
        }
    }
}

// MARK: - §10.6 · Lo que de verdad haces no va en gris

/// QUÉ ESTÁS HACIENDO — «Wall balls», «Back Squat», «Calorías».
///
/// Es un valor CATEGÓRICO, no una medida: gana a su etiqueta por peso y por un
/// escalón de la tipografía de TEXTO, y NO se monoespacia (§4). El mono es para
/// lo que se compara columna a columna, y un nombre no se compara con nada.
///
/// Vive aquí y no en cada vista para que el EMOM y la fuerza digan «qué estás
/// haciendo» con la misma letra — que es de lo que va el §10 entero.
struct NombreDelTrabajo: View {
    let texto: String

    var body: some View {
        Text(texto)
            .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
            .foregroundStyle(Theme.Color.foreground)
            .lineLimit(1).minimumScaleFactor(0.7)
    }
}

/// EL TRABAJO — lo segundo más importante de la pantalla.
///
/// Va en el numeral `segundo`, en la tinta normal y DENTRO de la banda, pegado al
/// sujeto que lo gobierna. No en un panel gris aparte y más pequeño que el reloj,
/// que es donde estaba.
struct TrabajoVista: View {
    let trabajo: Trabajo
    var tono: Color = Theme.Color.foreground

    var body: some View {
        VStack(spacing: 2) {
            NombreDelTrabajo(texto: trabajo.nombre)
            // El contador si alguien cuenta; si no, la DOSIS, que también se sabe.
            // Lo que no se finge es un cero cuando no hay ni lo uno ni lo otro:
            // entonces manda el nombre y ya (§7).
            if let segundo = trabajo.segundoPeldano {
                Numeral(texto: segundo,
                        escala: .segundo,
                        tono: trabajo.esContable ? tono : Theme.Color.foreground,
                        unidad: trabajo.unidad)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// LA DIFERENCIA CONTRA EL OBJETIVO, ya interpretada.
///
/// «1:54» obliga al atleta a acordarse de su objetivo y restar de cabeza a 170
/// ppm; «+2 s vs objetivo» ya está leído. Verde = vas mejor, y punto.
struct DeltaPastilla: View {
    let delta: Delta

    private var tono: Color {
        switch delta.juicio {
        case .igual: return Theme.Color.muted
        case .mejor: return Theme.Color.ok
        case .peor:  return Theme.Color.danger
        }
    }

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 6) {
            // Una cifra va en la voz de instrumento; «en el objetivo» NO es una
            // cifra y monoespaciarla la disfraza de medida (§4).
            if delta.esCifra {
                Text(delta.texto)
                    .font(Theme.Typography.readoutS)
                    .foregroundStyle(tono)
            } else {
                Text(delta.texto)
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Text(delta.sufijo)
                .scaledFont(11, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 5)
        .background(tono.opacity(0.16), in: Capsule())
        .animation(.linear(duration: 0.4), value: delta.juicio)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - §10.5 · La acción no pesa como el sujeto

/// LA ACCIÓN DEL LIVE. Un `SwiftUI.Button` — Apple tiene el tipo; no hay motor de HUD.
///
/// El CONTORNO es el estado normal (REANUDAR / TERMINAR TRAMO de la cinta). El
/// relleno naranja se gana SOLO cuando el toque es la única salida del tramo
/// (`unicaSalida`). Pintarlo naranja siempre es otra ticket (el acento de marca
/// no pinta la barra entera).
struct BotonVivo: View {
    let titulo: String
    /// El toque es lo ÚNICO que cierra el tramo: ahí, y solo ahí, manda el relleno.
    var unicaSalida: Bool = false
    /// Una línea bajo el rótulo, para lo que el botón sella.
    var nota: String?
    let accion: () -> Void

    var body: some View {
        Button(action: { Haptics.medium(); accion() }) {
            VStack(spacing: 3) {
                Text(titulo)
                    .scaledFont(17, weight: .heavy, relativeTo: .body, italic: true)
                    .tracking(1)
                    .textCase(.uppercase)
                if let nota {
                    Text(nota)
                        .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                        .uppercaseTracked(1.4)
                        .opacity(0.7)
                }
            }
            .lineLimit(1).minimumScaleFactor(0.7)
            .foregroundStyle(unicaSalida ? Theme.Color.accentOn : Theme.Color.foreground)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .frame(minHeight: 66)
            .background(unicaSalida ? Theme.Color.accent : Theme.Color.surface.opacity(0.7))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(unicaSalida ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(titulo)
    }
}

/// La ranura de acción de `MarcoVivo`: un `BotonVivo` a todo el ancho de la franja.
struct FranjaAccion: View {
    let titulo: String
    var unicaSalida: Bool = false
    var nota: String?
    let accion: () -> Void

    var body: some View {
        BotonVivo(titulo: titulo, unicaSalida: unicaSalida, nota: nota, accion: accion)
    }
}

/// El chip de pulso de la franja de contexto. Una pieza: EMOM, hierro y el host
/// del resto no pueden escribir tres chips que se contradigan.
struct ChipPulsoVivo: View {
    let session: WorkoutSession

    var body: some View {
        if let bpm = session.liveHRBpm {
            chip("\(bpm) \(Vocab.ppm)", tono: session.liveZone?.color ?? Theme.Color.foreground)
        } else {
            chip("Sin reloj", tono: Theme.Color.muted)
        }
    }

    private func chip(_ texto: String, tono: Color) -> some View {
        HStack(spacing: 4) {
            Image(systemName: "heart.fill").font(.system(size: 8, weight: .bold))
            Text(texto)
                .scaledFont(9, weight: .heavy, relativeTo: .caption2, italic: true)
                .uppercaseTracked(0.7)
                .lineLimit(1)
        }
        .foregroundStyle(tono)
        .padding(.horizontal, Theme.Spacing.s)
        .padding(.vertical, 4)
        .background(Theme.Color.surface.opacity(0.8), in: Capsule())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Apoyos — el tercer nivel, y el último

/// Una lectura de servicio.
///
/// El dato sigue pesando más que su etiqueta (§4), pero no compite con el sujeto:
/// tres o cuatro se reparten el ancho, y un cronómetro más grande se saldría de
/// su caja.
///
/// `ausente` es el §7 hecho pieza: cuando no hay medida NO se pinta un guion ni
/// una barra vacía — se pinta la RAZÓN de que no la haya, que es lo único
/// accionable.
struct ApoyoVivo: View {
    let etiqueta: String
    /// Nil = no hay medida. No se pinta el hueco: se pinta el porqué.
    let valor: String?
    var unidad: String?
    var tono: Color = Theme.Color.foreground
    /// Lo que se dice cuando el valor no existe («buscando señal»).
    var ausente: String?
    /// Marca de procedencia: «estimado», «declarado».
    var marca: String?
    /// La coletilla de la celda: la zona en que cayó ese pulso, la unidad cuando
    /// no cabe al lado de la cifra. Va en faint y debajo — es lo ÚLTIMO que se
    /// lee. Existe en el kit del doble (`Apoyo.pie`) desde el 29-jul y aquí
    /// faltaba, así que una celda que quería decir «157 · Z4» sólo podía decir una
    /// de las dos cosas.
    var pie: String?

    var body: some View {
        VStack(spacing: Theme.Spacing.xs) {
            LabelText(text: etiqueta, size: 10)
            if let valor {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(valor)
                        .font(Theme.Typography.readoutS)
                        .foregroundStyle(tono)
                        .lineLimit(1).minimumScaleFactor(0.6)
                        .animation(.linear(duration: 0.6), value: tono)
                    if let unidad {
                        Text(unidad)
                            .scaledFont(11, weight: .medium, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }
                if let marca {
                    Text(marca)
                        .scaledFont(9, weight: .semibold, relativeTo: .caption2)
                        .uppercaseTracked(0.9)
                        .foregroundStyle(Theme.Color.warning)
                }
            } else {
                Text(ausente ?? "sin medir")
                    .scaledFont(12, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
            }
            if let pie {
                Text(pie)
                    .scaledFont(10, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 6)
        .background(
            // Translúcida: el tinte de zona tiene que verse DEBAJO de los apoyos,
            // o el ambiente se corta en una línea recta a media pantalla.
            Theme.Color.surface.opacity(0.78),
            in: RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

/// La fila de apoyos: tres celdas a lo ancho, que es lo que cabe legible.
struct FilaApoyos<Content: View>: View {
    @ViewBuilder var contenido: Content

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            contenido
        }
    }
}
