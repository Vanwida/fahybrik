import Foundation

// EL REPARTO: quién gana el número grande, y sobre qué eje se dibuja.
//
// Port fiel de `modelo.ts` (`lecturaDeCorrer`) y de `curva.tsx` (`dominioDelRitmo`)
// del doble, más la jerarquía escrita en `docs/DECISIONS.md` del 12-ago.
//
// Vive aparte de los tipos porque es la parte que se PRUEBA: son funciones puras
// sobre una `Carrera`, sin una sola vista dentro, así que la precedencia entera se
// verifica sin montar pantalla. Un error aquí no se ve mirando la app — se ve cuando
// un atleta lee el número equivocado de su propia sesión.

extension Lectura {

    /// QUIÉN GANA EL NÚMERO GRANDE.
    ///
    /// La precedencia no es una lista de casos: es **el orden en que la carrera pierde
    /// información**. Mientras haya intención medible y tramos que medir, el sujeto es
    /// si la clavó; cuando falta la intención queda el contraste; cuando falta la
    /// estructura queda la media; cuando falta el archivo quedan los kilómetros, y se
    /// dice por qué.
    ///
    ///   1. Hubo objetivo medible → el veredicto.
    ///   2. Hubo contraste sin objetivo (fartlek por sensaciones) → fuerte contra suave.
    ///   3. Uniforme con objetivo de zona → el tiempo dentro de esa zona.
    ///   4. Uniforme sin objetivo → el ritmo medio.
    ///   5. Sin cobertura → los totales, declarando por qué no hay más.
    static func deCorrer(_ c: Carrera) -> Lectura {
        let trabajo = c.repeticiones.filter { $0.papel == .trabajo }
        let banda = bandaDe(c.objetivo)

        // La recuperación se juzga con el MISMO motor que el trabajo — el del
        // servidor. Una recuperación PARADA no tiene ritmo que comparar, y el
        // servidor ya lo dice mandando `sin_dato`.
        let recuperaciones = c.repeticiones.filter { $0.papel == .recuperacion }
        let bandaRec: (rapidoSkm: Double, lentoSkm: Double)? = {
            if case .ritmo(let rapido, let lento) = c.objetivoRecuperacion {
                return (rapido, lento)
            }
            return nil
        }()
        let juzgaRecuperacion = c.objetivoRecuperacion != nil
        let veredictosRec: [RecoveryComplianceVerdict] =
            juzgaRecuperacion ? recuperaciones.map { $0.veredictoRecuperacion ?? .sinDato } : []
        let duracionesRec: [RecoveryDurationVerdict] =
            juzgaRecuperacion ? recuperaciones.map { $0.veredictoDuracionRecuperacion ?? .sinDato } : []
        // EL TROCEADO DICE CUÁL CORRESPONDE, no si hay datos para pintarlo. Se
        // intentó colapsarlo a `.ninguno` cuando la lista de kilómetros venía vacía
        // y está MAL: un rodaje sin archivo se trocea por kilómetro igual —lo que
        // pasa es que no hay cortes que enseñar todavía—, y confundir las dos
        // preguntas deja al campo respondiendo dos cosas a la vez. Quien pinta ya
        // comprueba que la lista tenga algo.

        // ── Ni archivo ni tramos: solo quedan los totales, y se dice por qué ─────
        //
        // **LA TRAZA NO MANDA SOBRE LOS TRAMOS** (DECISIONS, 12-ago). El archivo
        // sirve la curva y los kilómetros; los tramos y sus veredictos salen de
        // `segment_executions` y existen desde MUCHO ANTES de que existiera el
        // archivo. Colgar la lectura entera de `traza != nil` hacía que toda sesión
        // ya guardada escondiera su mitad buena y enseñara «sin archivo» teniendo
        // seis series medidas y juzgadas — que es exactamente el error que la
        // entrada de DECISIONS deja anotado, cometido aquí una segunda vez al
        // portarlo desde la app en vivo (donde sí era cierto: si el móvil no
        // archivó, en el móvil no hay nada). **La suposición que sostiene una regla
        // no viaja con la regla cuando se porta a otra superficie**, y esta lectura
        // ya no se alimenta del móvil sino del servidor.
        //
        // Así que la degradación es solo cuando de verdad no queda nada que leer.
        // La CONSECUENCIA de no tener archivo —ni curva, ni kilómetros, ni mapa— la
        // sigue diciendo la pantalla en su sitio, con o sin tramos.
        guard c.traza != nil || !c.repeticiones.isEmpty else {
            let porque = c.momento == .revision
                ? "Esta carrera es anterior al archivo: se guardó el total, no el minuto a minuto."
                : "No se archivó la señal de esta carrera: se guardó el total, no el minuto a minuto."
            return Lectura(
                sujeto: .kilometros(km: c.distanciaM / 1000, porque: porque),
                troceado: .ninguno,
                eje: .ritmo,
                banda: nil,
                veredictos: [],
                veredictosDuracion: [],
                veredictosRecuperacion: [],
                veredictosDuracionRecuperacion: [],
                bandaRecuperacion: nil
            )
        }

        // ── Con repeticiones ─────────────────────────────────────────────────────
        if trabajo.count >= ReglasDeLectura.minRepeticionesParaVeredicto {
            // EL CORRECTOR, y no es un caso especial: en cuesta el ritmo no es
            // comparable, así que el eje del troceado pasa a ser el TIEMPO y el
            // veredicto de ritmo SE RETIRA en vez de emitirse mal. Se retira también
            // el del paseo de bajada, por lo mismo.
            //
            // TRES RAMAS, Y EN ESTE ORDEN (firmado 12-ago, corrigiendo una versión
            // anterior — ver abajo, porque la anterior suena mejor de lo que era):
            //
            //  1. **La PRESCRIPCIÓN declara cuesta** → se retira. Es lo que pidió el
            //     coach, y no depende de que hayamos medido nada: una sesión de
            //     cuestas se sabe que lo es en cuanto se escribe. La intención TAMBIÉN
            //     es dato, y es el que llega antes.
            //  2. **La pendiente MEDIDA se sabe y pasa el umbral** → se retira igual.
            //     Cubre la ruta con cuestas que nadie declaró.
            //  3. **No se sabe y nadie declaró cuesta** → **el veredicto SE MANTIENE.**
            //
            // POR QUÉ LA 3 NO RETIRA, que es lo contraintuitivo y por eso va escrito:
            // suena más prudente tratar «no se sabe» como cuesta —el resto del sistema
            // hace justo eso: sin banda no hay veredicto, sin cobertura no hay juicio—
            // y aun así aquí es peor. La pendiente se escribe al llegar la traza, y las
            // trazas empezaron el 11-ago: **ninguna sesión anterior la tiene.** Si el
            // nulo retirara, le quitaríamos el veredicto a TODO el histórico para
            // proteger las de cuestas, que son una minoría — y las de cuestas ya están
            // cubiertas por la rama 1, que no necesita medir. El coste del falso
            // positivo se lo comerían todas las demás sesiones.
            //
            // Si alguien lee esto dentro de seis meses y piensa «nulo no es cero, esto
            // está mal»: tiene razón en la premisa y no en la conclusión. El nulo NO se
            // está leyendo como llano medido — se está leyendo como «nadie ha dicho que
            // esto sea una cuesta», que es una afirmación distinta y que la rama 1 ya
            // comprueba de verdad.
            // EL UMBRAL ES DEL COACH Y LLEGA CON LA SESIÓN (Regla Nº0). Lo que sigue
            // siendo nuestro es todo lo demás: comparar, retirar el veredicto de
            // ritmo, cambiar el eje a tiempo y elegir el sujeto. El coach pone el
            // número; qué se dibuja con él es mecanismo.
            let umbral = c.metodo.pendienteQueRetiraElRitmoPct
            let declaradaCuesta = trabajo.contains {
                ($0.pendientePrescritaPct ?? 0) >= umbral
            }
            // Media sobre lo que SE MIDIÓ, no sobre todos contando el nulo como cero:
            // con cinco llanos medidos y un hueco, la media de la sesión es la de los
            // cinco. Nula del todo = no se midió nada, y entonces sólo manda la rama 1.
            let medidas = trabajo.compactMap(\.pendientePct)
            let pendienteMedida = medidas.isEmpty
                ? nil : medidas.reduce(0, +) / Double(medidas.count)

            if declaradaCuesta || (pendienteMedida ?? 0) >= umbral {
                // Qué pendiente se enseña: la MEDIDA manda porque es lo que pasó; si no
                // se midió, la declarada, que es lo que se pidió. Nunca un cero de
                // relleno bajo un titular que dice «en cuesta».
                let prescritas = trabajo.compactMap(\.pendientePrescritaPct)
                let pendiente = pendienteMedida
                    ?? (prescritas.isEmpty ? 0 : prescritas.reduce(0, +) / Double(prescritas.count))
                let tiempos = trabajo.map(\.duracionS)
                return Lectura(
                    sujeto: .tiempoPorRepeticion(
                        nRepeticiones: trabajo.count,
                        mediaS: tiempos.reduce(0, +) / Double(tiempos.count),
                        primeraS: tiempos.first ?? 0,
                        ultimaS: tiempos.last ?? 0,
                        pendientePct: pendiente
                    ),
                    troceado: .repeticiones,
                    eje: .tiempo,
                    banda: nil,
                    veredictos: [],
                    veredictosDuracion: [],
                    veredictosRecuperacion: [],
                    veredictosDuracionRecuperacion: [],
                    bandaRecuperacion: nil
                )
            }

            // Hubo objetivo medible: el sujeto es si las hizo.
            if let banda {
                let veredictos = trabajo.map { $0.veredicto ?? .sinDato }
                let evaluables = veredictos.filter { $0 != .sinDato }.count
                if evaluables > 0 {
                    return Lectura(
                        sujeto: .veredicto(
                            dentro: veredictos.filter { $0 == .dentro }.count,
                            evaluables: evaluables,
                            sesgo: sesgoDe(veredictos),
                            peorDesvioS: peorDesvio(trabajo, c.objetivo),
                            mediaTrabajoSkm: mediaSkm(trabajo) ?? mediaDeLaSesion(c)
                        ),
                        troceado: .repeticiones,
                        eje: .ritmo,
                        banda: banda,
                        veredictos: veredictos,
                        veredictosDuracion: trabajo.map { $0.veredictoDuracion ?? .sinDato },
                        veredictosRecuperacion: veredictosRec,
                        veredictosDuracionRecuperacion: duracionesRec,
                        bandaRecuperacion: bandaRec
                    )
                }
            }

            // Hubo contraste sin objetivo: manda el contraste.
            let fuerteSkm = mediaSkm(trabajo)
            let suaveSkm = mediaSkm(recuperaciones)
            if let fuerteSkm {
                return Lectura(
                    sujeto: .contraste(
                        nFuertes: trabajo.count,
                        fuerteSkm: fuerteSkm,
                        suaveSkm: suaveSkm,
                        contrasteSkm: suaveSkm.map { $0 - fuerteSkm },
                        recuperacion: recuperaciones.first?.modo
                    ),
                    troceado: .repeticiones,
                    eje: .ritmo,
                    banda: nil,
                    veredictos: [],
                    veredictosDuracion: [],
                    veredictosRecuperacion: veredictosRec,
                    veredictosDuracionRecuperacion: duracionesRec,
                    bandaRecuperacion: bandaRec
                )
            }
        }

        // ── Trabajo continuo ─────────────────────────────────────────────────────
        // Objetivo de zona: el sujeto es el tiempo dentro de ella, medido por el
        // PULSO — que es la señal que la traza trae en cada muestra.
        if case .zona(let zona, _, _) = c.objetivo {
            let enZona = c.zonasS[zona] ?? 0
            if enZona > 0 {
                return Lectura(
                    sujeto: .tiempoEnZona(
                        zona: zona,
                        segundos: enZona,
                        pct: Int((enZona / c.duracionS * 100).rounded())
                    ),
                    troceado: .kilometros,
                    eje: .ritmo,
                    banda: banda,
                    veredictos: [],
                    veredictosDuracion: [],
                    veredictosRecuperacion: veredictosRec,
                    veredictosDuracionRecuperacion: duracionesRec,
                    bandaRecuperacion: bandaRec
                )
            }
        }

        // Uniforme: la media se gana el sujeto, y si había banda la lleva de apoyo.
        // Ponderada por los tramos cuando los hay; geométrica cuando la carrera es una
        // sola pieza, que es exactamente el caso en el que la media SÍ la describe.
        //
        // El veredicto de la media también llega SERVIDO: con un solo tramo de trabajo
        // el servidor ya lo juzgó, y aquí sólo se lee. Sin tramo que lo traiga, no hay
        // veredicto que enseñar — antes eso que juzgarlo nosotros.
        let media = mediaSkm(c.repeticiones) ?? mediaDeLaSesion(c)
        let veredictoDeLaMedia: RunComplianceVerdict? = {
            guard case .ritmo = c.objetivo else { return nil }
            return trabajo.count == 1 ? trabajo[0].veredicto : nil
        }()
        return Lectura(
            sujeto: .ritmoMedio(skm: media, veredicto: veredictoDeLaMedia),
            troceado: .kilometros,
            eje: .ritmo,
            banda: banda,
            veredictos: [],
            veredictosDuracion: [],
            veredictosRecuperacion: veredictosRec,
            veredictosDuracionRecuperacion: duracionesRec,
            bandaRecuperacion: bandaRec
        )
    }

