import Foundation
@testable import FAHYBRIK

// LOS ESCENARIOS DE CORRER — los casos de diseño de las pantallas de carrera, en
// un sitio.
//
// Hermano de `EscenariosCiclo` y `EscenariosComunicados`, y por lo mismo: el
// volcado visual y las pruebas de lectura tienen que mirar EL MISMO atleta, o
// dejan de decir nada la una de la otra.
//
// LOS TRES ESTADOS DE `AnaliticasCorrerView` NO SON «UNO BUENO Y DOS ROTOS».
// Son la misma pantalla diciendo tres verdades distintas, y las dos de abajo son
// las que más se ven: el que no ha hecho el test de zonas y el que lleva tres
// semanas son la mayoría de los atletas nuevos.
//
//   lleno          — todo medido: veredicto con su marca, las cuatro curvas, el
//                    reparto contra el objetivo del coach y el material de abajo.
//   sinTestDeUmbral— sin ancla de pulso se caen FORMA y REPARTO por la misma
//                    razón, así que sale UN botón, no dos textos pidiendo el
//                    mismo test. Es la que prueba la honestidad de la pantalla.
//   pocaHistoria   — tres semanas: no hay veredicto que dar y se dibuja el plazo.
//                    No hay botón, porque esperar no es una acción.
//
// LOS NÚMEROS SON COHERENTES ENTRE SÍ A PROPÓSITO. El delta de esfuerzos son los
// 42 s que separan el 5 km de hoy del de la ventana anterior; el peldaño «al
// pulso» son los 11 s/km que la serie de `alPulso` gana en ocho semanas; el
// reparto de la barra sale de los mismos segundos por zona que el porcentaje
// suave. Un escenario con cifras que se contradicen enseña una pantalla que en
// producción no puede existir, y entonces no se puede juzgar su acabado.
enum EscenariosDeCorrer {

    /// El instante fijo del volcado. Una fecha que cambia con el día en que se
    /// corra no fija nada.
    static let generado = "2026-08-13T09:12:00.000Z"

    // MARK: - Lo que el coach decide (método, no mecanismo)

    /// Los umbrales de ESTE coach, ya resueltos. Viajan con el payload para que ni
    /// un número de juicio viva en el binario del atleta.
    static let metodo = CoachRunningThresholds(
        minWeeksToJudge: 6,
        meaningfulGainSPerKm: 3,
        volumeSurgeRatio: 0.3,
        goodInBandPct: 75,
        minRepsToJudgeBand: 8,
        minPairsForCompromisedTrend: 3
    )

    /// El reparto que este coach persigue. La marca sobre la barra sale de aquí.
    static let objetivoDeReparto = RunningProgressPayload.Reparto(low: 80, mid: 12, high: 8)

    // MARK: - 1 · TODO MEDIDO

