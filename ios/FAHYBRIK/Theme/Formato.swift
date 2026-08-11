import Foundation

// LA GRAFÍA — cómo se escribe cada número y cada unidad que ve el atleta.
//
// Existe porque el 28-jul nueve agentes en paralelo resolvieron lo mismo cada uno a
// su manera: el VO₂máx salió «42,4» en una pantalla y «42.4» en la de al lado, el
// pulso acabó con tres nombres y dos unidades, el ritmo con tres grafías y la
// duración con catorce implementaciones. Ninguna era irrazonable por separado.
//
// REGLA (docs/CONTRATO-UI.md §2): un formateador por concepto. Si necesitas una
// variante — ancho fijo, más decimales, otra unidad — se pide POR PARÁMETRO, nunca
// escribiendo una segunda función. La segunda función es como nació el problema.
//
// Foundation puro a propósito: este fichero compila también en el reloj (lista
// explícita del target en ios/project.yml), así que muñeca y teléfono no pueden
// escribir el mismo dato de dos maneras.

enum Formato {

    // MARK: - Decimales — coma española

    /// «42,4» · «5» — coma decimal, y sin decimal cuando el número es redondo.
    /// `String(format:"%.1f")` queda PROHIBIDO en texto de cara al atleta: escribe
    /// punto y delata que el número no pasó por aquí.
    ///
    /// - `siempreDecimales`: mantiene el decimal aunque el número sea redondo
    ///   («12,0»). Solo para lecturas que CAMBIAN en vivo y en pasos de 0,1 — la
    ///   velocidad de la cinta —, donde perder la cifra hace saltar el ancho.
    static func esDecimal(_ value: Double,
                          decimals: Int = 1,
                          siempreDecimales: Bool = false) -> String {
        if !siempreDecimales, value.rounded() == value { return String(Int(value.rounded())) }
        return String(format: "%.\(decimals)f", value)
            .replacingOccurrences(of: ".", with: ",")
    }

    /// La misma coma sobre un número que el servidor ya formateó («42.4» → «42,4»).
    /// No reformatea: respeta los decimales que mandó el servidor.
    static func esDecimal(_ text: String) -> String {
        text.replacingOccurrences(of: ".", with: ",")
    }

    // MARK: - Duración

    /// Qué hacer por debajo del minuto: `0:45` (reloj) o `45s` (descansos y topes,
    /// donde «45s» se lee de un vistazo y «0:45» hace pensar).
    enum SubMinuto { case reloj, segundos }

    /// «5:00» · «1:02:10» — la ÚNICA duración de la app.
    ///
    /// - `anchoFijo`: mete el cero delante («05:00»). Se usa SOLO en cronómetro en
    ///   vivo, para que el layout no baile al pasar de 9:59 a 10:00. Fuera del
    ///   cronómetro el cero delante es ruido, y era la otra mitad de «5:00 vs 05:00».
    /// - `subMinuto`: ver `SubMinuto`.
    /// - `enHoras`: a false el reloj NO pasa a horas y sigue contando minutos
    ///   («63:45», no «1:03:45»). Es lo que pide el marcador de carrera, donde todo
    ///   el marco habla en minutos («sub-60», «sub-90») y una hora en cabeza rompe
    ///   la escala. Es una regla distinta, no otra grafía: por eso es un parámetro.
    static func clock(_ seconds: Double,
                      anchoFijo: Bool = false,
                      subMinuto: SubMinuto = .reloj,
                      enHoras: Bool = true) -> String {
        let total = max(0, Int(seconds.rounded()))
        let h = total / 3600, s = total % 60
        let m = enHoras ? (total % 3600) / 60 : total / 60
        if enHoras, h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        if m == 0, subMinuto == .segundos { return "\(s)s" }
        return String(format: anchoFijo ? "%02d:%02d" : "%d:%02d", m, s)
    }

    static func clock(_ seconds: Int,
                      anchoFijo: Bool = false,
                      subMinuto: SubMinuto = .reloj,
                      enHoras: Bool = true) -> String {
        clock(Double(seconds), anchoFijo: anchoFijo, subMinuto: subMinuto, enHoras: enHoras)
    }