    // MARK: - Las piezas del reparto

    private static func bandaDe(_ o: Objetivo) -> Banda? {
        switch o {
        case .ritmo(let rapido, let lento): return .ritmo(rapidoSkm: rapido, lentoSkm: lento)
        case .zona(let z, let min, let max): return .pulso(minPpm: min, maxPpm: max, zona: z)
        case .ninguno, .sensacion: return nil
        }
    }

    /// Media ponderada por duración: cuatro tramos de 3′ y uno de 30″ no pesan igual.
    static func mediaSkm(_ reps: [Repeticion]) -> Double? {
        let con = reps.filter { $0.ritmoSkm != nil }
        guard !con.isEmpty else { return nil }
        let t = con.reduce(0.0) { $0 + $1.duracionS }
        guard t > 0 else { return nil }
        return con.reduce(0.0) { $0 + $1.ritmoSkm! * $1.duracionS } / t
    }

    /// El desvío de la peor repetición contra el borde de banda que rompió, en s.
    static func peorDesvio(_ reps: [Repeticion], _ o: Objetivo) -> Double? {
        guard case .ritmo(let rapido, let lento) = o else { return nil }
        var peor: Double?
        for r in reps {
            guard let skm = r.ritmoSkm else { continue }
            let fuera = skm > lento ? skm - lento : (skm < rapido ? rapido - skm : 0)
            if fuera > (peor ?? 0) { peor = fuera }
        }
        return peor
    }

