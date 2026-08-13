import Foundation

// CÓMO SE ESCRIBE UNA LECTURA — la grafía de las diecisiete unidades del contrato.
//
// POR QUÉ EXISTE, Y POR QUÉ AQUÍ
// ------------------------------
// El servidor NO manda el número formateado, y es la decisión correcta: el mismo
// 270 se escribe «4:30/km» en una tarjeta y «4:30» en un eje, y eso lo decide
// quien dibuja. Lo que manda es la UNIDAD (`shared/domain/analytics/lectura.ts`).
// Este fichero es la traducción, y es el único sitio donde vive: si cada bloque
// escribiera la suya, la variabilidad saldría «48 ms» en un sitio y «48ms» en el
// de al lado — que es literalmente cómo nació `Formato`.
//
// **NO REESCRIBE `Formato`, LO USA.** Un ritmo se escribe con `Formato.ritmo`, una
// carga con `Formato.esDecimal`, un rato con `Formato.duracion`. Aquí solo se
// decide QUÉ formateador le toca a cada unidad, y con qué palabra se rotula.
//
// EL BARRIDO ES DEL ENUM ENTERO, NO DE LO QUE HOY SE SIRVE. Hoy el motor emite
// ocho unidades de diecisiete; las diecisiete están escritas porque el inventario
// lo da el MODELO y no el ejemplo que se tenía delante. Así una lectura nueva en
// kilocalorías o en vatios-por-500 aparece dibujada sin tocar Swift, que es toda
// la promesa del contrato.
//
// CERO JERGA. La unidad del cable es `bpm` y la palabra del atleta es `ppm`; la
// del cable es `tss` y la del atleta es «carga». Se traduce aquí, una vez.

enum GrafiaDeLectura {

    /// Un número escrito: la cifra tal y como se pinta, y la palabra que la
    /// califica al lado. `unidad` nula cuando la cifra ya la lleva pegada (un
    /// ritmo es «4:15/km», nunca «4:15» + «/KM»: partirlo sería la tercera grafía
    /// del ritmo que `Formato` retiró).
    struct Escrito: Equatable {
        let cifra: String
        let unidad: String?
    }

    // MARK: - El número

    /// LA CIFRA DE UNA LECTURA, por su unidad. Nil solo cuando la unidad es
    /// desconocida para este binario — y entonces la lectura no se pinta, porque
    /// un número sin unidad es un número que miente por omisión.
    static func escribe(_ valor: Double, _ unidad: UnidadLectura) -> Escrito? {
        switch unidad {

        // ── Carga ────────────────────────────────────────────────────────────
        // «TSS» es jerga de laboratorio y en el box no la dice nadie. La unidad
        // de Banister se llama CARGA de cara al atleta, en toda la app.
        case .tss:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "carga")

        // El ritmo de subida es la única unidad SIGNADA por naturaleza: bajar el
        // fondo es tan legítimo como subirlo, así que el signo es parte del dato
        // y se escribe con el menos tipográfico, no con el guion del teclado.
        case .tssSemana:
            return Escrito(cifra: Formato.conSigno(valor), unidad: "carga/sem")

        // ── Adimensionales ───────────────────────────────────────────────────
        // Dos decimales: un cociente reciente/fondo se lee «1,12», y a un decimal
        // («1,1») las bandas del coach dejarían de distinguirse.
        case .ratio:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 2, siempreDecimales: true), unidad: nil)

        // Una puntuación 0-100 del proveedor. «Sobre 100» dice la escala sin la
        // cual un 34 de estrés no significa nada.
        case .puntos:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "sobre 100")

        case .pct:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "%")

        // ── Cuerpo ───────────────────────────────────────────────────────────
        case .ms:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "ms")

        // El pulso se cuenta en PULSACIONES POR MINUTO. `bpm` es la clave del
        // cable; la palabra del atleta la manda `Vocab`.
        case .bpm:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: Vocab.ppm)

        case .horas:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 1), unidad: "h")

        case .kg:
            let carga = Formato.carga(valor)
            return Escrito(cifra: carga.cifra, unidad: carga.unidad)

        // El VO₂máx se lee desnudo en toda la app: el título ya dice qué es, y
        // «ml/kg/min» es la unidad de un informe de laboratorio, no de una cifra.
        case .mlKgMin:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: nil)

        // ── Distancia y velocidad ────────────────────────────────────────────
        // El depósito por encima de la velocidad crítica son METROS: lo que puede
        // correr por encima de ella antes de que se acabe.
        case .metros:
            if valor >= 1000 {
                return Escrito(cifra: Formato.esDecimal(valor / 1000, decimals: 1), unidad: "km")
            }
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "m")

        // UNA VELOCIDAD SE LE ESCRIBE AL CORREDOR COMO RITMO. Nadie sostiene
        // «3,42 m/s»: sostiene 4:52 el kilómetro. Es la misma clase de decisión
        // que el contrato deja al cliente (cómo se escribe un número), y la
        // conversión es aritmética pura — 1000 partido por la velocidad.
        case .mS:
            guard valor > 0 else { return nil }
            return Escrito(cifra: Formato.ritmo(1000 / valor, .porKm), unidad: nil)

        case .sKm:
            return Escrito(cifra: Formato.ritmo(valor, .porKm), unidad: nil)

        case .s500m:
            return Escrito(cifra: Formato.ritmo(valor, .por500m), unidad: nil)

        // ── Tiempo y trabajo ─────────────────────────────────────────────────
        // Un rato de entrenamiento son horas y minutos («12 h 30»), no un
        // cronómetro: «12:30:00» hace pensar. Por debajo de la hora sí manda el
        // reloj, que es como se lee un intervalo.
        case .segundos:
            if valor >= 3600, let largo = Formato.duracion(Int((valor / 60).rounded())) {
                return Escrito(cifra: largo, unidad: nil)
            }
            return Escrito(cifra: Formato.clock(valor), unidad: nil)

        case .kcal:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "kcal")

        case .sesiones:
            return Escrito(cifra: Formato.esDecimal(valor, decimals: 0), unidad: "sesiones")

        // Una unidad que este binario no sabe escribir: la lectura se calla.
        case .desconocida:
            return nil
        }
    }

    // MARK: - La referencia

    /// CONTRA QUÉ SE LEE EL NÚMERO, en palabras. `Referencia.de` es una clave
    /// estable del servidor (`basal_60_14d`, `objetivo_sueno`…) y una clave no se
    /// le enseña a nadie: se traduce aquí o no se escribe.
    ///
    /// Nula ante una clave desconocida — antes ninguna palabra que una clave
    /// cruda en pantalla.
    static func nombreDeReferencia(_ de: String) -> String? {
        switch de {
        case "basal_60_14d":           return "tu media"
        case "objetivo_sueno":         return "tu objetivo"
        case "objetivo":               return "tu objetivo"
        case "equilibrio":             return "equilibrio"
        case "aviso_del_coach":        return "aviso de tu coach"
        case "medido_por_instrumento": return "medido"
        case "umbral":                 return "tu umbral"
        default:                       return nil
        }
    }

    /// La referencia ENTERA, escrita: «tu media 55». Nula cuando no se puede
    /// nombrar o cuando su número no se sabe escribir.
    static func escribeReferencia(_ referencia: ReferenciaDeLectura, _ unidad: UnidadLectura) -> String? {
        guard let nombre = nombreDeReferencia(referencia.de),
              let escrito = escribe(referencia.valor, unidad) else { return nil }
        return "\(nombre) \(escrito.cifra)"
    }
}
