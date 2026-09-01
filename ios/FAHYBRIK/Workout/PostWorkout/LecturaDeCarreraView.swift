import SwiftUI

// LA LECTURA DE UNA CARRERA — qué ve el atleta cuando abre una carrera terminada.
//
// Port del diseño firmado `web/components/design-twin/screens/lectura-carrera/`
// y de la entrada de `docs/DECISIONS.md` del 12-ago «Al terminar de correr manda
// el VEREDICTO, no el ritmo medio».
//
// LA VENTAJA QUE ESTA PANTALLA GASTA. Para un 6×800 a 3:30 la pregunta del atleta
// no es «¿cuál fue mi ritmo medio?», es «¿las hice?». Un reloj no puede
// contestarla porque no sabe qué le pidieron; una app sin coach detrás tampoco.
// Aquí están las dos mitades, así que el número grande es el veredicto.
//
// COMPOSICIÓN. Arquetipo Detalle, estrategia llena: el cromo, el contexto y el
// sujeto reproducen la banda de siempre —el sujeto cae en el mismo punto óptico
// que en las diez vistas en vivo— y por debajo la pantalla scrollea con lo que da
// sentido al número. La acción va anclada y no compite. El sobrante no existe:
// aquí sobra contenido, no espacio.
//
// EL REPARTO NO SE DECIDE AQUÍ. Quién gana el número grande lo decide
// `Lectura.deCorrer`, que está probado aparte y sin una vista dentro. Esta vista
// solo lee la lectura.

struct LecturaDeCarreraView: View {
    let carrera: Carrera
    /// Las zonas del atleta, para teñir el ambiente con el pulso medio. Sin ellas
    /// el lienzo se queda neutro: el color es dato y no se inventa.
    var zonas: HRZoneProfile?
    let onCerrar: () -> Void

