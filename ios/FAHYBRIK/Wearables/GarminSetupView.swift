import SwiftUI

// Cómo poner el entreno de hoy en un Garmin — la pantalla que faltaba.
//
// EL MURO QUE RESUELVE
// --------------------
// El atleta instala nuestra app en el reloj, la abre, y el reloj le pide un email
// y un código. Pero en el reloj NO HAY TECLADO: eso se escribe en Garmin Connect,
// dentro de los ajustes de la app, **tres niveles hacia dentro**. Nadie encuentra
// ese menú por su cuenta — lo comprobamos en carne propia buscándolo nosotros.
//
// Hasta ahora, todo lo que nuestra app decía sobre Garmin era una línea: «se
// instala en el reloj desde Garmin Connect». Instalas, abres, te pide vincular, y
// el camino se acaba ahí. Ese era el muro del día uno.
//
// POR QUÉ SOLO INSTRUCCIONES, SIN BOTONES
// ---------------------------------------
// La tentación era meter aquí un «enviarme el código». No hace falta: la app del
// RELOJ ya tiene ese botón y ya llama al endpoint. Duplicarlo aquí daría dos
// sitios desde donde pedir lo mismo, dos códigos vivos a la vez y un atleta
// preguntándose cuál de los dos vale. Lo que falta no es un botón: es saber dónde
// se escribe.
//
// El aviso del final tampoco es relleno. Garmin obliga a DOS confirmaciones al
// arrancar (salir de nuestra app, y elegir con qué perfil correr). Quien no lo
// espera piensa que ha fallado algo y vuelve atrás justo antes de empezar.

struct GarminSetupView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                steps
                twoTapsNote
                notYetNote
            }
            .padding(Theme.Spacing.l)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .navigationTitle("Garmin")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Tu entreno, en el reloj")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            Text("El plan te sale en el reloj y lo guía Garmin, con sus ritmos y sus avisos. Se configura una vez.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SetupStep(
                number: 1,
                title: "Instala FAHYBRID en el reloj",
                detail: "Desde la tienda Connect IQ, en la app Garmin Connect de tu móvil."
            )
            SetupStep(
                number: 2,
                title: "Abre los ajustes de la app",
                // La ruta literal, porque es exactamente lo que nadie encuentra.
                detail: "En Garmin Connect: Connect IQ › FAHYBRID › Ajustes. Está tres niveles hacia dentro.",
                emphasis: true
            )
            SetupStep(
                number: 3,
                title: "Escribe tu email ahí",
                detail: "El mismo con el que entras en FAHYBRID. En el reloj no hay teclado: por eso se escribe en el móvil."
            )
            SetupStep(
                number: 4,
                title: "En el reloj, toca «Pedir código»",
                detail: "Te llega un código de 6 dígitos al email. Caduca en 10 minutos."
            )
            SetupStep(
                number: 5,
                title: "Escribe el código en los mismos ajustes",
                detail: "Vuelve a Garmin Connect › FAHYBRID › Ajustes y pégalo. Se borra solo al usarlo."
            )
            SetupStep(
                number: 6,
                title: "Listo",
                detail: "El reloj ya tiene tu sesión. Cada día abres la app y te bajas el entreno."
            )
        }
    }

    private var twoTapsNote: some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Al empezar, el reloj te preguntará dos veces")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Primero si quieres salir de FAHYBRID, y después con qué perfil correr. Elige Correr: a partir de ahí te guía Garmin. Es cosa suya, no un fallo.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // Honestidad de estado: la app del reloj está construida y probada, pero aún no
    // publicada en la tienda de Garmin. Decirlo aquí evita que el atleta la busque
    // y no la encuentre — y que piense que el fallo es suyo.
    private var notYetNote: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Todavía no está en la tienda")
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Text("La app del reloj está lista y la estamos probando. Te avisamos en cuanto se pueda instalar.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Un paso numerado. El número va en su propia columna para que el texto pueda
/// ocupar varias líneas sin desalinearse.
private struct SetupStep: View {
    let number: Int
    let title: String
    let detail: String
    var emphasis: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Text("\(number)")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Theme.Color.accentOn)
                .frame(width: 22, height: 22)
                .background(Theme.Color.accent)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text(detail)
                    .font(Theme.Typography.small)
                    .foregroundStyle(emphasis ? Theme.Color.foreground : Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