    /// El atleta con 28 semanas encima, test de zonas hecho y banda de pulso: la
    /// pantalla al completo, que es contra la que se juzga el acabado.
    static var lleno: RunningProgressPayload {
        RunningProgressPayload(
            athleteId: "67",
            generatedAtIso: generado,
            windowWeeks: 12,
            method: metodo,
            history: RunningHistory(
                semanas: 28,
                zonasMedidas: true,
                conPulso: true,
                ppmReferencia: 148,
                zonaReferencia: 2,
                vo2: Vo2Lectura(valor: 52.4, delta: 1.8, ventanaSemanas: 12),
                // El ritmo al mismo pulso, semana a semana: de 5:12 a 4:54. Es la
                // serie de la que sale el peldaño del veredicto.
                alPulso: semanas([312, 309, 311, 306, 305, 303, 304, 300, 299, 301, 297, 294]),
                esfuerzos: [
                    Esfuerzo(metros: 400, segundos: 74),
                    Esfuerzo(metros: 1000, segundos: 205),
                    Esfuerzo(metros: 3000, segundos: 660),
                    Esfuerzo(metros: 5000, segundos: 1152),   // 19:12
                ],
                // La sombra de hace un mes. El 5 km iba 42 s más lento: ese es el
                // delta que la pantalla pinta bajo el titular del bloque.
                esfuerzosAntes: [
                    Esfuerzo(metros: 400, segundos: 77),
                    Esfuerzo(metros: 1000, segundos: 213),
                    Esfuerzo(metros: 3000, segundos: 690),
                    Esfuerzo(metros: 5000, segundos: 1194),
                ],
                semanasKm: semanas([33, 36, 39, 28, 38, 41, 44, 31, 42, 45, 47, 49]),
                zonasS: ["z1": 12_000, "z2": 45_000, "z3": 9_600, "z4": 4_200, "z5": 1_200],
                // 1.800 s por encima de lo clasificado: las salidas sin pulso, que
                // la barra dibuja como el hueco que son en vez de repartirlas.
                segundosCorriendo: 73_800,
                pedido: Pedido(evaluadas: 48, dentro: 39, fueraLento: 6, fueraRapido: 3,
                               pctEnBanda: 81.3, juzgable: true),
                cansado: [
                    PuntoCansado(semana: "2026-07-06", costeSKm: 14.8, parejas: 2),
                    PuntoCansado(semana: "2026-07-13", costeSKm: 13.9, parejas: 3),
                    PuntoCansado(semana: "2026-07-20", costeSKm: 12.6, parejas: 3),
                    PuntoCansado(semana: "2026-07-27", costeSKm: 12.1, parejas: 2),
                    PuntoCansado(semana: "2026-08-03", costeSKm: 10.8, parejas: 4),
                    PuntoCansado(semana: "2026-08-10", costeSKm: 9.6, parejas: 3),
                ],
                carrera: CarreraObjetivo(nombre: "Mitja de Barcelona", dias: 47, predichoS: 5_190),
                mismoTipo: RunningHistory.MismoTipo(tipo: "intervals", ganaSKm: 4),
                umbral: UmbralRitmo(ritmoSKm: 246, vdot: 51, vdotDesde: "de tu 10 km",
                                    origen: "athlete_test", sinRevisar: false),
                zonasRitmo: zonasDeRitmo,
                cadencia: semanas([171, 172, 172, 174, 173, 175, 176, 177]),
                porTipo: [
                    TipoMedia(tipo: "steady", ritmoSKm: 312, metros: 214_000, sesiones: 31),
                    TipoMedia(tipo: "intervals", ritmoSKm: 218, metros: 46_000, sesiones: 14),
                    TipoMedia(tipo: "for_time", ritmoSKm: 236, metros: 21_000, sesiones: 4),
                ]
            ),
            verdict: Veredicto(clase: .mejor, frase: "Vas mejor",
                               peldano: .alPulso(ganaSKm: 11, semanas: 8), plazo: nil),
            coverage: Cobertura(forma: nil, esfuerzos: nil, volumen: nil,
                                reparto: nil, pedido: nil, cansado: nil),
            deltas: Deltas(
                volumen: Deltas.SubidaDeVolumen(subidaRatio: 0.19, semanas: 4),
                // Nulo porque el titular de Forma lo pone el VO₂máx, y mandar dos
                // deltas para el mismo titular es lo que el contrato prohíbe.
                forma: nil,
                esfuerzos: Deltas.GananciaDeEsfuerzo(ganaS: 42, metros: 5000),
                cansado: Deltas.MejoraCansado(mejoraSKm: 5.2, semanas: 6)
            ),
            polarization: RunningProgressPayload.Polarizacion(
                pct: RunningProgressPayload.Reparto(low: 79, mid: 13, high: 8),
                target: objetivoDeReparto,
                lowMaxZone: 2,
                midMaxZone: 3
            )
        )
    }

    // MARK: - 2 · SIN TEST DE UMBRAL

    /// EL MISMO ATLETA SIN ANCLA DE PULSO. Corre lo mismo y sus esfuerzos son los
    /// mismos, pero nadie sabe qué es «suave» para él: se caen FORMA y REPARTO por
    /// la misma razón, y el veredicto baja al peldaño que sí se sostiene — sus
    /// mejores esfuerzos, con la marca colgando de esa curva.
    ///
    /// El umbral de RITMO sí lo tiene, derivado en el alta y sin confirmar: son dos
    /// anclas distintas, y confundirlas sería apagarle una lectura por un test que
    /// no era el que le faltaba.
    static var sinTestDeUmbral: RunningProgressPayload {
        let base = lleno
        return RunningProgressPayload(
            athleteId: base.athleteId,
            generatedAtIso: generado,
            windowWeeks: base.windowWeeks,
            method: metodo,
            history: RunningHistory(
                semanas: base.history.semanas,
                zonasMedidas: false,
                conPulso: false,
                // 0 = no hay ancla. Es el único centinela del payload, y por eso no
                // se usa para preguntar si la hay: eso lo dicen los dos de arriba.
                ppmReferencia: 0,
                zonaReferencia: nil,
                vo2: nil,
                alPulso: [],
                esfuerzos: base.history.esfuerzos,
                esfuerzosAntes: base.history.esfuerzosAntes,
                semanasKm: base.history.semanasKm,
                // Vacío del todo, nunca cinco ceros: sin ancla no hay zonas que
                // repartir, que es distinto de haber corrido cero en todas.
                zonasS: [:],
                segundosCorriendo: 0,
                pedido: nil,
                cansado: [],
                carrera: base.history.carrera,
                mismoTipo: nil,
                umbral: UmbralRitmo(ritmoSKm: 252, vdot: 49, vdotDesde: "de tu 10 km",
                                    origen: "onboarding_auto", sinRevisar: true),
                zonasRitmo: zonasDeRitmo,
                cadencia: base.history.cadencia,
                porTipo: base.history.porTipo
            ),
            verdict: Veredicto(clase: .mejor, frase: "Vas mejor",
                               peldano: .esfuerzos(ganaS: 42, metros: 5000), plazo: nil),
            coverage: Cobertura(
                forma: .ancla,
                esfuerzos: nil,
                volumen: nil,
                reparto: .ancla,
                // Nadie le ha pedido nunca un ritmo y nunca corrió cansado: esas dos
                // lecturas no existen en su vida y la app SE CALLA, ni un hueco.
                pedido: .intencion,
                cansado: .ocasion
            ),
            deltas: Deltas(
                volumen: Deltas.SubidaDeVolumen(subidaRatio: 0.19, semanas: 4),
                forma: nil,
                esfuerzos: Deltas.GananciaDeEsfuerzo(ganaS: 42, metros: 5000),
                cansado: nil
            ),
            polarization: RunningProgressPayload.Polarizacion(
                // Nulo, nunca 0/0/0: un reparto que suma cero no es equilibrado, es
                // que no se sabe.
                pct: nil,
                target: objetivoDeReparto,
                lowMaxZone: 2,
                midMaxZone: 3
            )
        )
    }

