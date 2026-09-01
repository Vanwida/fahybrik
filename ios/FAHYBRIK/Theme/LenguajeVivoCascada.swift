import SwiftUI

// EL HOST DEL VIVO, LA PARTE QUE FALTABA — el presupuesto de los apoyos y su
// cascada por prioridad.
//
// POR QUÉ ESTO NACE AQUÍ Y NO COMO UN MARCO NUEVO. `MarcoVivo` (LenguajeVivoUI)
// ya es el host de los cuatro huecos y ya MIDE de verdad: su `Layout` mide el
// sujeto, ancla su centro y le da a los apoyos todo lo que queda entre el sujeto
// y la acción. Lo que NO hacía es PUBLICAR esa medida, y de ahí sale el agujero
// real: una pantalla que quiere decidir qué apoyos entran no tiene forma de
// preguntar cuánto sitio le han dado. `RoundsLiveHUD` lo resolvió por su cuenta
// —su propio `GeometryReader`, su propia aritmética estimada a mano
// (`RoundsListBudget`) y su propio `ViewThatFits` con suelo—, y esa es
// exactamente la clase de solución que hay que dejar de repetir por pantalla.
//
// Así que el host se completa con tres piezas, y las tres son del MARCO:
//
//   PresupuestoApoyos  — quién entra en el hueco, por prioridad y con suelo
//   CascadaApoyos      — la vista que mide su propia ranura y reparte
//   TiraFormatoVivo    — el strip de formato · posición · reloj
//
// Regla de mantenimiento (§0): una pantalla del vivo que vuelva a maquetar su
// propia cascada con un `GeometryReader` suelto está rompiendo el §10, no
// «adaptándolo a su caso».

// MARK: - El presupuesto — la aritmética, sin pintar nada

/// QUIÉN ENTRA EN EL HUECO DE APOYOS, y no se decide a ojo.
///
/// La ranura del vivo NO scrollea (ancla del sujeto, §10.3), así que lo que no
/// cabe no se recorta: EMPUJA — y lo que empuja saca de la pantalla la franja de
/// acción, que es el único sitio por donde el atleta pasa de una serie a la
/// siguiente. Es el bug que el 10-ago dejó un EMPEZAR fuera del móvil.
///
/// Se reserva en ORDEN DE PRIORIDAD, y el orden es del contenido, no de la
/// pieza: primero lo que SITÚA (dónde vas), luego lo MEDIDO, luego lo que
/// INTERPRETA lo medido, y al final el contexto que se puede mirar al acabar.
/// Cada pantalla declara su orden llamando en él.
///
/// El SUELO es la otra mitad de la regla: hay piezas que no son «lo primero de
/// la lista», son **irrenunciables** — una función (deshacer, la salida del
/// tramo) no se recorta porque la pantalla venga apretada. Se reservan con
/// `obligatorio` y entran aunque el hueco no dé, igual que `ViewThatFits` pinta
/// su último candidato quepa o no. La diferencia con el orden es de naturaleza:
/// lo obligatorio no compite.
///
/// Es un `struct` mutable y no una función pura de una tacada porque el que
/// reparte necesita preguntar pieza a pieza — el alto de la tercera depende de si
/// entró la segunda, y una API que devuelva «un plan» obliga a declarar antes
/// todos los altos, incluidos los de las piezas que ni existen en ese estado.
struct PresupuestoApoyos {
    /// El hueco REAL, medido por el marco. No un frame supuesto.
    let alto: CGFloat
    /// Y el ancho, que también es del marco y también hay que medir: no todo lo que
    /// colapsa lo hace hacia abajo. El riel de series de la fuerza es una FILA y
    /// crece hacia DENTRO — con doce peldaños cada uno se queda en 26 pt y no cabe
    /// ni «S12» —, así que su umbral se deriva de aquí igual que el del contador de
    /// rondas se deriva del alto.
    let ancho: CGFloat
    /// Lo que el marco mete entre dos apoyos apilados.
    let hueco: CGFloat

    /// Lo ya reservado. Cero hasta la primera pieza que entra: la primera no paga
    /// hueco porque no tiene vecino de arriba.
    private(set) var gastado: CGFloat = 0

    init(alto: CGFloat, ancho: CGFloat = 0, hueco: CGFloat = Theme.Spacing.s) {
        self.alto = max(0, alto)
        self.ancho = max(0, ancho)
        self.hueco = hueco
    }

    /// Lo que queda sin reservar. Puede ser negativo cuando lo obligatorio se
    /// comió el hueco: entonces nada opcional entra, que es lo correcto.
    var libre: CGFloat { alto - gastado }

    /// ¿Cabe una pieza de `alto` puntos? Si cabe, se APUNTA — llamar es reservar.
    ///
    /// - Parameter obligatorio: la pieza entra pase lo que pase (una función que
    ///   no se recorta). Se apunta igual para que las de detrás sepan la verdad
    ///   del hueco en vez de repartirse un sitio que ya no existe.
    mutating func cabe(_ alto: CGFloat, obligatorio: Bool = false) -> Bool {
        let conVecino = gastado == 0 ? alto : gastado + hueco + alto
        guard obligatorio || conVecino <= self.alto else { return false }
        gastado = conVecino
        return true
    }
}

// MARK: - La cascada — la vista que mide su propia ranura