    // MARK: - Duración larga (minutos, no cronómetro)

    /// «45 min» · «1 h» · «1 h 10» — un rato en minutos, escrito como se dice.
    ///
    /// Es la hermana de `clock` para la otra escala: el cronómetro cuenta segundos y
    /// se lee corriendo; esto es cuánto te va a llevar la sesión o la semana, y ahí
    /// «1:10:00» hace pensar. Existe porque el 29-jul había cuatro grafías del mismo
    /// rato en la app — «~1 h 10 min», «1 h 10», «1h 10m» y «~70 min» —, cada una
    /// escrita en la pantalla que la necesitaba.
    ///
    /// nil por debajo del minuto: «0 min» es exactamente el defecto plausible que
    /// esta app lleva retirando de todas partes (contrato §7).
    static func duracion(_ minutos: Int) -> String? {
        guard minutos > 0 else { return nil }
        let h = minutos / 60, m = minutos % 60
        if h == 0 { return "\(m) min" }
        if m == 0 { return "\(h) h" }
        return "\(h) h \(m)"
    }

    /// «desde 1 h 10» — el rato que ESCRIBE el plan.
    ///
    /// «desde» y no «≈». La duración de una sesión no se estima: o la escribió el
    /// coach (una ventana, un ciclo, una distancia contra un ritmo) o ES el
    /// resultado y no se puede saber de antemano. Lo que se suma es solo lo escrito,
    /// y todo lo que nadie escribe —andar hasta el rack, montar la barra, los
    /// ejercicios sueltos de un calentamiento— solo puede AÑADIR. Así que el número
    /// es un SUELO, y «≈» prometía una estimación centrada que nunca fue.
    /// Ver `shared/domain/prescription/duration.ts`.
    ///
    /// nil cuando el plan no escribe reloj: ahí no hay número que dar (§7), y quien
    /// llame se queda con la frase de `DuracionDesconocida`, que dice por qué.
    static func duracionPrevista(_ minutos: Int?) -> String? {
        guard let minutos, let cifra = duracion(minutos) else { return nil }
        return "desde \(cifra)"
    }

    // MARK: - Porcentaje

    /// «67 %» a partir de una FRACCIÓN 0…1 — el cumplimiento de una semana, la
    /// parte de un objetivo cubierta.
    ///
    /// Canónico NUEVO (§2.1), y existe sobre todo por la trampa: el servidor sirve
    /// el cumplimiento como fracción con dos decimales (`compliance_pct` =
    /// `round((hechas/planificadas) * 100) / 100` en
    /// shared/domain/coach/macro-progress.ts) pese a llamarse «pct». Pintarlo tal
    /// cual escribe «1 %» en una semana entera cumplida. Aquí se convierte UNA vez,
    /// en el sitio que sabe que es una fracción.
    ///
    /// El espacio antes del signo es el de la norma en castellano, y es el mismo
    /// que ya escribe la app en el resto de porcentajes de cara al atleta.
    /// nil cuando no hay fracción: sin dato no se pinta un cero (§7).
    static func porcentaje(fraccion: Double?) -> String? {
        guard let fraccion else { return nil }
        return "\(Int((fraccion * 100).rounded())) %"
    }

    // MARK: - Ritmo

    /// La unidad del ritmo por modalidad. El literal lleva la `m` de «500m»: sin
    /// ella («/500») el atleta lee «quinientos» y no sabe de qué.
    enum UnidadRitmo: String {
        case porKm = "/km"
        case por500m = "/500m"
        case porMilla = "/mi"
    }