    private var lectura: Lectura { Lectura.deCorrer(carrera) }
    private var zona: HRZone? {
        guard let ppm = carrera.fcMediaPpm else { return nil }
        return zonas?.zone(forBpm: Int(ppm.rounded()))
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            Ambiente(zona: zona)
            Cuerpo(carrera: carrera, lectura: lectura, onCerrar: onCerrar)
        }
    }

    // El cuerpo se separa para que la lectura se calcule UNA vez por pintado y no
    // una por cada rincón que la mira.
    private struct Cuerpo: View {
        let carrera: Carrera
        let lectura: Lectura
        let onCerrar: () -> Void

        var body: some View {
            VStack(spacing: BandaViva.hueco) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Portada(carrera: carrera, lectura: lectura)
                        archivo
                        repartoDeZonas
                        troceado
                        recorrido
                        ademas
                        loQueDijiste
                    }
                    .padding(.bottom, Theme.Spacing.l)
                }
                .scrollIndicators(.hidden)

                FranjaAccion(titulo: "Cerrar", accion: onCerrar)
                    .frame(height: BandaViva.accion)
            }
            .padding(BandaViva.hueco)
        }

        // MARK: - El archivo: la curva, o por qué no la hay

        @ViewBuilder
        private var archivo: some View {
            if let traza = carrera.traza {
                CurvaDeCarrera(
                    ritmo: traza.ritmo,
                    pulso: traza.pulso,
                    repeticiones: carrera.repeticiones,
                    lectura: lectura,
                    // Solo cuando el troceado ES por kilómetro, y solo los que
                    // tienen sitio conocido en el eje del tiempo.
                    kilometros: lectura.troceado == .kilometros
                        ? carrera.kilometros.filter { !$0.parcial }.compactMap(\.cruceS)
                        : [],
                    descripcion: "Ritmo y pulso de \(carrera.titulo) a lo largo de la sesión"
                )
            } else {
                SinArchivoDeCarrera(revision: carrera.momento == .revision)
            }
        }

        // MARK: - El reparto de zonas
        //
        // Solo cuando el sujeto ES la zona. En cualquier otra lectura sería una
        // barra más que nadie vino a buscar.

        @ViewBuilder
        private var repartoDeZonas: some View {
            if case .tiempoEnZona = lectura.sujeto,
               let cobertura = ZoneCoverage.read(zoneSeconds: carrera.zonasS,
                                                 windowSeconds: carrera.duracionS) {
                SeccionDeLectura(titulo: "Dónde estuvo tu pulso") {
                    VStack(alignment: .leading, spacing: 4) {
                        GeometryReader { geo in
                            HStack(spacing: 0) {
                                ForEach(cobertura.bands) { banda in
                                    Rectangle().fill(ZoneBandStyle.fill(banda))
                                        .frame(width: max(0, geo.size.width * CGFloat(banda.pct) / 100))
                                }
                            }
                        }
                        .frame(height: 16)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        HStack(spacing: 0) {
                            ForEach(cobertura.bands) { banda in
                                MonoText(text: "\(banda.label) \(banda.pct)%", size: 9,
                                         color: ZoneBandStyle.text(banda))
                                if banda.id != cobertura.bands.last?.id { Spacer(minLength: 4) }
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(ZoneBandStyle.spoken(cobertura))
                }
            }
        }

        // MARK: - El troceado: por repetición O por kilómetro, NUNCA los dos

        @ViewBuilder
        private var troceado: some View {
            switch lectura.troceado {
            case .repeticiones:
                SeccionDeLectura(titulo: "Tramo a tramo") {
                    TablaDeRepeticiones(repeticiones: carrera.repeticiones,
                                        lectura: lectura,
                                        certeza: carrera.certezaTramos)
                }
            case .kilometros where !carrera.kilometros.isEmpty:
                SeccionDeLectura(titulo: "Kilómetro a kilómetro") {
                    TablaDeKilometros(kilometros: carrera.kilometros)
                }
            case .kilometros, .ninguno:
                EmptyView()
            }
        }

        @ViewBuilder
        private var recorrido: some View {
            if carrera.ruta.count >= 2 {
                SeccionDeLectura(titulo: "El recorrido") {
                    MapaDeLaCarrera(ruta: carrera.ruta)
                }
            }
        }

        @ViewBuilder
        private var ademas: some View {
            let derivadas = DerivadaDeCarrera.todas(carrera)
            if !derivadas.isEmpty {
                SeccionDeLectura(titulo: "Además") {
                    FilaApoyos {
                        ForEach(derivadas, id: \.etiqueta) { d in
                            ApoyoVivo(etiqueta: d.etiqueta, valor: d.valor, pie: d.pie)
                        }
                    }
                }
            }
        }

        /// En una sesión que se abre del historial no hay nada que guardar: enseñar
        /// el formulario en blanco invitaría a rellenar algo que ya se contestó hace
        /// tres semanas. Se lee lo que se dijo, y si no se dijo nada no hay sección.
        @ViewBuilder
        private var loQueDijiste: some View {
            let piezas = [
                carrera.dicho?.rpe.map { "Esfuerzo \($0)" },
                carrera.dicho?.dificultad.flatMap(Self.dificultad),
            ].compactMap { $0 }
            if !piezas.isEmpty {
                SeccionDeLectura(titulo: "Lo que dijiste") {
                    Text(piezas.joined(separator: " · "))
                        .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
        }

        private static func dificultad(_ raw: String) -> String? {
            switch PerceivedDifficulty(rawValue: raw) {
            case .tooEasy: return "Se me hizo fácil"
            case .asExpected: return "Como esperaba"
            case .tooHard: return "Se me hizo duro"
            case nil: return nil
            }
        }
    }
}

// MARK: - La portada — cromo, contexto y sujeto, en la banda de siempre

private struct Portada: View {
    let carrera: Carrera
    let lectura: Lectura

    var body: some View {
        VStack(spacing: BandaViva.hueco) {
            cromo.frame(height: BandaViva.cromo)
            contexto.frame(height: BandaViva.contexto)
            BandaAnclada {
                BandaSujeto {
                    SujetoDeLaCarrera(carrera: carrera, lectura: lectura)
                }
            }
        }
    }

    /// El cromo se reparte a los lados y NUNCA por el centro: ahí vive la isla.
    private var cromo: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(carrera.titulo)
                .font(Theme.Typography.readoutLabel)
                .uppercaseTracked(1.32)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: Theme.Spacing.s)
            if !carrera.cuando.isEmpty {
                Text(carrera.cuando)
                    .font(Theme.Typography.readoutLabel)
                    .uppercaseTracked(1.32)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
        }
    }

    /// LOS TOTALES, DEGRADADOS A CONTEXTO — y ese es el movimiento entero: lo que
    /// el reloj llamaba «el resumen» es aquí la línea de arriba, la que sitúa. El
    /// sujeto está debajo y es otra cosa.
    private var contexto: some View {
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            ForEach(Array(piezas.enumerated()), id: \.offset) { i, pieza in
                if i > 0 {
                    Text("·")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.Color.faint)
                }
                MonoText(text: pieza, size: 19, weight: .bold, color: Theme.Color.muted,
                         escala: true, relativeTo: .body)
            }
            if carrera.superficie == .cinta { SelloDeCinta() }
        }
        .frame(maxWidth: .infinity)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    private var piezas: [String] {
        var salida: [String] = []
        // Cuando el sujeto ES la distancia, no se repite aquí.
        if case .kilometros = lectura.sujeto {} else if let d = Formato.distanciaCubierta(carrera.distanciaM) {
            salida.append(d)
        }
        salida.append(Formato.clock(carrera.duracionS))
        // Con el «+» delante se lee como lo que es —subida acumulada— y no como una
        // segunda distancia al lado de los kilómetros.
        if let desnivel = carrera.desnivelM, desnivel > 0 {
            salida.append("+\(Int(desnivel.rounded())) m")
        }
        return salida
    }
}

