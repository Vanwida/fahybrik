import SwiftUI

// Chat tab — direct thread between Marc Vidal (athlete) and Pablo Casals
// (coach Fabrik). Mock seed conversation per the demo depth spec; sending
// a message appends locally only (no backend wire). Voice notes show a
// static waveform + duration. Castilian throughout.
struct ChatView: View {
    @State private var messages: [ChatMessage] = ChatMessage.seed
    @State private var draft: String = ""
    @FocusState private var inputFocused: Bool

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                Hairline()
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            ForEach(messages) { msg in
                                MessageRow(message: msg)
                                    .id(msg.id)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last {
                            withAnimation(.easeOut(duration: 0.18)) {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }
                Hairline()
                inputRow
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Theme.Color.surface).frame(width: 36, height: 36)
                Text("PC")
                    .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("Pablo Casals")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                HStack(spacing: 4) {
                    Circle().fill(Theme.Color.ok).frame(width: 6, height: 6)
                    Text("Coach Fabrik · activo")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            Spacer()
            Image(systemName: "phone")
                .font(.system(size: 16))
                .foregroundStyle(Theme.Color.muted)
            Image(systemName: "ellipsis")
                .font(.system(size: 16))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }

    // MARK: - Input

    private var inputRow: some View {
        HStack(spacing: 8) {
            Button(action: { Haptics.light() }) {
                Image(systemName: "plus.circle")
                    .font(.system(size: 22))
                    .foregroundStyle(Theme.Color.muted)
            }
            .buttonStyle(.plain)

            TextField("", text: $draft, prompt: Text("Escribe a Pablo…").foregroundColor(Theme.Color.muted))
                .focused($inputFocused)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .submitLabel(.send)
                .onSubmit { send() }

            if draft.trimmingCharacters(in: .whitespaces).isEmpty {
                Button(action: { Haptics.light() }) {
                    Image(systemName: "mic")
                        .font(.system(size: 20))
                        .foregroundStyle(Theme.Color.muted)
                }
                .buttonStyle(.plain)
            } else {
                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(Theme.Color.accent)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.Color.background)
    }

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let new = ChatMessage(
            id: UUID(),
            sender: .me,
            kind: .text(trimmed),
            timestamp: ChatMessage.todayLabel
        )
        messages.append(new)
        draft = ""
        Haptics.light()
    }
}

// MARK: - Models

private struct ChatMessage: Identifiable {
    enum Sender { case me, coach }
    enum Kind {
        case text(String)
        case voice(durationLabel: String)
    }

    let id: UUID
    let sender: Sender
    let kind: Kind
    let timestamp: String

    static let todayLabel = "hoy"
    static let yesterdayLabel = "ayer"

    static let seed: [ChatMessage] = [
        .init(id: UUID(), sender: .coach, kind: .text("Bien metido en el sled hoy. Mañana threshold, mantén 3:55-4:00/km."), timestamp: yesterdayLabel),
        .init(id: UUID(), sender: .me,    kind: .text("Confirmado. Dormí 7h12 y HRV alto. Listo."), timestamp: yesterdayLabel),
        .init(id: UUID(), sender: .coach, kind: .text("Recordatorio: post-workout report tu RPE. Te llega notificación."), timestamp: todayLabel),
        .init(id: UUID(), sender: .me,    kind: .text("Hecho 8/10. Wall ball duro últimos 10."), timestamp: todayLabel),
        .init(id: UUID(), sender: .coach, kind: .text("Confío. Mañana descanso activo."), timestamp: todayLabel),
        .init(id: UUID(), sender: .coach, kind: .voice(durationLabel: "0:34"), timestamp: todayLabel),
    ]
}

// MARK: - Message row

private struct MessageRow: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.sender == .me { Spacer(minLength: 40) }

            VStack(alignment: message.sender == .me ? .trailing : .leading, spacing: 4) {
                if message.sender == .coach {
                    Text("\(message.timestamp) · pablo")
                        .font(.system(size: 9, design: .monospaced))
                        .tracking(1.0)
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    Text("\(message.timestamp) · marc")
                        .font(.system(size: 9, design: .monospaced))
                        .tracking(1.0)
                        .foregroundStyle(Theme.Color.muted)
                }
                bubble
            }

            if message.sender == .coach { Spacer(minLength: 40) }
        }
    }

    @ViewBuilder
    private var bubble: some View {
        switch message.kind {
        case .text(let body):
            Text(body)
                .font(.system(size: 13))
                .foregroundStyle(message.sender == .me ? Color.white : Theme.Color.foreground)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(message.sender == .me ? Theme.Color.accent : Theme.Color.surface)
                .clipShape(BubbleShape(isMe: message.sender == .me))
                .frame(maxWidth: 280, alignment: message.sender == .me ? .trailing : .leading)
        case .voice(let durationLabel):
            HStack(spacing: 8) {
                Image(systemName: "play.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(message.sender == .me ? Color.white : Theme.Color.accent)
                Waveform(filledColor: message.sender == .me ? Color.white : Theme.Color.foreground)
                    .frame(width: 90, height: 18)
                Text(durationLabel)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(message.sender == .me ? Color.white : Theme.Color.muted)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(message.sender == .me ? Theme.Color.accent : Theme.Color.surface)
            .clipShape(BubbleShape(isMe: message.sender == .me))
        }
    }
}

private struct Waveform: View {
    let filledColor: Color
    private static let bars: [CGFloat] = [0.32, 0.55, 0.82, 0.65, 0.42, 0.74, 0.52, 0.88, 0.62, 0.45, 0.72, 0.55]

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(Array(Self.bars.enumerated()), id: \.offset) { _, h in
                Capsule()
                    .fill(filledColor.opacity(0.85))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
                    .scaleEffect(y: h, anchor: .center)
            }
        }
    }
}

private struct BubbleShape: Shape {
    let isMe: Bool
    func path(in rect: CGRect) -> Path {
        let radius: CGFloat = 14
        let small: CGFloat = 4
        let topLeft     = isMe ? radius : radius
        let topRight    = isMe ? radius : radius
        let bottomLeft  = isMe ? radius : small
        let bottomRight = isMe ? small  : radius
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + topLeft, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - topRight, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - topRight, y: rect.minY + topRight),
                 radius: topRight, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - bottomRight))
        p.addArc(center: CGPoint(x: rect.maxX - bottomRight, y: rect.maxY - bottomRight),
                 radius: bottomRight, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + bottomLeft, y: rect.maxY - bottomLeft),
                 radius: bottomLeft, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + topLeft))
        p.addArc(center: CGPoint(x: rect.minX + topLeft, y: rect.minY + topLeft),
                 radius: topLeft, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}