    /// Solo las cifras del ritmo, «4:15», cuando la unidad la pinta el layout en su
    /// propia etiqueta (una celda con el valor arriba y «/km» debajo).
    static func ritmoCifras(_ secondsPerUnit: Double) -> String {
        let total = max(0, Int(secondsPerUnit.rounded()))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// «4:15/km» · «1:52/500m» — cifras y unidad PEGADAS. El espacio («4:15 /km»)
    /// parte el dato en dos a media pantalla y era la tercera grafía del ritmo.
    static func ritmo(_ secondsPerUnit: Double, _ unidad: UnidadRitmo) -> String {
        ritmoCifras(secondsPerUnit) + unidad.rawValue
    }

    // MARK: - Distancia

    /// «2,5 km» · «450 m» — la distancia PRESCRITA, que el coach escribe redonda.
    ///
    /// - `decimales`: 2 para distancia MEDIDA (lo que has cubierto: «2,34 km»),
    ///   donde la precisión es el dato. La prescripción no la necesita y con dos
    ///   decimales un «5 km» se leería «5,00 km», que sugiere una exactitud falsa.
    /// - nil cuando no hay distancia: lo que no se sabe no se pinta (contrato §7).
    static func distancia(_ meters: Double,
                          decimales: Int = 1,
                          siempreDecimales: Bool = false) -> String? {
        guard meters > 0 else { return nil }
        if meters >= 1000 {
            return esDecimal(meters / 1000,
                             decimals: decimales,
                             siempreDecimales: siempreDecimales) + " km"
        }
        return "\(Int(meters.rounded())) m"
    }

    /// La distancia MEDIDA, con su precisión de dos decimales — «2,34 km», y «2,00 km»
    /// cuando cae redonda: en una medida los ceros SON el dato (has cubierto dos
    /// kilómetros clavados), y además el ancho no baila mientras corres.
    static func distanciaCubierta(_ meters: Double) -> String? {
        distancia(meters, decimales: 2, siempreDecimales: true)
    }

    // MARK: - Carga

    /// «80 kg» · «82,5 kg».
    static func kg(_ value: Double) -> String { carga(value).linea }

    /// La MISMA carga partida en cifra y unidad — «82,5» + «kg».
    ///
    /// Canónico NUEVO (§2.1): una fila que enseña un 1RM pinta la cifra en la
    /// monoespaciada grande y la unidad pequeña al lado, y sin esto cada pantalla
    /// se recompone el string a mano o mete «kg» dentro del numeral (donde sale
    /// con el espaciado de una columna de instrumento). Es la hermana de `kg`,
    /// no una segunda grafía: `kg` es literalmente esta, unida.
    static func carga(_ value: Double) -> Cifra {
        Cifra(cifra: esDecimal(value), unidad: "kg")
    }

    /// Un entero con su unidad: «182 W», «28 spm», «412 kcal».
    static func entero(_ value: Double, _ unidad: String) -> String {
        "\(Int(value.rounded())) \(unidad)"
    }

    // MARK: - El trabajo hecho sobre el pedido (contrato §10.6)

    /// «10 de 12» — lo que llevas de lo que te pidieron.
    ///
    /// Canónico NUEVO (§2.1): el trabajo de una vista en vivo no tenía grafía, y
    /// sin canónico cada pantalla improvisa — el 29-jul tres agentes que habían
    /// leído el contrato escribieron la misma dosis de fuerza de tres maneras
    /// («2×10», «10 reps × 2», «2×10 reps») el mismo día.
    ///
    /// «de» y no «/»: se lee en voz alta como se piensa («diez de doce»), y la
    /// barra ya significa otra cosa en esta app (`4:15/km`). La unidad la pinta el
    /// layout aparte, como en `ritmoCifras`, para que el numeral no se coma la
    /// palabra al escalar.
    static func trabajo(hecho: Int, objetivo: Int) -> String {
        "\(hecho) de \(objetivo)"
    }

    // MARK: - La serie de fuerza (contrato §10, sujeto del hierro)

    /// Una cifra y su unidad, separadas — para que el sujeto pinte la unidad más
    /// pequeña sin que nadie recomponga el string a mano.
    struct Cifra: Equatable {
        let cifra: String
        /// Nil cuando la cifra no lleva unidad.
        let unidad: String?

        /// La misma cifra en una línea, para un riel o un resumen.
        var linea: String { unidad.map { "\(cifra) \($0)" } ?? cifra }
    }

    /// «5 × 100» + «kg» — LA SERIE QUE TIENES DELANTE.
    ///
    /// Canónico NUEVO (§2.1): la misma serie estaba escrita de tres maneras el
    /// 29-jul —`5 × 100 kg` en el HUD de fuerza, `5×100 kg` en el chip de tramo y
    /// `5 × 100 kg` otra vez en el resumen post-entreno—, cada una con su propio
    /// espaciado y su propio formateo del peso. Aquí una vez.
    ///
    /// `5 × 100` es UNA cosa y así se lee: son las repeticiones y luego la carga,
    /// que es como se piensa una serie. No se parte en dos peldaños — de que quepa
    /// se encarga el presupuesto de ancho de `EscalaNumeral` (§10.2), que es donde
    /// vive ese problema.
    ///
    /// La DEGRADACIÓN es del modelo, no del layout: sin carga (peso corporal) la
    /// serie son las repeticiones; sin repeticiones —el circuito real del coach
    /// llega con 30 kg y ninguna— la serie es la carga sola; sin ninguna de las dos
    /// no hay cifra que inventar y devuelve nil (§7).
    ///
    /// Esto escribe *repeticiones × carga* de UNA serie («5 × 100 kg»). La dosis de
    /// TODA la prescripción —«4 × 10», o la secuencia «6/6/4/4/3» cuando las series
    /// no son iguales— es otro concepto y no vive aquí: la escribe
    /// `PrescriptionRenderer`, que es quien tiene las series delante para no
    /// multiplicar a ciegas (ver la nota del borrado más abajo).
    ///
    /// Solo sabe de KILOS. Para la carga en cualquiera de sus formas —incluido el
    /// %RM, que no se convierte— está `dosisDeSerie`, que es esta con el eje de
    /// carga completo.
    ///
    /// `repsMax` es el TECHO de una banda de repeticiones («12-15 × 60 kg»): el
    /// coach prescribe un margen dentro del que el atleta autorregula, y enseñar
    /// solo el suelo le esconde media prescripción. Se ignora cuando no supera al
    /// suelo — un techo que no abre banda no es un rango (§7).
    static func serie(reps: Int?, repsMax: Int? = nil, cargaKg: Double?) -> Cifra? {
        let cifraReps: String? = reps.map { suelo in
            guard let techo = repsMax, techo > suelo else { return "\(suelo)" }
            return "\(suelo)-\(techo)"
        }
        if let cifraReps, let cargaKg {
            return Cifra(cifra: "\(cifraReps) \(signoPor) \(esDecimal(cargaKg))", unidad: "kg")
        }
        if let cargaKg { return Cifra(cifra: esDecimal(cargaKg), unidad: "kg") }
        if let cifraReps { return Cifra(cifra: cifraReps, unidad: Vocab.reps) }
        return nil
    }

    // BORRADO EL 11-AGO: `dosisDeSeries(series:reps:)`, que multiplicaba el número
    // de series por las repeticiones de la PRIMERA. Con series desiguales eso no es
    // un redondeo, es una mentira: el 6-6-4-4-3 real del bloque 392 salía «5×6», y
    // el 49 % de la fuerza del corpus tiene cinco series o más. Su único caller era
    // la línea del plan del hierro en vivo, que este porte quitó (la dosis de ESTA
    // serie es ahora el sujeto, y las series están en el riel).
    //
    // NO se ha sustituido por una versión honesta porque ya existía una: las
    // tarjetas del plan van por `PrescriptionRenderer`, que recorre las series de
    // verdad — colapsa a «4 × 8» solo si `setsAreUniform`, y si no escribe la
    // secuencia («10/10/8/8/6»). Dos formateadores para la misma pregunta es como
    // empezaron las tres grafías del ritmo (§2), así que queda uno.
    //
    // Y la secuencia va con BARRA y no con guion: el guion ya significa BANDA en
    // esta app («12-15» de `serie`), y «6-6-4-4-3» le daría dos sentidos al mismo
    // signo. El coach también la escribe con barra en el `notes` del bloque.

    /// CONTRA QUÉ SE HACE UNA SERIE. Las formas están en la base, tal cual:
    ///
    ///     kg           `{"kind":"kg","value":82.5}`
    ///     kg × 2       `{"kind":"kg","value":32,"implement_count":2}`
    ///     porcentaje   `{"kind":"percent_rm","min":75,"max":85}`
    ///     corporal     `{"kind":"bodyweight"}`
    ///
    /// El inventario sale del MODELO (`Target`), no del ejemplo que se tenía
    /// delante: son cuatro escrituras y no tres, porque un implemento por mano es
    /// una cuarta —«2×32 kg»— y sin el ×2 el atleta coge una sola pesa.
    ///
    /// Existe como TIPO y no como parámetros sueltos porque son excluyentes: con
    /// `cargaKg` y `porcentajeMin` a la vez en la firma, el sitio donde se decide
    /// cuál gana acaba siendo cada pantalla que llama.
    enum CargaDeSerie: Equatable {
        /// `implementos` > 1 = uno por mano, y entonces la carga NO cabe dentro de
        /// la cifra: dos signos de multiplicar en «10 × 2×32» no se leen.
        case kg(Double, implementos: Int? = nil)
        /// `max` nulo, o que no supera al suelo, no abre banda (§7).
        case porcentaje(min: Double, max: Double?)
        case corporal
    }

    /// LA SERIE QUE TIENES DELANTE, repartida en los peldaños del numeral.
    struct DosisDeSerie: Equatable {
        /// El peldaño que gobierna la pantalla. Nil = no hay cifra que inventar y
        /// entonces el sujeto es el NOMBRE del ejercicio (§7).
        let sujeto: Cifra?
        /// El segundo peldaño, cuando la carga no puede vivir en la cifra.
        let segundo: Cifra?
        /// La carga que NO es un número y por eso no ocupa peldaño: «peso
        /// corporal». Nil cuando la carga ya está en un peldaño o no hay carga.
        let pieDeCarga: String?
    }

    /// LA DOSIS DE UNA SERIE, con la carga en cualquiera de sus tres formas.
    ///
    /// Es `serie` con el eje de carga COMPLETO. `serie` solo sabe de kilos, y con
    /// eso media prescripción del corpus no se puede escribir sin mentir: la carga
    /// llega tres veces de tres maneras y un porcentaje NO es un peso.
    ///
    /// **UN PORCENTAJE JAMÁS BAJA A KILOS.** La app no tiene el 1RM medido de este
    /// atleta para este ejercicio, así que resolver «75 % de tu máximo» sería
    /// inventar el máximo y mandarlo a levantar un peso que nadie ha pesado (§7).
    /// Y tampoco entra en la cifra: «6 × 75-85» se lee como kilos y no lo son. Ahí
    /// la cifra son las repeticiones y el porcentaje baja al segundo peldaño con su
    /// unidad ENTERA, que es la única forma de que no mienta.
    ///
    /// Con KILOS sí es una sola cosa —«10 × 82,5» + «kg»— porque así se piensa una
    /// serie: repeticiones y luego carga. No se parte; de que quepa se encarga el
    /// presupuesto de ancho de `EscalaNumeral` (§10.2).
    static func dosisDeSerie(reps: Int?,
                             repsMax: Int? = nil,
                             carga: CargaDeSerie?) -> DosisDeSerie? {
        let cifraReps: String? = reps.map { suelo in
            guard let techo = repsMax, techo > suelo else { return "\(suelo)" }
            return "\(suelo)-\(techo)"
        }
        let peldanoReps = cifraReps.map { Cifra(cifra: $0, unidad: Vocab.reps) }

        switch carga {
        case let .kg(valor, implementos):
            // UNO POR MANO baja al segundo peldaño: «10 × 2×32» tiene dos signos de
            // multiplicar con dos significados distintos en la misma cifra y no se
            // lee. Es el mismo motivo por el que baja un porcentaje.
            if let n = implementos, n > 1 {
                let porMano = Cifra(cifra: "\(n)\(signoPor)\(esDecimal(valor))", unidad: "kg")
                guard let peldanoReps else {
                    return DosisDeSerie(sujeto: porMano, segundo: nil, pieDeCarga: nil)
                }
                return DosisDeSerie(sujeto: peldanoReps, segundo: porMano, pieDeCarga: nil)
            }
            // Con repeticiones, las dos son la cifra; sin ellas —el `Reverse Lunge`
            // real llega con 30 kg y ninguna— la carga sola es la cifra.
            guard let cifraReps else {
                return DosisDeSerie(sujeto: Formato.carga(valor), segundo: nil, pieDeCarga: nil)
            }
            return DosisDeSerie(
                sujeto: Cifra(cifra: "\(cifraReps) \(signoPor) \(esDecimal(valor))", unidad: "kg"),
                segundo: nil, pieDeCarga: nil)

        case let .porcentaje(minimo, maximo):
            let banda = Cifra(cifra: rango(minimo, maximo), unidad: Vocab.porcentajeDeTuMaximo)
            // Sin repeticiones el porcentaje SUBE a la cifra: es lo único escrito,
            // y un segundo peldaño sin primero no es una jerarquía.
            guard let peldanoReps else {
                return DosisDeSerie(sujeto: banda, segundo: nil, pieDeCarga: nil)
            }
            return DosisDeSerie(sujeto: peldanoReps, segundo: banda, pieDeCarga: nil)

        case .corporal:
            // El peso corporal no es un número: no ocupa peldaño y se dice abajo.
            return DosisDeSerie(sujeto: peldanoReps, segundo: nil, pieDeCarga: Vocab.pesoCorporal)

        case nil:
            guard let peldanoReps else { return nil }
            return DosisDeSerie(sujeto: peldanoReps, segundo: nil, pieDeCarga: nil)
        }
    }

    /// «75-85» · «70» — una banda SIN unidad. Un techo que no supera al suelo no
    /// abre banda y no se escribe como si lo hiciera (§7).
    static func rango(_ minimo: Double, _ maximo: Double?) -> String {
        guard let maximo, maximo > minimo else { return esDecimal(minimo) }
        return "\(esDecimal(minimo))-\(esDecimal(maximo))"
    }

    /// El signo de multiplicar es el MULTIPLICATION SIGN (U+00D7), no una equis.
    /// La `x` del teclado se lee como letra al lado de una cifra («5 x 100» parece
    /// una talla) y encima cambia de anchura en la monoespaciada.
    static let signoPor = "\u{00D7}"

    /// DE DÓNDE A DÓNDE VA UNA PROGRESIÓN — «100 → 115 kg».
    ///
    /// Flecha (U+2192) y no guion, y la diferencia es de significado: «100-115 kg»
    /// se lee como una banda («elige lo que quieras ahí dentro»), y en una pirámide
    /// eso es falso — el orden importa y se empieza en una carga para acabar en
    /// otra. La flecha dice exactamente eso y ocupa lo mismo.
    static let signoProgresion = "\u{2192}"

    // MARK: - La diferencia contra un objetivo (contrato §10)

    /// «+2 s» · «−3 s» — cuánto te separa de lo pedido, con el signo delante.
    ///
    /// Canónico NUEVO (§2.1). El signo negativo es el MENOS tipográfico (U+2212),
    /// no el guion del teclado: a 22 pt en mono el guion se lee como un separador
    /// y «-3 s» parece un rango partido. Es la misma grafía que ya usa el doble.
    ///
    /// El valor se redondea a entero: una diferencia en vivo con decimales cambia
    /// cada tick y no se puede leer corriendo. Quien necesite saber si la
    /// diferencia es DESPRECIABLE no mira el texto — pregunta a `Delta.juicio`,
    /// que es donde vive ese criterio.
    static func delta(_ valor: Double, _ unidad: String) -> String {
        let signo = valor > 0 ? "+" : "\u{2212}"
        return "\(signo)\(Int(abs(valor).rounded())) \(unidad)"
    }
}

// MARK: - Vocabulario (contrato §3)
//
// Español siempre, y una sola palabra por cosa. Nada de `HR`, `bpm`, `Avg`, `Pace`
// ni `Dist` de cara al atleta: la app se habla entera en el idioma del box.

enum Vocab {
    /// El pulso se llama FC (o «pulso» en prosa). Nunca `HR`.
    static let fc = "FC"
    static let fcMedia = "FC media"
    static let fcMax = "FC máx"
    static let fcReposo = "FC reposo"
    /// Pulsaciones por minuto. Nunca `bpm`.
    static let ppm = "ppm"

