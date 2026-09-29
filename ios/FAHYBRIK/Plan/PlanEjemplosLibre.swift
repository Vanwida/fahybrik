#if DEBUG
import Foundation

// LOS CASOS DE «PLAN» SIN COACH — el tier libre (`FreePlanView`), cuatro estados de la misma pantalla: sin nada
// medido (lo primero que ve todo el mundo), con carreras importadas (el retrato completo), en frío y el mínimo
// del mínimo (sin objetivo, sin VO₂ y con el catálogo de marcas caído). Sin coach NO hay chat, comunicados,
// revisión ni tests: la única pieza que habla de un coach es la de conversión, y va la última, sin nombre.
//
// Atletas inventados (CONTRATO-UI §7). Espejo de `web/components/design-twin/kit-plan/casos-libre.ts`.

struct CasoLibre: Identifiable {
    let id: String
    let titulo: String
    let lectura: LecturaLibre
}

extension EjemplosPlan {

    private static func marca(
        _ slug: String, _ etiqueta: String, como: String, dura: String, desbloquea: String,
        valor: String? = nil, cuando: String? = nil
    ) -> MarcaLibre {
        MarcaLibre(slug: slug, etiqueta: etiqueta, valor: valor, cuando: cuando, como: "\(como) · \(dura)", desbloquea: desbloquea, dura: dura)
    }

    private static let desbloqueaRitmos = "Mídelo y afinamos los ritmos de tu semana"
    private static func unKm(valor: String? = nil, cuando: String? = nil) -> MarcaLibre {
        marca("run_1k", "1 km", como: "Calle o cinta, la app lo mide sola", dura: "te lleva ~4-5 min", desbloquea: desbloqueaRitmos, valor: valor, cuando: cuando)
    }
    private static let remo500 = marca("row_500m", "Remo 500 m", como: "Con el remo conectado, la app lo mide sola", dura: "te lleva ~3 min", desbloquea: "Mídelo y tu semana gana la sesión de remo")
    private static let ski1000 = marca("ski_1k", "Ski 1.000 m", como: "Con el ski conectado, la app lo mide sola", dura: "te lleva ~5 min", desbloquea: "Mídelo y tu semana gana la sesión de ski")
    private static let cincoKm = marca("run_5k", "5 km", como: "Calle o cinta, la app lo mide sola", dura: "te lleva ~25 min", desbloquea: desbloqueaRitmos)

    /// La semana propia del atleta libre: solo lo que montó él.
    private static func semanaVacia() -> SemanaDelPlan {
        semana(lunes: lunes, hoy: hoy, dias: [[], [], [], [], [], [], []])
    }

    private static func semanaPropia() -> SemanaDelPlan {
        semana(lunes: lunes, hoy: hoy, dias: [
            [d(.libreRodaje, .hecha, libre: true)], [], [d(.libreRodaje, .pendiente, libre: true)], [],
            [d(.libreRodaje, .pendiente, libre: true)], [], [],
        ])
    }

