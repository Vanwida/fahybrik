import Foundation

// LA FICHA, LEÍDA — lo que se enseña de una sesión ANTES de empezarla, ya decidido.
//
// Espejo Swift de `web/components/design-twin/kit-ficha/contrato.ts` (el doble: `/design/ficha-ruta`,
// la propuesta B que firmó Alex el 2-oct). La vista PINTA esto y no decide nada: cuánto dura, qué formato
// tiene un bloque, cuál es la dosis de un movimiento y cuál es el sobrante que no se enseña se deciden aquí,
// en funciones puras (`LecturaFicha+Desde.swift`), con los MISMOS formateadores que usan el motor y el vivo
// (`PrescriptionRenderer`, `block.alternatingEmom`, `block.supersetFold`): la ficha no puede contar una
// sesión y el entreno otra.
//
// LO QUE NO SE INVENTA (CONTRATO-UI §7, «"No se sabe" es un valor de primera clase»):
//   · la duración: o la escribe el coach o se dice POR QUÉ no hay (`DuracionDeSesion`), jamás una estimada;
//   · una dosis que el coach no escribió: `dosis == nil` se pinta como el nombre solo, no como «— reps» ni un 0;
//   · un vídeo que no existe: sin vídeo la miniatura es una loseta de la modalidad, no un gesto dibujado.
//
// LO QUE EL DOBLE ENSEÑA Y ESTA LECTURA TODAVÍA NO TRAE (declarado, no olvidado; DECISIONS 2-oct):
//   · el MATERIAL («Prepara · barra · discos»): no existe como dato del ejercicio en la base;
//   · «LA ÚLTIMA VEZ» de la sesión y de un ejercicio: no hay endpoint que lo sirva a la ficha.

struct LecturaFicha: Equatable {

    // MARK: - La cabecera

    enum Origen: Equatable {
        /// La sesión la montó un coach. `nombre` nil = la ficha no sabe cómo se llama (no se inventa uno).
        case coach(nombre: String?)
        /// Un entreno libre: nadie detrás, así que tampoco una nota firmada.
        case libre
    }

    /// Cuánto dura, ya dicho. El texto es el MISMO que pinta el Plan (`DuracionDeSesion.texto`): «≈ 55 min»
    /// o la razón por la que no hay número («Dura lo que tardes»).
    struct Duracion: Equatable {
        let texto: String
        /// Solo una duración con cifra se acentúa; una razón («Dura lo que tardes») no es un dato.
        let llevaNumero: Bool
    }

    struct Nota: Equatable {
        let texto: String
        /// El nombre del coach, si se sabe. Sin él la nota no lleva firma (no se atribuye a «tu coach» una frase suya).
        let firma: String?
    }

    /// Con quién se entrena en Dobles. `nombre` nil = la ficha no lo sabe (se dice «Dobles» a secas).
    struct Pareja: Equatable {
        let nombre: String?
    }

    struct Cabecera: Equatable {
        let titulo: String
        /// «Hoy», «Mañana»… Nil cuando quien abre la ficha no lo sabe (un libre).
        let cuando: String?
        let origen: Origen
        let duracion: Duracion?
        let nota: Nota?
        /// Una prueba (una marca, un test): se mide, no tiene camino a mano.
        let prueba: Bool
        /// Entrenas en pareja (Dobles). Nil = en solitario.
        let pareja: Pareja?
        /// Cuántos bloques de TRABAJO hay (sin calentamiento ni vuelta a la calma): solo se dice si son varios.
        let bloquesDeTrabajo: Int
    }

    /// Por qué no hay bloques que enseñar. «No se sabe» es un valor de primera clase, pero ESTO sí se sabe, y la ficha
    /// no puede decir que falló la conexión cuando lo que pasa es que el coach solo escribió la nota.
    enum SinDetalle: Equatable {
        /// El detalle de la asignación no llegó (primera apertura sin red).
        case noLlego
        /// Llegó, y la sesión no lleva ejercicios.
        case sinEjercicios
    }

    let cabecera: Cabecera
    /// Vacío = «sin detalle»: se dice, no se inventa una lista.
    let bloques: [BloqueFicha]
    /// El detalle de la asignación llegó (aunque no traiga ejercicios).
    let detalleCargado: Bool

    /// Nil cuando hay bloques.
    var sinDetalle: SinDetalle? {
        guard bloques.isEmpty else { return nil }
        return detalleCargado ? .sinEjercicios : .noLlego
    }

    /// La ruta (un nodo por bloque) solo existe cuando hay un orden que enseñar: con UN bloque la ficha se lee directa.
    var llevaRuta: Bool { bloques.count > 1 }

    /// El bloque con el que se abre: el primero de TRABAJO (el calentamiento está a un toque a la izquierda);
    /// si todo es calentamiento o calma, el primero.
    var bloqueInicial: BloqueFicha.ID? {
        (bloques.first { $0.rol == .principal } ?? bloques.first)?.id
    }
}

// MARK: - Un bloque

struct BloqueFicha: Identifiable, Equatable {

    enum Rol: Equatable { case calentamiento, principal, vuelta }