    /// La cadencia se escribía también «ppm» (pasos por minuto) — la MISMA unidad
    /// que el pulso, en las mismas pantallas. «Cadencia 176 ppm» encima de «FC 176
    /// ppm» no se distingue. La cadencia se cuenta en pasos, y así se dice.
    static let cadencia = "pasos/min"

    static let ritmo = "Ritmo"
    static let distancia = "Distancia"
    static let tiempo = "Tiempo"
    static let vuelta = "Vuelta"
    static let total = "Total"
    /// Cuánto llevas desde que soltaste la barra. En el hierro es EL número que se
    /// mira entre series, y el que la app no daba: el descanso prescrito se agota y
    /// desaparece, y a partir de ahí nadie sabe si lleva cuarenta segundos o cuatro
    /// minutos sentado.
    static let pausa = "Pausa"

    /// Lo que te pidieron. En prosa y como etiqueta, la misma palabra.
    static let objetivo = "Objetivo"
    /// El sufijo de un `Delta` contra la prescripción del tramo. Un delta sin
    /// referente es un número que miente por omisión, así que la coletilla no es
    /// decoración: es parte del dato.
    static let vsObjetivo = "vs objetivo"
    /// La zona de pulso, como concepto («Zona 2», «fuera de zona»).
    static let zona = "Zona"

