import SwiftUI

// LAS PIEZAS DE LA PANTALLA DEL PLAN.
//
// Viven aparte de la composición para que el layout se lea de un vistazo, igual
// que en el doble (`plan-bloque/atoms.tsx`). Ninguna inventa un color ni un
// tamaño: todo sale de los tokens de `Theme` y de los átomos compartidos
// (`ModalityDot`, `MonoText`, `LabelText`, `Hairline`, `InfoPill`), como manda
// el §1 del contrato.
//
// Ninguna es `private`: la pantalla del ciclo (`PlanCicloView`) es de la misma
// familia y una copia suya sería la duplicación de mañana (§0).

// MARK: - La marca de un día

/// EL SELLO DE UN DÍA — la única gramática de estado del carril.
///
/// El color dice QUÉ tipo de trabajo fue (la modalidad); la forma dice CÓMO fue:
/// disco con visto = hecha · media luna ámbar = a medias · aro tachado = sin
/// hacer · aro hueco = por hacer · raya plana = descanso.
///
/// La media luna ámbar es literalmente el glifo que la app ya usaba para un
/// entreno parcial, y el tachado va en gris y no en rojo a propósito: en una
/// tira de siete días una alarma roja por cada día pasado grita, y lo que dice el
/// dato es «no quedó registrado nada», no «has fallado».
struct MarcaDia: View {
    let estado: EstadoDiaPlan
    /// La modalidad que manda en el día — tiñe el disco y el aro.
    var modalidad: String? = nil
    /// La segunda modalidad del día, cuando la hay: un punto pequeño al lado del
    /// aro. Solo en los días por hacer, donde todavía es información útil.
    var segunda: String? = nil
    var size: CGFloat = 15

