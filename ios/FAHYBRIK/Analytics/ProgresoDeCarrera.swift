import Foundation

// LO POCO QUE DECIDE ESTA PANTALLA — y por qué es tan poco.
//
// El veredicto, su frase, la escalera, el plazo, las coberturas, el reparto
// plegado y los cuatro deltas llegan SERVIDOS. Aquí solo queda lo que es
// presentación pura: qué se calla, qué botón sale, y bajo qué gráfico cuelga la
// marca que dice en qué se apoya el veredicto.
//
// Ni una división, ni un umbral, ni una comparación de método. Si algo de esto
// empieza a parecer un cálculo, está en el fichero equivocado.

enum ProgresoDeCarrera {

    /// Las seis lecturas, en el orden en que la pantalla las recorre. El orden lo
    /// manda el dominio: si aquí dijera otra cosa, servidor y app discreparían
    /// sobre cuál es «la primera falta».
    enum Lectura: String, CaseIterable {
        case forma, esfuerzos, volumen, reparto, pedido, cansado
    }

    /// Cómo se pinta una lectura.
    enum Modo: Equatable {
        /// Hay con qué: se dibuja.
        case da
        /// Falta algo que el atleta puede resolver: tenue y con candado.
        case apagada
        /// Esa lectura no existe en su vida: **la app se calla**, ni siquiera un hueco.
        case nada
    }

    static func falta(_ cobertura: Cobertura, _ lectura: Lectura) -> Falta? {
        switch lectura {
        case .forma: return cobertura.forma
        case .esfuerzos: return cobertura.esfuerzos
        case .volumen: return cobertura.volumen
        case .reparto: return cobertura.reparto
        case .pedido: return cobertura.pedido
        case .cansado: return cobertura.cansado
        }
    }

    static func modo(_ cobertura: Cobertura, _ lectura: Lectura) -> Modo {
        guard let f = falta(cobertura, lectura) else { return .da }
        return seCalla(f) ? .nada : .apagada
    }

    /// «AÚN NO» Y «NO APLICA» PARECEN LO MISMO Y NO LO SON. Al recién llegado le
    /// falta TIEMPO y se le dibuja el plazo. Al que no ha corrido nunca cansado no
    /// le falta nada: esa lectura no existe en su vida, y enseñarle un hueco
    /// prometiéndosela es ruido con forma de dato.
    static func seCalla(_ f: Falta) -> Bool {
        switch f {
        case .ocasion, .intencion: return true
        case .historia, .ancla, .sensor: return false
        }
    }

    /// LA SALIDA DE UNA FALTA — el botón, que es todo el texto que se le dedica.
    /// Nula cuando no hay nada que el atleta pueda hacer hoy: esperar no es una
    /// acción, y un botón que no lleva a ningún sitio es peor que ninguno.
    static func salidaDe(_ f: Falta) -> String? {
        switch f {
        case .ancla: return "Hacer el test de zonas"
        case .sensor: return "Conectar banda de pulso"
        case .historia, .ocasion, .intencion: return nil
        }
    }

    /// CUANDO VARIAS LECTURAS ESPERAN LO MISMO, LA SALIDA SALE UNA VEZ. Sin esto,
    /// al atleta sin test se le pediría el test tres veces en la misma pantalla.
    static func faltaComun(_ faltas: [Falta]) -> Falta? {
        let contables = faltas.filter { !seCalla($0) }
        guard contables.count >= 2, let primera = contables.first else { return nil }
        return contables.allSatisfy { mismaRazon($0, primera) } ? primera : nil
    }

    /// Misma RAZÓN, no mismo valor: dos faltas de historia con distinto plazo
    /// siguen esperando lo mismo.
    private static func mismaRazon(_ a: Falta, _ b: Falta) -> Bool {
        switch (a, b) {
        case (.historia, .historia), (.ancla, .ancla), (.sensor, .sensor),
             (.ocasion, .ocasion), (.intencion, .intencion):
            return true
        default:
            return false
        }
    }

    /// El botón de la pantalla: uno, y solo si lleva a algún sitio. Con una sola
    /// lectura contable sale el suyo; con varias, solo si todas esperan lo mismo.
    static func salidaDeLaPantalla(_ cobertura: Cobertura) -> String? {
        let contables = Lectura.allCases
            .compactMap { falta(cobertura, $0) }
            .filter { !seCalla($0) }
        if let comun = faltaComun(contables) { return salidaDe(comun) }
        return contables.count == 1 ? salidaDe(contables[0]) : nil
    }

    // MARK: - Bajo qué gráfico se apoya el veredicto

    /// El gráfico al que se le cuelga la marca que nombra la evidencia.
    enum Soporte: Equatable {
        case forma, esfuerzos, volumen
    }

