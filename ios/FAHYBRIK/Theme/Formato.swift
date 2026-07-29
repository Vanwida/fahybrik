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
    static func kg(_ value: Double) -> String { esDecimal(value) + " kg" }

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
    /// Ojo a la diferencia con `dosisDeSeries`, que es OTRO concepto: aquella
    /// escribe *series × repeticiones* de toda la prescripción («4×5»); esta
    /// escribe *repeticiones × carga* de UNA serie («5 × 100 kg»).
    static func serie(reps: Int?, cargaKg: Double?) -> Cifra? {
        if let reps, let cargaKg {
            return Cifra(cifra: "\(reps) \(signoPor) \(esDecimal(cargaKg))", unidad: "kg")
        }
        if let cargaKg { return Cifra(cifra: esDecimal(cargaKg), unidad: "kg") }
        if let reps { return Cifra(cifra: "\(reps)", unidad: Vocab.reps) }
        return nil
    }

    /// «4×5» — series por repeticiones de TODA la prescripción, pegado.
    ///
    /// Pegado y no separado a propósito, y es la única diferencia visible con
    /// `serie`: «4×5» es una dosis que se lee de un vistazo en una franja de
    /// contexto, mientras que «5 × 100 kg» es el sujeto de la pantalla y respira.
    /// Nil cuando no hay repeticiones que multiplicar.
    static func dosisDeSeries(series: Int, reps: Int?) -> String? {
        guard let reps, series > 0 else { return nil }
        return series > 1 ? "\(series)\(signoPor)\(reps)" : "\(reps)"
    }

    /// El signo de multiplicar es el MULTIPLICATION SIGN (U+00D7), no una equis.
    /// La `x` del teclado se lee como letra al lado de una cifra («5 x 100» parece
    /// una talla) y encima cambia de anchura en la monoespaciada.
    static let signoPor = "\u{00D7}"

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
    /// Una serie de fuerza. `series` para el plural, que aquí no es regular en uso
    /// («Serie 2 de 4» / «4 series»).
    static let serie = "Serie"
    static let series = "Series"
    /// Una ronda de un formato con reloj (EMOM, intervalos, AMRAP).
    static let ronda = "Ronda"
    /// El peso que mueves.
    static let carga = "Carga"
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