    /// La FORMA del bloque (lo que el coach llama su formato). Decide qué panel pinta la vista y NADA más: lo que dice cada panel sale de los
    /// campos de los movimientos.
    enum Forma: Equatable {
        /// Fuerza y accesorios: cada movimiento con sus series.
        case series
        /// Los ejercicios ROTAN (A1 serie 1 → A2 serie 1 → descanso → A1 serie 2…). `descanso`: el de al acabar cada
        /// ronda, cuando es el mismo en todas («1:30»); nil si cambia de una ronda a otra o el coach no lo escribió.
        case superserie(rondas: Int?, descanso: String?)
        /// Cada minuto toca un movimiento. `alterna`: más de uno (impar / par…).
        case emom(minutos: Int?, alterna: Bool)
        /// Un reloj que manda (AMRAP, For Time, circuito, Tabata, Death By): lo grande y su pie.
        case reloj(Reloj)
        /// Una carrera o un ergo por tramos: el perfil manda.
        case intervalos
        /// Rodaje, tirada, ergo continuo.
        case continuo
        /// Simulación tipo HYROX: N estaciones precedidas de la misma carrera. `carrera` = «1 km».
        case estaciones(carrera: String)
        /// Calentamiento y vuelta a la calma: se leen de una vez, ítem a ítem sin ceremonia.
        case marco
    }

    /// El reloj de un formato con tiempo: la cifra que lo define y qué formato es.
    struct Reloj: Equatable {
        /// «12:00», «3 rondas», «20/10».
        let grande: String
        /// «AMRAP», «Tope 14 min», «Tabata · 8 rondas».
        let pie: String
    }

    let id: String
    let titulo: String
    let rol: Rol
    let forma: Forma
    /// La chapa del formato sobre el contenido. Solo cuando el panel no lo dice ya por sí mismo: un reloj o
    /// una pista de minutos llevan su formato dentro, y repetirlo en una chapa es decir lo mismo dos veces.
    let etiquetaFormato: String?
    /// Qué significa el formato, para quien no lo conoce: una frase, la misma siempre. Nil = no hace falta.
    let explicacion: String?
    /// Lo que dice el nodo de la ruta debajo del nombre: «12 min», «8 estaciones», «6 × 800 m», «3 ejercicios».
    let resumen: String
    /// La nota del coach para ESTE bloque.
    let nota: String?
    let movimientos: [MovimientoFicha]
}

// MARK: - Un movimiento

struct MovimientoFicha: Identifiable, Equatable {

    /// Una serie escrita una a una: solo cuando NO son todas iguales (rampa, pirámide).
    struct Serie: Equatable {
        let trabajo: String?
        let carga: String?
        let descanso: String?
    }

    /// El %RM resuelto a kilos con TU 1RM («Según tu 1RM»). Solo si el servidor lo resolvió.
    struct SegunTuRm: Equatable {
        let kg: String
        /// El 1RM es una estimación pendiente de confirmar por el coach.
        let sinConfirmar: Bool
    }

    /// La forma de una carrera o un ergo por tramos: «repite N veces esto».
    struct Perfil: Equatable {
        let repeticiones: Int
        /// «500 m», «800 m», «3:00».
        let medida: String
        let zona: HRZone?
        /// Ritmo del trabajo ya escrito («@ 4:10/km») cuando TODOS los tramos llevan el mismo.
        let ritmo: String?
        /// «recuperación 1:30 suave», «descanso 2:00». Nil si la estructura no declara recuperación.
        let recuperacion: String?
        /// Una recuperación que se TROTA no se dibuja como un descanso.
        let recuperacionActiva: Bool
    }

    /// Lo que le toca a cada uno cuando se entrena en pareja (Dobles).
    enum Reparto: Equatable {
        /// Tu parte (en la unidad de la dosis) de un total.
        case mitad(tuParte: String, total: String)
        /// La estación entera es tuya.
        case tuya
        /// La hace tu pareja: no te toca ni un metro.
        case suya(nombre: String?)
    }

    let id: String
    /// El ítem del servidor: de él salen la ficha de técnica (`ExerciseDetailView`) y la miniatura de vídeo.
    let item: WorkoutItem
    let modalidad: PrescriptionModality
    /// La dosis escrita («4 × 5», «45:00», «500 m», «100 reps»). Nil = el coach no la escribió.
    let dosis: String?
    /// Contra qué: kilos, ritmo, RPE, %RM («100 kg», «@ 4:35/km»). Con %RM resuelto, los KILOS.
    let contra: String?
    let zona: HRZone?
    /// Su papel dentro del bloque cuando el bloque los reparte: «1º» en una superserie, «Min impar» en un EMOM que alterna.
    let rol: String?
    /// La segunda línea del nombre: el %RM, el tempo y el descanso, ya compuestos.
    let secundaria: String?
    /// Series una a una, solo cuando difieren (la dosis resume: «5 × 5»).
    let series: [Serie]
    /// «60 → 80 kg» cuando la carga sube (o baja) de serie a serie.
    let rangoDeCarga: String?
    let segunTuRm: SegunTuRm?
    let perfil: Perfil?
    let reparto: Reparto?
    /// Lo que el coach escribió PARA ESTE movimiento hoy.
    let nota: String?

    var nombre: String { item.exerciseName }
    /// ¿Hay ficha de técnica que abrir? (vídeo, descripción, claves o nota).
    var tieneTecnica: Bool { LecturaEjercicioPrevia.tieneTecnica(item) }
}