/// LOS APOYOS, REPARTIDOS CONTRA EL HUECO QUE EL MARCO LES DIO DE VERDAD.
///
/// Se pone en la ranura de apoyos de `MarcoVivo` y le pasa a su contenido el
/// presupuesto ya medido, para que la pantalla decida QUÉ pinta en vez de pintar
/// todo y confiar en que quepa.
///
/// Mide con `GeometryReader` y no con `ViewThatFits` porque las dos preguntas son
/// distintas: `ViewThatFits` elige entre caras ya escritas —bien cuando los
/// niveles son pocos y cerrados, como el contador de rondas—, y esto contesta
/// «¿cuánto sitio tengo?», que es lo que hace falta cuando lo que entra depende
/// del ESTADO (hay sensor o no, hay serie cerrada o no) y los niveles serían la
/// combinatoria de todos ellos.
///
/// Los apoyos se pegan ABAJO, contra la acción: el hueco sobrante se queda entre
/// el sujeto y el primer apoyo, que es donde no molesta. Alineados arriba, una
/// pantalla con dos apoyos dejaba el vacío justo encima del botón.
struct CascadaApoyos<Contenido: View>: View {
    /// Lo que el marco mete entre dos apoyos apilados.
    var hueco: CGFloat = Theme.Spacing.s
    @ViewBuilder var contenido: (PresupuestoApoyos) -> Contenido

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: hueco) {
                contenido(PresupuestoApoyos(alto: geo.size.height,
                                            ancho: geo.size.width,
                                            hueco: hueco))
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
        }
    }
}

// MARK: - El strip del formato

/// EL FORMATO, DÓNDE VAS Y EL RELOJ — la línea que envuelve al sujeto y no se va.
///
/// Nació `private` en la cara por rondas (`RoundsContextStrip`) y sube aquí la
/// primera vez que una SEGUNDA familia la necesita, que es la regla del kit: es
/// lo que evitó que la app acabara con seis relojes y tres grafías del ritmo. Al
/// subir se queda con DATOS y no con la sesión — un reloj de bloque con tope y un
/// total de sesión no se leen igual, y el strip no es quién para decidirlo.
///
/// LO QUE NO SE NEGOCIA, y costó una verificación: la posición NUNCA lleva
/// `.fixedSize()`. Un título de bloque largo comprimía al vecino y el reloj
/// acababa partido un dígito por línea. **El título cede; el reloj no.** Y va en
/// `muted`, no en `faint`: hay caras donde esta línea es la única mención de
/// dónde estás, y `faint` da 3,08:1 sobre `surface` — bajo AA.
struct TiraFormatoVivo<Cola: View>: View {
    /// El rótulo del formato, en versales: «FUERZA» · «POR RONDAS».
    let formato: String
    /// Dónde vas. Nil cuando el sujeto ya lo dice y repetirlo sería escribirlo dos
    /// veces.
    let posicion: String?
    /// El reloj, ya escrito por quien sabe qué reloj es.
    let reloj: String
    var tonoReloj: Color = Theme.Color.foreground
    /// Lo que va después del reloj: el tope de un metcon, la barra de un descanso
    /// drenando. Vacío por defecto.
    @ViewBuilder var cola: Cola

    /// Lo que la voz del lector dice de esta línea, entero. Se pasa hecho porque
    /// «Tiempo 12:04» y «Quedan 0:32 de tope» no son la misma frase.
    let voz: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(formato)
                .font(.system(size: 10, weight: .heavy)).tracking(1.0)
                .foregroundStyle(Theme.Color.accentText)
                .fixedSize()
            if let posicion {
                Text(posicion)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .layoutPriority(-1)
            }
            Spacer(minLength: 6)
            Text(reloj)
                .font(.system(size: 17, weight: .semibold, design: .monospaced))
                .foregroundStyle(tonoReloj)
                .monospacedDigit()
            cola
        }
        .stripChrome()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voz)
    }
}

extension TiraFormatoVivo where Cola == EmptyView {
    init(formato: String,
         posicion: String?,
         reloj: String,
         tonoReloj: Color = Theme.Color.foreground,
         voz: String) {
        self.init(formato: formato, posicion: posicion, reloj: reloj,
                  tonoReloj: tonoReloj, cola: { EmptyView() }, voz: voz)
    }
}

/// UN TIEMPO QUE DRENA, en el sitio donde drena el tope de un metcon: la franja
/// que no desaparece jamás.
///
/// Sin cifra a propósito. Cuando esto se usa —el descanso de una serie— lo que
/// queda YA gobierna la banda en el numeral, y escribir el mismo número dos veces
/// en la misma pantalla es como empiezan las tres grafías del ritmo (§2). Lo que
/// aporta es la FORMA: cuánto de lo prescrito llevas, que el número no dice.
struct BarraDrenaje: View {
    let totalS: Double
    let restanteS: Double

    private var usado: Double {
        guard totalS > 0 else { return 0 }
        return min(1, max(0, (totalS - restanteS) / totalS))
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.hairline)
                Capsule()
                    .fill(Theme.Color.muted)
                    .frame(width: geo.size.width * usado)
                    .animation(.linear(duration: 0.5), value: usado)
            }
        }
        .frame(width: 64, height: 4)
        .accessibilityHidden(true)
    }
}
