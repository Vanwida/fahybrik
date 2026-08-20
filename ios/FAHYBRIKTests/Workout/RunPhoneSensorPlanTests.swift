import XCTest
@testable import FAHYBRIK

// CARD 101: «a mitad del run el reloj no marca distancia ni ritmo; el iPhone pinta
// mapa y tiempo, el reloj va vacío». La causa: `updateRunGPS()` apagaba el
// podómetro con la MISMA guarda que apagaba el GPS propio de la vista — "¿posee la
// pantalla de calle la superficie ahora mismo?" — y en el caso normal (un run
// recto en calle, sin relevo ni EMOM) esa pregunta es SIEMPRE que sí, así que
// `pedometro.start()` era código inalcanzable. Estos tests fijan el guion correcto
// en `RunPhoneSensorPlan`, independiente de la pantalla.
final class RunPhoneSensorPlanTests: XCTestCase {

    // EL BUG EN SÍ: calle, con la pantalla de calle pintando (el caso normal de un
    // run recto). El podómetro tiene que estar vivo — es la ÚNICA fuente de metros
    // oficiales en calle (`RunDistanceAuthority`). Con el código de antes del
    // arreglo esto daba `pedometer == false`.
    func testStreetRunWithStreetScreenOwningTheSurfaceKeepsThePedometerAlive() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .outdoor,
            streetScreenOwnsSurface: true,
            wristIsRecording: false
        )
        XCTAssertTrue(plan.pedometer, "los metros de calle no pueden depender de qué pantalla está montada")
        XCTAssertFalse(plan.ownGPS, "la pantalla de calle ya tiene su propio GPS vivo — dos duplicarían la velocidad")
        XCTAssertTrue(plan.altimeter, "el barómetro va con la calle")
    }

    // Un tramo de correr en calle SIN pantalla de calle dueña (el relevo entre
    // compañeros, o el hueco antes de que arranque el bloque): aquí no hay otro
    // `RunLocationProvider` vivo, así que el de esta vista tiene que encenderse
    // también, no sólo el podómetro.
    func testStreetRunWithoutTheStreetScreenAlsoOwnsItsOwnGPS() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .outdoor,
            streetScreenOwnsSurface: false,
            wristIsRecording: false
        )
        XCTAssertTrue(plan.pedometer)
        XCTAssertTrue(plan.ownGPS, "sin la pantalla de calle, nadie más alimenta la velocidad")
        XCTAssertTrue(plan.altimeter)
    }

    // CINTA ENCHUFADA: la máquina (FTMS) firma la distancia. Ni podómetro ni GPS —
    // el ruido de GPS en interior se leería como ritmo fantasma.
    func testConnectedTreadmillKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .treadmill,
            streetScreenOwnsSurface: false,
            wristIsRecording: false
        )
        XCTAssertEqual(plan, .allOff)
    }

    // CINTA TONTA: sin FTMS y sin GPS propio — el reloj (HKWorkout indoor) es la
    // única fuente, y ninguna vive en el teléfono.
    func testDumbTreadmillKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .indoor,
            streetScreenOwnsSurface: false,
            wristIsRecording: false
        )
        XCTAssertEqual(plan, .allOff)
    }

    // Fuera de un tramo de correr (fuerza, erg, EMOM no-running) nada se enciende,
    // sea cual sea la respuesta guardada de una carrera anterior en la misma sesión.
    func testNonRunSegmentKeepsEveryPhoneSensorOffRegardlessOfEnvironment() {
        for env: RunEnvironment? in [nil, .outdoor, .treadmill, .indoor] {
            let plan = RunPhoneSensorPlan.decide(
                isRunSegment: false,
                environment: env,
                streetScreenOwnsSurface: false,
                wristIsRecording: false
            )
            XCTAssertEqual(plan, .allOff, "sin tramo de correr, \(String(describing: env)) no enciende nada")
        }
    }

    // Tramo de correr sin respuesta todavía a «¿dónde corres?» — la puerta del
    // bloque no se ha contestado. No se adivina: nada se enciende.
    func testRunSegmentWithNoEnvironmentAnswerYetKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: nil,
            streetScreenOwnsSurface: false,
            wristIsRecording: false
        )
        XCTAssertEqual(plan, .allOff)
    }

    // CARD 119 — UNA SOLA FUENTE DE METROS. Con la muñeca grabando, sus metros
    // (`distanceWalkingRunning` del `HKLiveWorkoutBuilder`, que ahora el teléfono sí
    // lee del canal del espejo) son los oficiales: el podómetro del teléfono mide
    // exactamente lo mismo con el mismo motor de Apple, así que dejarlo vivo haría
    // que la carrera contase cada metro dos veces. La velocidad y el desnivel NO se
    // tocan: de eso sigue encargándose el teléfono.
    func testStreetRunWithTheWristRecordingStandsThePedometerDown() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .outdoor,
            streetScreenOwnsSurface: false,
            wristIsRecording: true
        )
        XCTAssertFalse(plan.pedometer, "con la muñeca emitiendo metros, el podómetro sumaría los mismos otra vez")
        XCTAssertTrue(plan.ownGPS, "la velocidad la sigue midiendo el teléfono")
        XCTAssertTrue(plan.altimeter, "el desnivel también")
    }

    // Y en cinta tonta con muñeca no cambia nada respecto a sin muñeca: los sensores
    // del teléfono siguen apagados (el móvil no va en el cuerpo). Los metros llegan
    // por el canal del espejo, no por un sensor de este aparato — que es justo lo que
    // hace que este caso pasara de cero metros a tenerlos.
    func testDumbTreadmillWithTheWristRecordingStillKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .indoor,
            streetScreenOwnsSurface: false,
            wristIsRecording: true
        )
        XCTAssertEqual(plan, .allOff)
    }
}
