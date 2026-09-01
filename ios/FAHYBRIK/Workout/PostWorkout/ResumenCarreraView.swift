import SwiftUI

// AL TERMINAR DE CORRER — el resumen honesto de un entreno con contraste.
// Port del diseño aprobado `web/components/design-twin/screens/resumen-carrera/`.
//
// QUÉ FALLABA. El reloj de un atleta, después de un fartlek de 14,5 km, le
// enseñó cuatro líneas: TIEMPO 1:20:12 · DISTANCIA 14,32 KM · RITMO MEDIO
// 5:36/KM · CADENCIA. Está clarísimo y está mal: **un fartlek no tiene un ritmo,
// tiene dos.** «5:36/km» es la media de los fuertes y los suaves, un número que
// no describe ningún momento de esa carrera.
//
// Apple y Garmin promedian porque no saben qué formato estás haciendo. Nosotros
// sí: lo prescribió el coach. Esta pantalla es esa ventaja gastada.
//
// EL SUJETO — y no es el contraste, que era la hipótesis de partida. Un atleta no
// sale a buscar un contraste ni tiene un contraste objetivo: sale a correr ocho
// fuertes a un ritmo. Lo que pregunta al abrir esto es «¿a cuánto fui?». Así que
// el sujeto es **el ritmo de lo fuerte**, y lo suave va pegado, en el segundo
// peldaño del numeral: es lo que hace que 3:58 signifique algo (3:58 contra un
// trote de 5:12 es una sesión de series; contra 4:10 es un tempo disfrazado). El
// par se expresa por jerarquía, y la jerarquía es honesta.
//
// Pero el sujeto no es siempre el mismo, y ESA es la pieza de dominio:
//
//   **La media se gana el derecho a ser el sujeto sólo si la carrera fue UNA
//   SOLA COSA.**
//
// En un rodaje continuo la media describe cada minuto y es el sujeto legítimo. En
// un fartlek no describe nada. Y cuando no se puede decomponer, el sujeto degrada
// a lo que SÍ se midió —los kilómetros— y la media aparece con su etiqueta
// verdadera. El reparto NO se decide aquí: lo decide `FormaDeCarrera`, que está
// probado aparte. Esta vista sólo lee la forma.
//
// Se usa `MarcoVivo` a propósito y no un lienzo nuevo: el atleta viene de mirar
// el numeral en vivo a esa misma altura, y el resumen le recoge el número donde
// lo dejó (§10.3 del CONTRATO-UI).

struct ResumenCarreraView: View {
    let session: WorkoutSession
    /// Seguir al registro: RPE, notas y el guardado viven en la pantalla de
    /// después. Aquí sólo se lee la carrera.
    let onContinuar: () -> Void