    var body: some View {
        HStack(spacing: 3) {
            switch estado {
            case .descanso:
                Capsule()
                    .fill(Theme.Color.hairlineStrong)
                    .frame(width: size * 0.85, height: 2)
            case .hecha:
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(Theme.Modality.color(modalidad))
            case .parcial:
                Image(systemName: "circle.lefthalf.filled")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(Theme.Color.warning)
            case .saltada:
                Image(systemName: "xmark.circle")
                    .font(.system(size: size, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
            case .pendiente:
                Image(systemName: "circle")
                    .font(.system(size: size, weight: .medium))
                    .foregroundStyle(Theme.Modality.color(modalidad))
                if let segunda {
                    ModalityDot(modality: segunda, size: 5)
                }
            }
        }
        .frame(height: size + 2)
        .accessibilityHidden(true)
    }
}

// MARK: - El carril de la semana

/// LOS SIETE DÍAS, de un vistazo. Es la MISMA semana que cuenta el héroe, vista
/// de lejos: la inicial, el número, y el sello de cómo fue.
///
/// El hilo que baja del día DESTACADO hasta el héroe dice que son la misma
/// cosa vista de lejos y de cerca (mock `plan-bloque/atoms.tsx`, `CarrilSemana`)
/// — el detalle que faltaba en el primer intento del 7-ago.
struct CarrilSemana<Menu: View>: View {
    let semana: SemanaDelPlan
    /// El día que el héroe enseña ahora mismo — normalmente hoy, o el primero
    /// con algo al hojear otra semana. `nil` = ningún día lleva el hilo ni el
    /// realce (una semana sin ningún día destacado).
    var idDestacado: String? = nil
    /// Qué hacer al tocar un día. El día de descanso también responde — dice que
    /// no hay nada, que es una respuesta.
    let onDia: (DiaDelPlan) -> Void
    /// Las acciones de ese día (mover, técnica, corregir), en pulsación larga.
    /// Un día sin sesiones no produce ningún botón y entonces no hay menú.
    @ViewBuilder var menu: (DiaDelPlan) -> Menu

    private var indiceDestacado: Int? {
        guard let idDestacado else { return nil }
        return semana.dias.firstIndex { $0.id == idDestacado }
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(semana.dias) { dia in
                ChipDia(dia: dia, destacado: dia.id == idDestacado) { onDia(dia) }
                    .contextMenu { menu(dia) }
            }
        }
        .overlay(alignment: .bottom) { hilo }
    }

    @ViewBuilder
    private var hilo: some View {
        if let indiceDestacado {
            GeometryReader { geo in
                let ancho = geo.size.width / CGFloat(max(1, semana.dias.count))
                let x = ancho * (CGFloat(indiceDestacado) + 0.5)
                LinearGradient(
                    colors: [Theme.Color.accent, Theme.Color.accent.opacity(0)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(width: 2, height: 13)
                .clipShape(Capsule())
                .position(x: x, y: geo.size.height + 6.5)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// La ficha de un día: inicial arriba, número en medio, sello abajo. El día
/// DESTACADO (normalmente hoy) va sobre un fondo tintado con su filo, que es lo
/// que ata el carril con el héroe.
struct ChipDia: View {
    let dia: DiaDelPlan
    var destacado: Bool = false
    let onPulsar: () -> Void

    private var modalidades: [String?] { dia.modalidades }

    var body: some View {
        Button {
            Haptics.light()
            onPulsar()
        } label: {
            VStack(spacing: 5) {
                Text(dia.inicial)
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(Theme.Tracking.dataLabel)
                    .foregroundStyle(destacado ? Theme.Color.accentText : Theme.Color.muted)
                MonoText(
                    text: "\(dia.numero)",
                    size: 15,
                    weight: destacado ? .bold : .medium,
                    color: destacado ? Theme.Color.foreground : Theme.Color.muted
                )
                MarcaDia(
                    estado: dia.estado,
                    modalidad: modalidades.first ?? nil,
                    segunda: modalidades.count > 1 ? modalidades[1] : nil
                )
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(fondo)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(borde, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dia.nombre) \(dia.numero), \(dia.resumen)")
        .accessibilityAddTraits(.isButton)
    }

    private var fondo: Color {
        destacado ? Theme.Color.accent.opacity(0.12) : Color.clear
    }

    private var borde: Color {
        destacado ? Theme.Color.accent.opacity(0.45) : Color.clear
    }
}

// MARK: - De qué está hecha la sesión

/// UNA PARTE de la sesión: su punto de modalidad, su título y cuántos ejercicios
/// lleva. El calentamiento y la vuelta a la calma van apagados porque no son el
/// trabajo, son el marco.
struct FilaParteSesion: View {
    let parte: ParteDeSesion

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            ModalityDot(modality: parte.modalidad, size: 6)
                .opacity(parte.estructural ? 0.45 : 1)
            Text(parte.titulo)
                .scaledFont(13, weight: parte.estructural ? .medium : .semibold, relativeTo: .footnote)
                .foregroundStyle(parte.estructural ? Theme.Color.muted : Theme.Color.foreground)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            MonoText(
                text: "\(parte.ejercicios) \(parte.ejercicios == 1 ? "ejercicio" : "ejercicios")",
                size: 12,
                color: parte.estructural ? Theme.Color.faint : Theme.Color.muted,
                escala: true
            )
            .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(parte.titulo), \(parte.ejercicios) ejercicios")
    }
}

/// UNA CIFRA DE LA DOSIS con su palabra debajo. El dato pesa más que su etiqueta
/// (§4): monoespaciada grande arriba, rótulo pequeño abajo.
struct DatoClave: View {
    let clave: ClaveDosis

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            MonoText(text: clave.valor, size: 22, weight: .bold, escala: true)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            LabelText(text: clave.etiqueta, color: Theme.Color.faint, size: 9)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(clave.etiqueta), \(clave.valor)")
    }
}

// MARK: - De dónde vienes y a dónde vas (el día de descanso)

/// La tarjeta de ayer / mañana. Es un botón de verdad: del día vacío se sale por
/// aquí, así que tiene que poder pulsarse y leerse con VoiceOver.
struct TarjetaDia: View {
    /// «Ayer» · «Mañana».
    let cuando: String
    /// «V 31» — la inicial del día y su número.
    let dia: String
    let titulo: String
    var modalidad: String? = nil
    /// Lo que se puede decir del día: lo MEDIDO si ya pasó, el reloj escrito (o
    /// su razón) si está por venir. Nil = no hay nada que decir, y no se dice.
    let detalle: String?
    let hecha: Bool
    let onPulsar: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            onPulsar()
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(spacing: 6) {
                    LabelText(text: cuando, color: Theme.Color.faint, size: 9)
                    MonoText(text: dia, size: 10, color: Theme.Color.faint)
                }
                HStack(alignment: .top, spacing: 7) {
                    ModalityDot(modality: modalidad, size: 7)
                        .padding(.top, 5)
                    Text(titulo)
                        .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                }
                if let detalle {
                    HStack(spacing: 6) {
                        if hecha {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Color.ok)
                        }
                        MonoText(
                            text: detalle,
                            size: 12,
                            weight: .semibold,
                            color: hecha ? Theme.Color.foreground : Theme.Color.muted,
                            escala: true
                        )
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.m)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([cuando, dia, titulo, detalle].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - La puerta al ciclo

/// EL PIE — dice lo único que de verdad se sabe del bloque (cómo lo llamó el
/// coach y por qué semana vas) y abre la pantalla que cuenta hacia dónde va.
///
/// NO crece: una puerta de dos líneas no se gana alto. Todo el sobrante se lo
/// lleva el héroe, que es el sujeto de la pantalla (§6.1/§6.2).
struct EntradaAlCiclo: View {
    let nombre: String?
    let posicion: PosicionEnBloque?
    let onAbrir: () -> Void

    /// «Semana 3 de 6 · ver el ciclo entero», o solo la invitación cuando el
    /// servidor no dice por qué semana vas.
    private var subtitulo: String {
        guard let posicion else { return "Ver el ciclo entero" }
        return "\(posicion.texto) · ver el ciclo entero"
    }

    var body: some View {
        VStack(spacing: 0) {
            Hairline()
            Button {
                Haptics.light()
                onAbrir()
            } label: {
                HStack(spacing: Theme.Spacing.s) {
                    VStack(alignment: .leading, spacing: 3) {
                        LabelText(text: "El bloque", color: Theme.Color.faint, size: 10)
                        // SIEMPRE se reserva esta línea, tenga o no nombre —
                        // mismo motivo que `CabeceraDelBloque`: que el pie
                        // cambie de alto según la semana es la raíz de que dos
                        // pantallas con el mismo componente se vean distintas
                        // (Alex, 7-ago).
                        Text(nombre ?? " ")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                        Text(subtitulo)
                            .scaledFont(12, weight: .medium, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .padding(.top, 11)
                .padding(.bottom, 2)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                [nombre, subtitulo].compactMap { $0 }.joined(separator: ", ")
            )
            .accessibilityAddTraits(.isButton)
        }
    }
}

// MARK: - La cabecera del bloque

/// EL CROMO SUPERIOR: el bloque, por qué semana vas y qué busca el coach con
/// ella. La voz del coach va marcada con su filo — el sistema no escribe ahí — y
/// se corta a tres líneas: si el coach se extiende, esta pantalla sigue siendo la
/// del día, y el texto entero vive en la del plan.
struct CabeceraDelBloque: View {
    let nombre: String?
    let posicion: PosicionEnBloque?
    let intencion: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            // SIEMPRE se reserva esta fila, tenga o no dato — nunca condicional
            // a si el bloque tiene nombre. Cuando dependía de `nombre != nil ||
            // posicion != nil`, una semana sin nombre publicado hacía que el
            // carril de abajo subiera de sitio y la pantalla se viera distinta
            // a la de una semana que sí lo tiene (Alex, 7-ago: «dos views
            // diferentes» — el mismo componente, en dos posiciones distintas).
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                if let nombre {
                    Text(nombre)
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Spacer(minLength: 0)
                }
                if let posicion {
                    LabelText(text: posicion.texto, color: Theme.Color.muted, size: 10)
                        .lineLimit(1)
                }
            }
            .frame(minHeight: 17, alignment: .leading)
            if let intencion {
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    RoundedRectangle(cornerRadius: 1, style: .continuous)
                        .fill(Theme.Color.accent)
                        .frame(width: 2)
                    Text(intencion)
                        .scaledFont(13, weight: .medium, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Lo que busca tu coach esta semana: \(intencion)")
            }
        }
    }
}