    // El hierro y el reloj de box. Palabras que el 29-jul vivían sueltas en cada
    // vista en vivo («Reps» aquí, «reps» allí, «Descanso» y «descanso» en la misma
    // pantalla) — y el atleta las lee todas en el mismo entreno.

    /// Repeticiones. Como unidad de una cifra («5 reps») y como etiqueta.
    static let reps = "reps"
    /// Repeticiones SIN número: las que salgan. Es la dosis de un «4× máx» o de
    /// unos wall balls «máximo unbroken» — el coach no fija la cifra a propósito,
    /// y es el atleta quien la produce. En el box se dice así, no «al máximo» ni
    /// «AMRAP» (ver `Measure.repsToFailure`).
    static let alFallo = "al fallo"
    /// Una serie de fuerza. `series` para el plural, que aquí no es regular en uso
    /// («Serie 2 de 4» / «4 series»).
    static let serie = "Serie"
    static let series = "Series"
    /// Una ronda de un formato con reloj (EMOM, intervalos, AMRAP) y también una
    /// ronda de la rotación de una superserie: has pasado una vez por todos los
    /// ejercicios. Es EL nombre de ese concepto en toda la app — la previa, el
    /// entreno en vivo y la muñeca dicen «ronda», nunca «vuelta».
    static let ronda = "Ronda"
    /// Dos o más ejercicios que se alternan serie a serie. La palabra que usa el
    /// gimnasio; `PrescriptionScheme.superset` es el vocabulario del cable (§3).
    static let superserie = "Superserie"
    /// El peso que mueves.
    static let carga = "Carga"
    /// La unidad de una carga escrita en PORCENTAJE, entera. «%» a secas no dice
    /// de qué, y en una pantalla donde todo lo demás son kilos se lee como si el
    /// número fueran kilos: es la diferencia entre «75-85» y «75-85 % de tu
    /// máximo». Se escribe así de largo a propósito — cabe, porque vive en el
    /// segundo peldaño del numeral y no dentro de la cifra.
    static let porcentajeDeTuMaximo = "% de tu máximo"
    /// La carga que no es un número: tu propio peso. No es lo mismo que «el plan
    /// no dice con cuánto» — una es una prescripción y la otra un hueco (§7).
    static let pesoCorporal = "peso corporal"
    /// LO ÚNICO QUE LA APP MIDE DEL LEVANTAMIENTO: a qué velocidad sube la barra.
    /// Se dice así y no «m/s» —eso es la unidad, y va en el pie— ni «VBT», que es
    /// jerga de laboratorio y en el box no la dice nadie.
    static let velocidad = "Velocidad"
    /// El descanso PRESCRITO — es dosis, no una pausa (§10 del contrato de UI).
    static let descanso = "Descanso"
    /// Repeticiones en recámara. Nunca `RIR` en prosa sin explicar; la pastilla lo
    /// traduce (`Vocab.rirTraducido`).
    static let rir = "RIR"
    /// Esfuerzo percibido.
    static let rpe = "RPE"