    // MARK: - 3 · POCA HISTORIA

    /// TRES SEMANAS. No le falta un test: le falta TIEMPO, y eso se dibuja como una
    /// barra que se llena en vez de escribirse. No hay botón —esperar no es una
    /// acción— y el lienzo se queda casi neutro, porque el tono del apagado también
    /// es dato.
    static var pocaHistoria: RunningProgressPayload {
        RunningProgressPayload(
            athleteId: "88",
            generatedAtIso: generado,
            windowWeeks: 12,
            method: metodo,
            history: RunningHistory(
                semanas: 3,
                zonasMedidas: true,
                conPulso: true,
                ppmReferencia: 148,
                zonaReferencia: 2,
                vo2: nil,
                alPulso: [],
                esfuerzos: [],
                esfuerzosAntes: [],
                semanasKm: semanas([18, 24, 27]),
                zonasS: [:],
                segundosCorriendo: 0,
                pedido: nil,
                cansado: [],
                carrera: nil,
                mismoTipo: nil,
                umbral: nil,
                zonasRitmo: [],
                cadencia: [],
                porTipo: []
            ),
            verdict: Veredicto(clase: .aunNo, frase: "Aún no", peldano: nil,
                               plazo: Veredicto.Plazo(llevas: 3, hacen: 6)),
            // Las tres contables esperan LO MISMO —tiempo—, así que cuentan como una
            // sola razón y la pantalla no le ofrece una salida que no existe.
            coverage: Cobertura(
                forma: .historia(llevas: 3, hacen: 6),
                esfuerzos: .historia(llevas: 3, hacen: 6),
                volumen: nil,
                reparto: .historia(llevas: 3, hacen: 6),
                pedido: .intencion,
                cansado: .ocasion
            ),
            deltas: Deltas(volumen: nil, forma: nil, esfuerzos: nil, cansado: nil),
            polarization: RunningProgressPayload.Polarizacion(
                pct: nil, target: objetivoDeReparto, lowMaxZone: 2, midMaxZone: 3
            )
        )
    }

    // MARK: - Las piezas compartidas

    /// Las bandas de ritmo del atleta, con los colores que declara SU perfil — aquí
    /// el color es dato, porque lo que se mide ES la zona. Bordes absolutos: la más
    /// suave no tiene techo y la más dura no tiene suelo, y las dos se dicen
    /// abiertas en vez de fingir un borde que no existe.
    static let zonasDeRitmo: [ZonaRitmo] = [
        ZonaRitmo(code: "Z1", label: "Recuperación", color: "#6EA8FF", role: "recovery",
                  fastS: 330, slowS: nil, sortOrder: 1),
        ZonaRitmo(code: "Z2", label: "Fondo", color: "#4ADE80", role: "aerobic_base",
                  fastS: 288, slowS: 330, sortOrder: 2),
        ZonaRitmo(code: "Z3", label: "Medio", color: "#FACC15", role: "tempo",
                  fastS: 258, slowS: 288, sortOrder: 3),
        ZonaRitmo(code: "Z4", label: "Umbral", color: "#FB923C", role: "threshold",
                  fastS: 240, slowS: 258, sortOrder: 4),
        ZonaRitmo(code: "Z5", label: "VO₂ máx", color: "#F87171", role: "vo2max",
                  fastS: nil, slowS: 240, sortOrder: 5),
    ]

    /// Una serie semanal, con los lunes reales hacia atrás desde el 10 de agosto.
    /// La pantalla no dibuja ninguna fecha, pero el modelo las pide y ponerlas
    /// falsas sería fabricar semanas que no cuadran con la ventana declarada.
    static func semanas(_ valores: [Double]) -> [PuntoSemana] {
        let ultimo = FechaES.fecha("2026-08-10") ?? Date()
        return valores.enumerated().map { i, valor in
            let atras = valores.count - 1 - i
            let lunes = ultimo.addingTimeInterval(-Double(atras) * 7 * 86_400)
            return PuntoSemana(semana: FechaES.iso(lunes), valor: valor)
        }
    }
}