    /// EL NÚMERO QUE SOSTIENE EL VEREDICTO SE DIBUJA DEBAJO — regla de la propia
    /// pantalla, y por eso la marca no es adorno.
    ///
    /// Los dos primeros peldaños tienen gráfico propio y la marca cuelga de él.
    /// **El tercero no lo tiene**: `mismo-tipo` compara el mismo tipo de sesión
    /// consigo mismo y esta pantalla no dibuja esa serie. Un bloque propio le
    /// daría al peldaño MÁS DÉBIL más peso visual que a los fuertes, que es al
    /// revés de lo que significa; así que la marca baja al gráfico que sí exista
    /// (Alex vía el lead, 12-ago).
    ///
    /// Orden de preferencia para el tercero: los esfuerzos antes que el volumen,
    /// porque una curva de esfuerzos habla de rendimiento y las barras solo de
    /// cuánto se corrió.
    static func soporte(
        _ veredicto: Veredicto, cobertura: Cobertura, history: RunningHistory
    ) -> Soporte? {
        switch veredicto.peldano {
        case .alPulso: return .forma
        case .esfuerzos: return .esfuerzos
        case .mismoTipo: return graficoDisponible(cobertura, history)
        case nil: return nil
        }
    }

    /// SI NO QUEDA NINGÚN GRÁFICO, EL VEREDICTO NO SE DA.
    ///
    /// Es la otra mitad de la regla: afirmar «vas mejor» sin nada que enseñar es
    /// pedirle al atleta que se fíe, y esta pantalla se construyó justo para no
    /// hacer eso. Un veredicto que nadie puede comprobar deja de ser un veredicto.
    ///
    /// **HOY NO SE ALCANZA CONTRA EL SERVIDOR REAL, y conviene saber por qué**: la
    /// serie semanal de kilómetros la rellena `generate_series` con ceros
    /// (`loadWeeklyRunVolume`), así que nunca llega vacía y siempre quedan las
    /// barras. La regla se implementa igual —es una decisión de producto, no una
    /// guarda defensiva— y queda escrito de qué garantía ajena depende: si algún
    /// día esa consulta deja de rellenar, esta pantalla degrada sola en vez de
    /// afirmar a ciegas.
    static func degradaPorFaltaDeGrafico(
        _ veredicto: Veredicto, cobertura: Cobertura, history: RunningHistory
    ) -> Bool {
        veredicto.peldano != nil && soporte(veredicto, cobertura: cobertura, history: history) == nil
    }

    /// Qué gráficos hay de verdad, preguntado a las MISMAS condiciones con las que
    /// se dibujan — no a un proxy que pueda desalinearse del dibujo.
    private static func graficoDisponible(
        _ cobertura: Cobertura, _ history: RunningHistory
    ) -> Soporte? {
        if modo(cobertura, .esfuerzos) == .da, history.esfuerzos.count >= 2 { return .esfuerzos }
        if modo(cobertura, .volumen) == .da, history.semanasKm.contains(where: { $0.valor > 0 }) {
            return .volumen
        }
        return nil
    }

    /// EL VEREDICTO QUE SE PINTA — el servido, o «aún no» cuando no queda ningún
    /// gráfico que lo sostenga.
    ///
    /// Vive aquí y no dentro de la vista porque **el lienzo entero se tiñe con su
    /// clase**, y quien pinta el fondo está por encima de la pantalla: si cada uno
    /// resolviera la degradación por su cuenta, el tinte y el titular podrían
    /// discrepar en el mismo pintado.
    static func veredictoEfectivo(_ p: RunningProgressPayload) -> Veredicto {
        let v = p.verdict
        guard degradaPorFaltaDeGrafico(v, cobertura: p.coverage, history: p.history)
        else { return v }
        return Veredicto(clase: .aunNo, frase: "Aún no", peldano: nil, plazo: v.plazo)
    }

    /// Lo que dice la marca. Nombra la evidencia sin explicarla: es un pie de
    /// pocas palabras, no una frase.
    static func textoDeMarca(_ peldano: Peldano) -> String {
        switch peldano {
        case .alPulso(_, let semanas): return "Al mismo pulso · \(semanas) sem"
        case .esfuerzos(_, let metros): return "Contra tu mejor \(kilometros(metros))"
        case .mismoTipo(_, let semanas): return "Mismas sesiones · \(semanas) sem"
        }
    }

    /// «5 km» · «800 m» — la distancia como la dice un corredor.
    private static func kilometros(_ metros: Int) -> String {
        metros >= 1000
            ? "\(Formato.esDecimal(Double(metros) / 1000)) km"
            : "\(metros) m"
    }
}