    /// «RIR 2 · deja 2 dentro» — el número solo no dice qué hacer, y el atleta que
    /// entra hoy no ha visto la escala nunca.
    static func rirTraducido(_ valor: Int) -> String {
        valor == 0 ? "\(rir) 0 · hasta el fallo" : "\(rir) \(valor) · deja \(valor) dentro"
    }
}

// MARK: - Fechas en castellano (contrato §2 · §3)

/// CÓMO SE ESCRIBE UNA FECHA de cara al atleta. Entra siempre un ISO
/// «YYYY-MM-DD» del cable; sale castellano.
///
/// Vive aquí, con el resto de la grafía, y no dentro de la pantalla que lo
/// necesitó primero: la app tiene ya varias copias locales de este mismo
/// `DateFormatter` con `es_ES` (el panel de la pareja, el historial), que es
/// exactamente cómo nacieron las catorce duraciones. Este es el canónico; las
/// copias que queden se migran aquí, no se replican.
///
/// Los `DateFormatter` son estáticos a propósito: crearlos es caro y estas
/// funciones se llaman dentro de listas.
enum FechaES {
    private static let entrada: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let salidaLarga: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d 'de' MMMM"
        return f
    }()

    private static let salidaCorta: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d MMM"
        return f
    }()

    /// La fecha suelta, para hacer aritmética con ella. Nil si el ISO no se lee.
    static func fecha(_ iso: String) -> Date? { entrada.date(from: iso) }

    /// El ISO de una fecha — la vuelta de `fecha(_:)`.
    static func iso(_ date: Date) -> String { entrada.string(from: date) }

    /// «3 de julio». Nil cuando la fecha no se puede leer — nunca media frase.
    static func larga(_ iso: String) -> String? {
        fecha(iso).map { salidaLarga.string(from: $0) }
    }

    /// «3 jul».
    static func corta(_ iso: String) -> String? {
        fecha(iso).map { salidaCorta.string(from: $0) }
    }

    private static let salidaConDia: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE d 'de' MMMM"
        return f
    }()

    /// «lunes 10 de agosto» — para anunciar una fecha FUTURA, donde el día de la
    /// semana es justo lo que el atleta necesita para situarse. Nil si no se lee.
    static func conDia(_ iso: String) -> String? {
        fecha(iso).map { salidaConDia.string(from: $0) }
    }

    private static let salidaDiaSemana: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE"
        return f
    }()

    /// «domingo» — el día de la semana, suelto. Dentro de los próximos siete
    /// días sitúa mejor que una fecha: nadie sabe de memoria qué día cae el 17.
    static func diaSemana(_ date: Date) -> String {
        salidaDiaSemana.string(from: date)
    }

    /// «hoy» · «ayer» · «hace 3 días» · «el 12 de julio».
    ///
    /// Cuánto hace que pasó algo, dicho como lo dice una persona. Pasada una
    /// semana la cuenta deja de informar («hace 34 días» no sitúa a nadie) y
    /// gana la fecha.
    ///
    /// Vive aquí, con el resto de la grafía: la app tiene ya varias copias
    /// locales de esta misma cuenta y esta es la canónica — las que queden se
    /// migran, no se replican.
    static func hace(_ date: Date, ahora: Date = Date()) -> String {
        let cal = Calendar.current
        let dias = cal.dateComponents(
            [.day],
            from: cal.startOfDay(for: date),
            to: cal.startOfDay(for: ahora)
        ).day ?? 0
        switch dias {
        case ..<0:  return larga(iso(date)).map { "el \($0)" } ?? "hoy"
        case 0:     return "hoy"
        case 1:     return "ayer"
        case 2...6: return "hace \(dias) días"
        default:    return larga(iso(date)).map { "el \($0)" } ?? "hace \(dias) días"
        }
    }
}