    static func sesgoDe(_ vs: [RunComplianceVerdict]) -> Sesgo? {
        let lentos = vs.filter { $0 == .fueraLento }.count
        let rapidos = vs.filter { $0 == .fueraRapido }.count
        if lentos == 0 && rapidos == 0 { return nil }
        if lentos > 0 && rapidos > 0 { return .mixto }
        return lentos > 0 ? .lento : .rapido
    }

    /// La media geométrica de la sesión entera: distancia contra tiempo.
    static func mediaDeLaSesion(_ c: Carrera) -> Double {
        guard c.distanciaM > 0 else { return 0 }
        return c.duracionS / (c.distanciaM / 1000)
    }
}

// MARK: - El eje de la curva

enum EjeDelRitmo {

    /// EL EJE LO FIJA LO QUE SE CORRIÓ. **Andar y parar no es correr.**
    ///
    /// Bajar andando de una cuesta son 11:40/km. Metido en el eje junto a unas subidas
    /// de 4:30 aplasta las ocho repeticiones contra el borde de arriba, y la curva deja
    /// de leerse justo donde el sujeto es cuánto se cayó de la primera a la última. Una
    /// curva que no se puede leer no cumple su función, que es hacer VISIBLE el
    /// veredicto en vez de afirmarlo.
    ///
    /// **ESTA REGLA SE AFINÓ TRES VECES Y LAS DOS PRIMERAS SUENAN RAZONABLES, así que
    /// alguien las reintroducirá. Quedan anotadas como ERRÓNEAS:**
    ///
    ///  1. «El eje se escala al rango del TRABAJO» — mal: en una serie el calentamiento
    ///     va mucho más lento que las repeticiones, así que ceñirlo al trabajo convierte
    ///     «seis picos que nacen de un rodaje» en «seis mesetas flotando». Rompía las
    ///     gráficas buenas para arreglar la mala.
    ///  2. «El trabajo y lo CONTINUO; la recuperación entra solo si cabe» — mejor, pero
    ///     apuntaba al PAPEL del tramo, que era una correlación y no la causa. Medido:
    ///     el escenario estrella se salvaba **por dos segundos** y el de cinta ya salía
    ///     roto. Cualquier atleta que trote un poco más suave lo tiraba fuera.
    ///  3. LA BUENA: el criterio es la LOCOMOCIÓN. Un trote a 6:10 entre series a 3:30
    ///     es correr, entra en el eje, y de hecho suele ser LA explicación de que la
    ///     quinta se caiga. Andar es otra forma de moverse; parar ya era un hueco.
    ///
    /// Sale de `modo`, que ya está en el modelo: **no hay ningún umbral que ajustar
    /// nunca.** Lo que se queda fuera no se recorta en silencio — se dibuja a puntos,
    /// pegado al suelo, y la leyenda lo dice.
    static func dominio(
        ritmo: [Muestra],
        repeticiones: [Repeticion],
        banda: Banda?
    ) -> (min: Double, max: Double) {
        let fuera = ventanasQueNoSonCorrer(repeticiones)
        let corrido = ritmo.filter { m in
            !fuera.contains { m.t >= $0.desde && m.t < $0.hasta }
        }
        // EL SUELO: si no se corrió NADA —una caminata, una vuelta a la calma andada
        // entera— andar deja de ser la excepción porque es lo único que hay, y manda.
        // Sin esto el eje se queda sin nada que lo fije y la curva sale degenerada.
        let mandan = corrido.count > 1 ? corrido : ritmo
        var extra: [Double] = []
        // Un borde de banda ausente llega escrito como el infinito que significa
        // («no más lento de 3:20» no tiene suelo). Ese borde no puede entrar en el
        // eje: estiraría la escala hasta el infinito literal y la curva se
        // aplastaría contra el suelo. El que SÍ existe sigue entrando, que es lo
        // que garantiza que la franja quepa en el dibujo.
        if case .ritmo(let rapido, let lento) = banda {
            extra = [rapido, lento].filter(\.isFinite)
        }
        return extremos(mandan.map(\.v), extra)
    }

    /// Las ventanas en las que el atleta NO estaba corriendo: recuperación andando o
    /// parada. Es la regla de arriba hecha número, y por eso vive suelta: así se
    /// prueba sin montar un componente y no puede volver a afinarse por accidente.
    static func ventanasQueNoSonCorrer(
        _ repeticiones: [Repeticion]
    ) -> [(desde: Double, hasta: Double)] {
        repeticiones
            .filter { $0.papel == .recuperacion && ($0.modo == .andando || $0.modo == .parado) }
            .map { (desde: $0.inicioS, hasta: $0.inicioS + $0.duracionS) }
    }

    /// Los extremos del eje, con su margen. Un rango degenerado (todo el mismo valor)
    /// recibe margen 1 para no colapsar la curva en una línea sin altura.
    static func extremos(_ valores: [Double], _ extra: [Double]) -> (min: Double, max: Double) {
        let todos = valores + extra
        guard let lo = todos.min(), let hi = todos.max() else { return (0, 1) }
        let rango = (hi - lo) * ReglasDeLectura.margenDelEje
        let margen = rango > 0 ? rango : 1
        return (lo - margen, hi + margen)
    }
}
