import Foundation
@testable import FAHYBRIK

// LOS DOS BLOQUES TRANSVERSALES — «cómo llegas hoy» y «vas a más o te pasas».
//
// VAN JUNTOS PORQUE SE LEEN JUNTOS. El bloque de carga afirma «has subido y
// duermes poco»; la evidencia de la mitad de esa frase vive en el bloque de
// arriba. Volcarlos por separado enseñaría dos bloques correctos y escondería lo
// único que ninguna otra app tiene: que se citan entre ellos.
//
// LAS SEIS LECTURAS DE CARGA SON LAS DEL SERVIDOR, una a una — id, título y
// procedencia salen de `shared/domain/analytics/carga.ts`. Inventarse un id aquí
// haría que el volcado enseñara un bloque que en producción no puede existir.
//
// Y CUADRAN ENTRE ELLAS: la frescura es el fondo menos lo reciente, el hecho de
// abajo cita el 26 % que le falta a la cobertura, y el sueño de 6,4 h del que
// habla la afirmación es el mismo que pinta el bloque del cuerpo.
enum EscenariosDelCuerpo {

    /// El día del volcado. Fijo, porque las series cuelgan de él.
    static let hoy = "2026-08-13"

    /// Las bandas del cociente de ESTE coach. Otro entrenador competente trabaja a
    /// 0,7/1,5, así que viajan con el payload y no viven en el binario.
    static let metodo = MetodoAnalitico(acrLow: 0.8, acrHigh: 1.3)

    /// La ventana declarada del bloque. Doce semanas y dos años se dibujan igual de
    /// largas: una curva sin su ventana miente por omisión.
    static let ventana = "12 semanas"

    // MARK: - Cómo llegas hoy

    /// 62 SOBRE 100 — «con cuidado», y con la palanca a la vista. El check-in está
    /// sin contestar a propósito: es la única acción que el atleta tiene en este
    /// bloque (el resto lo mide el reloj), así que es el estado que hay que mirar.
    ///
    /// El pulso en reposo llega SIN media personal porque el modelo no la tiene: se
    /// enseña el valor y no se fabrica un «vs tu media» que nadie ha calculado.
    static var comoLlegaHoy: DailyReadinessPayload {
        DailyReadinessPayload(
            score: 62,
            recordedFor: hoy,
            delta7d: -5,
            breakdown: ReadinessBreakdown(
                subScore: nil, subScoreWeight: nil,
                hrvComponent: 58,
                sleepHours: 6.4, sleepComponent: 71,
                rhrComponent: 82, recoveryComponent: nil,
                hrvMs: 48, hrvBaselineMs: 55,
                rhrBpm: 52, sleepTargetH: 8,
                rhrLastBpm: nil, rhrLastOn: nil
            ),
            trend: dias(desde: hoy, [71, 74, 69, 72, 68, 70, 67, 65, 69, 64, 66, 63, 65, 62])
                .map { ReadinessTrendPoint(recordedFor: $0.t, score: Int($0.v ?? 0)) }
        )
    }

    // MARK: - Vas a más o te pasas