    static let casosLibre: [CasoLibre] = [
        // ⑲ EL TIER LIBRE en su caso mínimo: primero lo que le DAMOS (el VO₂ máx de su reloj) y luego lo que le PEDIMOS.
        CasoLibre(id: "libre-sin-nada", titulo: "Marc · sin coach, sin nada medido", lectura: LecturaLibre(
            hoyIso: hoy,
            carrera: .fijada(CarreraDelPlanLibre(
                nombre: "HYROX Barcelona", dias: 68, categoria: "Individual · Open · Hombres", objetivo: "1:15:00",
                comparacion: nil, faltan: ["1 km", "Remo 500 m", "Ski 1.000 m"])),
            vo2: Vo2Reloj(etiqueta: "VO₂ máx", valor: "52,3", unidad: "ml/kg/min"),
            marcas: LecturaLibre.Marcas(medidas: [], faltan: [unKm(), remo500, ski1000, cincoKm], arranque: [unKm(), remo500, ski1000]),
            puedeImportar: true, semana: semanaVacia())),

        // ⑳ El retrato con evidencia: lo que sus carreras YA demuestran, su objetivo contra su realidad, la semana que compran…
        CasoLibre(id: "libre-con-carreras", titulo: "Roc · sin coach, con tres carreras importadas", lectura: LecturaLibre(
            hoyIso: hoy,
            carrera: .fijada(CarreraDelPlanLibre(
                nombre: "HYROX Valencia", dias: 34, categoria: "Dobles · Pro · Hombres", objetivo: "1:08:00",
                comparacion: .mejor(FinalDeCarrera(tiempoS: 3862, lugar: "Berlín", cuando: "may 2025", categoria: "dobles pro", equipo: true), deltaS: 218),
                faltan: [])),
            vo2: Vo2Reloj(etiqueta: "VO₂ máx", valor: "54,2", unidad: "ml/kg/min"),
            carrerasImportadas: 3,
            evidencia: EvidenciaDeCarreras(
                carreras: 3,
                mejorTiempo: FinalDeCarrera(tiempoS: 3862, lugar: "Berlín", cuando: "may 2025", categoria: "dobles pro", equipo: true),
                mejor8km: OchoKm(ritmoSKm: 252, totalS: 2016, lugar: "Berlín", suelo: true),
                ultimo8km: OchoKm(ritmoSKm: 258, totalS: 2064, lugar: "Málaga", suelo: true),
                transiciones: .init(segundos: 331, lugar: "Berlín"),
                tendencia: nil),
            semanaBloqueada: SemanaBloqueada(
                sesiones: [
                    SesionBloqueada(dia: "LUN", titulo: "Series de 1 km", detalle: "5 x 1 km a 4:05/km, 2:00 de recuperación"),
                    SesionBloqueada(dia: "MIÉ", titulo: "Fuerza: sentadilla", detalle: "4 x 6 con 105 kg (75% de tu máximo), RIR 2"),
                    SesionBloqueada(dia: "JUE", titulo: "Correr con estaciones", detalle: "4 rondas: 1 km a 4:40/km + 25 wall balls + 20 burpees con salto"),
                    SesionBloqueada(dia: "VIE", titulo: "Remo por series", detalle: "6 x 500 m a 1:52/500m, 1:30 de recuperación"),
                    SesionBloqueada(dia: "SÁB", titulo: "Rodaje largo", detalle: "60 min a 5:15/km"),
                ],
                visibles: 2, base: "Calculado con tus 8 km de Berlín"),
            marcas: LecturaLibre.Marcas(
                medidas: [unKm(valor: "3:38", cuando: "hace 3 semanas")], faltan: [remo500, ski1000, cincoKm],
                arranque: [unKm(valor: "3:38", cuando: "hace 3 semanas"), remo500, ski1000]),
            puedeImportar: false, semana: semanaPropia())),

        // ㉑ Todavía no sabemos si hay evidencia o no: un esqueleto con la forma final.
        CasoLibre(id: "libre-cargando", titulo: "Sin coach · arranque en frío", lectura: LecturaLibre(cargando: true, hoyIso: hoy)),

        // ㉒ EL MÍNIMO DEL MÍNIMO: sin carrera objetivo, sin VO₂, sin carreras y con el catálogo de marcas caído.
        CasoLibre(id: "libre-sin-nada-y-sin-red", titulo: "Marc · sin coach, sin nada y sin red", lectura: LecturaLibre(
            hoyIso: hoy,
            marcas: LecturaLibre.Marcas(falloCatalogo: true),
            puedeImportar: true, semana: semanaVacia())),
    ]

    static func casoLibre(_ id: String) -> CasoLibre {
        guard let c = casosLibre.first(where: { $0.id == id }) else { preconditionFailure("Caso libre desconocido: \(id)") }
        return c
    }
}

// ── MATRIZ ───────────────────────────────────────────────────────────────────
//  Sujeto        sin evidencia ⑲㉒ · con evidencia ⑳ · cargando ㉑
//  Tu carrera    fijada ⑲⑳ · comparación ⑳ · sin comparación (solo en pruebas) · sin objetivo ㉒
//  Lo que sabemos VO₂ ⑲⑳ · sin VO₂ (no se pinta)
//  Semana bloqueada ⑳ · sin semana (no se pinta: menos de dos sesiones personalizables)
//  Marcas        medidas ⑳ · sin medir ⑲ · catálogo caído ㉒ (con reintento)
//  Semana propia vacía ⑲ · con sesiones ⑳
#endif
