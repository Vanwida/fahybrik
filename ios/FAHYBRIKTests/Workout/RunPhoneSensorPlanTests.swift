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
            streetScreenOwnsSurface: true
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
            streetScreenOwnsSurface: false
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
            streetScreenOwnsSurface: false
        )
        XCTAssertEqual(plan, .allOff)
    }

    // CINTA TONTA: sin FTMS y sin GPS propio — el reloj (HKWorkout indoor) es la
    // única fuente, y ninguna vive en el teléfono.
    func testDumbTreadmillKeepsEveryPhoneSensorOff() {
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: true,
            environment: .indoor,
            streetScreenOwnsSurface: false
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
                streetScreenOwnsSurface: false
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
            streetScreenOwnsSurface: false
        )
        XCTAssertEqual(plan, .allOff)
    }
}