    /// LAS SEIS LECTURAS DE CARGA, con las cifras cuadradas entre sí: el fondo va
    /// por 62,4, lo reciente por 78,2 y la frescura es exactamente la resta.
    static var lecturasDeCarga: [LecturaAnalitica] {
        let cob = CoberturaDeLectura(muestras: 41, diasVentana: 84, diasConDato: 41,
                                     pct: 48.8, falta: nil)
        let fondo = dias(desde: hoy, [51.2, 52.8, 54.1, 55.9, 57.2, 58.1, 58.9, 59.7,
                                      60.4, 61.2, 61.8, 62.4])
        let reciente = dias(desde: hoy, [44.6, 51.3, 58.2, 61.7, 66.4, 63.9, 69.8, 72.1,
                                         70.4, 74.6, 76.9, 78.2])
        let frescura = zip(fondo, reciente).map { PuntoDeSerie(t: $0.t, v: ($0.v ?? 0) - ($1.v ?? 0)) }
        let rampa = dias(desde: hoy, [2.1, 2.6, 3.4, 3.9, 4.6, 5.1, 5.8, 6.2, 6.5, 6.9, 7.1, 7.3])

        return [
            LecturaAnalitica(
                id: "carga.fondo", grupo: .carga, tituloEs: "Fondo", estado: .medida,
                dato: DatoDeLectura(valor: 62.4, unidad: .tss, referencia: nil),
                serie: SerieDeLectura(unidad: .tss, paso: .dia, puntos: fondo),
                reparto: nil, cobertura: cob,
                procedencia: ProcedenciaDeLectura(
                    de: "banister_ctl",
                    explicaEs: "Media móvil de 42 días de la carga diaria: el trabajo que ya tiene encima.",
                    medida: true, proveedor: nil)
            ),
            LecturaAnalitica(
                id: "carga.reciente", grupo: .carga, tituloEs: "Reciente", estado: .medida,
                dato: DatoDeLectura(valor: 78.2, unidad: .tss, referencia: nil),
                serie: SerieDeLectura(unidad: .tss, paso: .dia, puntos: reciente),
                reparto: nil, cobertura: cob,
                procedencia: ProcedenciaDeLectura(
                    de: "banister_atl",
                    explicaEs: "Media móvil de 7 días: el cansancio que aún arrastra.",
                    medida: true, proveedor: nil)
            ),
            LecturaAnalitica(
                id: "carga.frescura", grupo: .carga, tituloEs: "Frescura", estado: .medida,
                // Se lee contra CERO, y la referencia viaja para que ningún cliente
                // invente su propio corte entre «descansado» y «cargado».
                dato: DatoDeLectura(valor: -15.8, unidad: .tss,
                                    referencia: ReferenciaDeLectura(valor: 0, delta: -15.8, de: "equilibrio")),
                serie: SerieDeLectura(unidad: .tss, paso: .dia, puntos: frescura),
                reparto: nil, cobertura: cob,
                procedencia: ProcedenciaDeLectura(
                    de: "banister_tsb",
                    explicaEs: "El fondo menos lo reciente. En positivo llega descansado; en negativo, cargado.",
                    medida: true, proveedor: nil)
            ),
            LecturaAnalitica(
                id: "carga.subida", grupo: .carga, tituloEs: "Ritmo de subida", estado: .medida,
                dato: DatoDeLectura(valor: 7.3, unidad: .tssSemana,
                                    referencia: ReferenciaDeLectura(valor: 5, delta: 2.3, de: "aviso_del_coach")),
                serie: SerieDeLectura(unidad: .tssSemana, paso: .dia, puntos: rampa),
                reparto: nil, cobertura: cob,
                procedencia: ProcedenciaDeLectura(
                    de: "banister_ramp",
                    explicaEs: "Cuánto ha crecido el fondo en la última semana. Sube el listón, no lo que ya hizo.",
                    medida: true, proveedor: nil)
            ),
            LecturaAnalitica(
                id: "carga.cociente", grupo: .carga, tituloEs: "Reciente contra fondo", estado: .medida,
                // 1,42 se sale del 1,3 del coach: la cifra avisa y el banderín cae
                // fuera de la banda, que es la mitad del punto de dibujarla.
                dato: DatoDeLectura(valor: 1.42, unidad: .ratio, referencia: nil),
                // Un cociente no es una curva: sin serie, y eso es legítimo.
                serie: nil, reparto: nil, cobertura: cob,
                procedencia: ProcedenciaDeLectura(
                    de: "acr_7_28",
                    explicaEs: "La carga de los últimos 7 días dividida por la semana media de los últimos 28.",
                    medida: true, proveedor: nil)
            ),
            LecturaAnalitica(
                id: "carga.cobertura", grupo: .carga,
                tituloEs: "Cuánto de esto se ha medido", estado: .medida,
                dato: DatoDeLectura(valor: 74.2, unidad: .pct,
                                    referencia: ReferenciaDeLectura(valor: 51.4, delta: 22.8,
                                                                    de: "medido_por_instrumento")),
                serie: nil,
                reparto: RepartoDeLectura(unidad: .segundos, total: 36_000, partes: [
                    ParteDeReparto(code: "medido", etiquetaEs: "Medido con ritmo o pulso",
                                   valor: 21_600, pct: 60),
                    ParteDeReparto(code: "declarado", etiquetaEs: "Puntuado por ti",
                                   valor: 5_112, pct: 14.2),
                    ParteDeReparto(code: "sin_precio", etiquetaEs: "Sin puntuar ni medir",
                                   valor: 9_288, pct: 25.8),
                ]),
                cobertura: CoberturaDeLectura(muestras: 19, diasVentana: 28, diasConDato: 19,
                                              pct: 67.8, falta: nil),
                procedencia: ProcedenciaDeLectura(
                    de: "cobertura_carga",
                    explicaEs: "Segundos entrenados en 28 días que entran en los números de arriba.",
                    medida: true, proveedor: nil)
            ),
        ]
    }

    /// DOS AFIRMACIONES, Y NO SE TIRA LA SEGUNDA. La primera es el sujeto del bloque
    /// y va en display; la segunda baja bajo la lectura que CITA, que es justo donde
    /// el atleta puede comprobarla. Quedarse solo con una sería tragarse una
    /// petición concreta que podía atender hoy.
    static var hechos: [Hecho] {
        [
            Hecho(id: "cruce.subida_sin_descanso",
                  fraseEs: "Has subido un 30 % en dos semanas y duermes 6,4 h, por debajo de tus 8.",
                  pideEs: "Aprieta menos esta semana.",
                  de: ["carga.fondo", "recuperacion.sueno"],
                  tono: .aviso),
            Hecho(id: "cobertura.ciega",
                  fraseEs: "Un 26 % de lo que entrenas no entra en estos números.",
                  pideEs: "Puntúa el esfuerzo de las sesiones que no mide ningún aparato.",
                  de: ["carga.cobertura"],
                  tono: .nota),
        ]
    }

    // MARK: - Las piezas

    /// Una serie DIARIA que acaba hoy. El paso decide la forma del gráfico —diario
    /// es línea, semanal son barras—, así que las fechas no son decoración: si
    /// mienten, el dibujo miente con ellas.
    static func dias(desde iso: String, _ valores: [Double]) -> [PuntoDeSerie] {
        let ultimo = FechaES.fecha(iso) ?? Date()
        return valores.enumerated().map { i, valor in
            let atras = valores.count - 1 - i
            return PuntoDeSerie(t: FechaES.iso(ultimo.addingTimeInterval(-Double(atras) * 86_400)),
                                v: valor)
        }
    }
}