/// EL SUJETO CAE DONDE SIEMPRE — y la banda es un ANCLA, no una caja.
///
/// Reservar los 340 pt enteros de la banda clava el centro óptico en su sitio, sí,
/// pero deja un palmo de nada entre el número y la curva: la misma «cola» que el
/// arquetipo prohíbe, colocada en medio en vez de al final. Aquí abajo hay
/// contenido de sobra, así que lo correcto es anclar el CENTRO y dejar que lo de
/// debajo empiece justo donde acaba el bloque.
///
/// Se MIDE en vivo porque el sujeto no ocupa lo mismo en las seis lecturas: «5 de
/// 6» con dos líneas de apoyo y «44:15» con una no miden igual, y un número
/// escrito a mano se quedaría obsoleto a la primera línea de copy que cambie. Por
/// encima del bloque va media banda menos lo que el propio bloque sube, así que su
/// centro cae en los mismos 345 pt del lienzo que en las diez vistas en vivo.
private struct AltoDelSujeto: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

private struct BandaAnclada<Contenido: View>: View {
    @ViewBuilder var contenido: Contenido
    @State private var alto: CGFloat = 0

    var body: some View {
        contenido
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: AltoDelSujeto.self, value: geo.size.height)
                }
            )
            .onPreferenceChange(AltoDelSujeto.self) { medido in alto = medido }
            .padding(.top, max(0, BandaViva.sujeto / 2 - alto / 2))
    }
}

/// DE DÓNDE SALE LA DISTANCIA, y no es un detalle: un 5K en cinta no bate al de
/// calle. La correa mide su propio recorrido, así que la cifra de arriba no la ha
/// puesto el GPS y eso tiene que verse pegado a ella.
///
/// En sans y no en la mono del readout, a propósito: «en cinta» no es una cifra, y
/// monoespacearlo lo disfrazaría de medida. En calle NO hay sello: lo de siempre
/// no se anuncia.
private struct SelloDeCinta: View {
    var body: some View {
        Text("En cinta")
            .scaledFont(10, weight: .semibold, relativeTo: .caption2)
            .uppercaseTracked(1.2)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
            .alignmentGuide(.lastTextBaseline) { $0[.bottom] - 5 }
    }
}