    /// La carrera que hay dentro de la sesión. Si es nil este resumen no se
    /// presenta siquiera — el anfitrión ya lo comprueba antes de enrutar.
    private var carrera: FormaDeCarrera.Carrera? {
        CarreraDeLaSesion.carrera(laps: session.laps, segmentos: session.plan.segments)
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            if let carrera {
                Cuerpo(session: session,
                       carrera: carrera,
                       lectura: FormaDeCarrera.lectura(de: carrera),
                       onContinuar: onContinuar)
            }
        }
    }

    // El cuerpo se separa para que la lectura se calcule UNA vez por pintado y no
    // una por cada rincón que la mira.
    private struct Cuerpo: View {
        let session: WorkoutSession
        let carrera: FormaDeCarrera.Carrera
        let lectura: FormaDeCarrera.Lectura
        let onContinuar: () -> Void

        /// Las dos FC de la carrera, con la misma regla que el resumen genérico
        /// (`ResumenSesionCard`): una sola forma de agregar el pulso de unos laps.
        private var totales: ResumenSesionCard.Totales {
            ResumenSesionCard.totales(
                from: session.laps.filter { $0.modality == SegmentKind.running.modality },
                elapsed: 0
            )
        }

        private var zona: HRZone? {
            guard let ppm = totales.avgHR else { return nil }
            return session.hrZones?.zone(forBpm: ppm)
        }

        /// El pulso baja a los apoyos sólo cuando no hay peine que ocupe la fila.
        private var fcEnApoyos: Bool {
            !lectura.tramosSonLectura && totales.avgHR != nil && totales.maxHR != nil
        }

        var body: some View {
            ZStack {
                Ambiente(zona: zona)
                MarcoVivo {
                    cromo
                } contexto: {
                    contexto
                } sujeto: {
                    BandaSujeto { sujeto }
                } apoyos: {
                    apoyos
                } accion: {
                    FranjaAccion(titulo: "Guardar el entreno",
                                 unicaSalida: true,
                                 nota: prescrito,
                                 accion: onContinuar)
                }
            }
        }

        // MARK: - Cromo

        /// El cromo se reparte a los lados y NUNCA por el centro: ahí vive la isla
        /// dinámica. Centrado, «Fartlek 14 km · sensaciones» sale partido en dos
        /// por el recorte del teléfono.
        private var cromo: some View {
            HStack(spacing: Theme.Spacing.s) {
                Text(session.plan.name)
                    .font(Theme.Typography.readoutLabel)
                    .uppercaseTracked(1.32)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: Theme.Spacing.s)
                Text("Hoy")
                    .font(Theme.Typography.readoutLabel)
                    .uppercaseTracked(1.32)
                    .foregroundStyle(Theme.Color.muted)
            }
        }

        // MARK: - Contexto

        /// LOS TOTALES, DEGRADADOS A CONTEXTO. Y ese es el movimiento entero: lo
        /// que el reloj llamaba «el resumen» —tiempo, distancia, media— es aquí la
        /// línea de arriba, la que sitúa. El sujeto está debajo y es otra cosa.
        private var contexto: some View {
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                ForEach(Array(piezasDeContexto.enumerated()), id: \.offset) { i, pieza in
                    if i > 0 {
                        Text("·")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.Color.faint)
                    }
                    MonoText(text: pieza, size: 19, weight: .bold, color: Theme.Color.muted,
                             escala: true, relativeTo: .body)
                }
            }
            .frame(maxWidth: .infinity)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }

        private var piezasDeContexto: [String] {
            [
                // La distancia sube al sujeto cuando no hay nada mejor que enseñar;
                // ahí no se repite aquí. Y el pulso sólo aparece si no lo está
                // diciendo ya la fila de apoyos: el mismo número dos veces en la
                // misma pantalla es ruido.
                lectura.forma == .noSeSabe ? nil : Formato.distanciaCubierta(carrera.distanciaM),
                Formato.clock(carrera.duracionS),
                !fcEnApoyos ? totales.avgHR.map { "\($0) \(Vocab.ppm)" } : nil,
            ].compactMap { $0 }
        }

        // MARK: - El sujeto, uno por forma

        @ViewBuilder
        private var sujeto: some View {
            switch lectura.forma {
            case .conContraste where lectura.fuerte != nil: parDeRitmos
            case .uniforme:                                 mediaHonesta
            default:                                       loQueSiSeMidio
            }
        }

        /// Fueron dos ritmos: el fuerte manda y el suave va pegado, un peldaño
        /// abajo.
        @ViewBuilder
        private var parDeRitmos: some View {
            if let fuerte = lectura.fuerte {
                EtiquetaSujeto(texto: "\(fuerte.n) \(fuerte.n == 1 ? "fuerte" : "fuertes")")
                Numeral(texto: Formato.clock(fuerte.ritmoSkm), unidad: Formato.UnidadRitmo.porKm.rawValue)
                if let suave = lectura.suave, let contraste = lectura.contrasteSkm {
                    VStack(spacing: Theme.Spacing.xs) {
                        Numeral(texto: Formato.clock(suave.ritmoSkm),
                                escala: .segundo,
                                tono: Theme.Color.muted,
                                unidad: Formato.UnidadRitmo.porKm.rawValue)
                        Text("suave · contraste \(Formato.clock(contraste))")
                            .scaledFont(12, weight: .semibold, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    .padding(.top, 10)
                } else {
                    // El motor graba el trabajo y —hasta el 29-jul— tiraba la
                    // recuperación: hubo contraste, pero no hay contra qué. Se
                    // dice; no se rellena con la media.
                    Text("No se guardó lo suave: no hay contra qué comparar")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, Theme.Spacing.m)
                }
            }
        }

        /// Fue una sola cosa, y entonces la media es el sujeto de pleno derecho. Se
        /// dice POR QUÉ lo es: sin esa frase el atleta no puede distinguir esta
        /// media de la que le enseña el reloj, que es justo la que no vale.
        @ViewBuilder
        private var mediaHonesta: some View {
            let vueltas = lectura.tramos.filter { $0.ritmoSkm != nil }.count
            EtiquetaSujeto(texto: vueltas > 1 ? "\(vueltas) vueltas" : "Ritmo medio")
            if let media = lectura.mediaSkm {
                Numeral(texto: Formato.clock(media), unidad: Formato.UnidadRitmo.porKm.rawValue)
            }
            Text(vueltas > 1
                 ? "Todas las vueltas fueron al mismo esfuerzo: esta media sí las describe"
                 : "Corriste a una sola intensidad: esta media describe cada kilómetro")
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)
                .padding(.top, Theme.Spacing.m)
        }

        /// EL PEOR CASO, Y EL ÚNICO QUE HOY SE PUEDE ALIMENTAR CON PRODUCCIÓN.
        ///
        /// No se puede separar la carrera, así que el sujeto degrada a lo que SÍ se
        /// midió: los kilómetros, que son reales y son el logro. Y la media
        /// aparece —porque esconderla sería tan deshonesto como disfrazarla— con la
        /// etiqueta que le corresponde. Apple escribe «RITMO MEDIO 5:36/KM».
        /// Nosotros escribimos el mismo número y le pegamos la verdad al lado: no
        /// es el ritmo de ningún tramo.
        @ViewBuilder
        private var loQueSiSeMidio: some View {
            EtiquetaSujeto(texto: "Recorriste")
            Numeral(texto: Formato.esDecimal(carrera.distanciaM / 1000,
                                             decimals: 2,
                                             siempreDecimales: true),
                    unidad: "km")
            if let media = lectura.mediaSkm {
                VStack(spacing: Theme.Spacing.xs) {
                    Numeral(texto: Formato.clock(media),
                            escala: .segundo,
                            tono: Theme.Color.muted,
                            unidad: Formato.UnidadRitmo.porKm.rawValue)
                    Text(lectura.mediaEsMezcla
                         ? "Media de los fuertes y los suaves — no es el ritmo de ningún tramo"
                         : "Ritmo medio de toda la sesión")
                        .scaledFont(12, weight: .semibold, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 290)
                }
                .padding(.top, Theme.Spacing.m)
            }
        }

        // MARK: - Los apoyos
        //
        // El hueco del arquetipo Detalle se gana con lo que da sentido al dato —el
        // peine, el contraste, el aguante, de dónde sale—, nunca con aire.

        private var apoyos: some View {
            VStack(spacing: Theme.Spacing.s) {
                Spacer(minLength: 0)
                // El peine sólo se pinta si los tramos SON una lectura. Un rodaje
                // continuo también se trocea por dentro —hace falta para concluir
                // que no hay frontera—, pero dibujar esos trozos enseñaría una
                // estructura que el atleta no corrió, y encima con la línea de la
                // media flotando sobre una sola barra. Lo mismo con la nota de
                // certeza: no se califica un tramo que no se está enseñando.
                if lectura.tramosSonLectura {
                    PeineDeTramos(tramos: lectura.tramos, mediaSkm: lectura.mediaSkm)
                }

                // El §10.3 manda que el sobrante lo cojan PRIMERO los apoyos.
                // Cuando hay peine, el sobrante ya está cogido; cuando no —el peor
                // caso, que es justo el que más aire deja— lo llena el pulso, y lo
                // llena con dato medido de verdad.
                if fcEnApoyos, let media = totales.avgHR, let maxima = totales.maxHR {
                    FilaApoyos {
                        ApoyoVivo(etiqueta: Vocab.fcMedia,
                                  valor: "\(media)",
                                  tono: zona?.color ?? Theme.Color.foreground,
                                  pie: zona?.label)
                        ApoyoVivo(etiqueta: Vocab.fcMax, valor: "\(maxima)", pie: Vocab.ppm)
                    }
                }

                if let aguante = lectura.aguante {
                    AguanteDeLaCarrera(aguante: aguante)
                } else if lectura.forma == .noSeSabe {
                    SinTramosQueSeparar(prescrito: carrera.formaPrescrita == .conContraste)
                }

                if lectura.tramosSonLectura, let certeza = lectura.certeza {
                    NotaDeCerteza(certeza: certeza)
                }
            }
        }

        // MARK: - Lo que prescribió el coach

        /// La línea de gimnasio que el botón sella. Sale del ÚNICO redactor de
        /// prescripciones que tiene la app; sin prescripción escrita se queda el
        /// título del bloque, y sin ninguna de las dos no se pinta nada — una nota
        /// inventada bajo el botón sería peor que ninguna.
        private var prescrito: String? {
            guard let bloque = session.plan.segments.first(where: { $0.kind == .running }) else { return nil }
            guard let rx = bloque.prescription else { return bloque.title.isEmpty ? nil : bloque.title }
            let linea = PrescriptionRenderer.summaryLine(rx)
            let piezas = [linea.headline, linea.pace].compactMap { $0 }
            if piezas.isEmpty { return bloque.title.isEmpty ? nil : bloque.title }
            return piezas.joined(separator: " · ")
        }
    }
}
