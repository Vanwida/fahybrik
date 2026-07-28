import SwiftUI

// "Tus marcas" (#Marcas) — the athlete's benchmark library.
//
// Three groups, three origins, one list: the marks the app measures (run · ergo)
// and the races that get registered. Every row shows the best comparable mark,
// how long ago, and where it came from — a coach test and a self-test live
// together, sello included. "Nunca probado" is an invitation, not a sad empty.
struct MarksLibraryView: View {
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    @State private var marks: [MarkView] = []
    @State private var loading = true
    @State private var error: String? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    if loading {
                        ProgressView()
                            .tint(Theme.Color.accentText)
                            .frame(maxWidth: .infinity)
                            .padding(.top, Theme.Spacing.xl)
                    } else {
                        group("Correr", items: marks.filter { $0.group == "run" })
                        group("Remo y SkiErg", items: marks.filter { $0.group == "ergo" })
                        group("Carreras", items: marks.filter { $0.group == "race" })
                    }
                    if let error {
                        Text(error)
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.warning)
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .navigationTitle("Tus marcas")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func group(_ title: String, items: [MarkView]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                LabelText(text: title)
                CardSurface(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, mark in
                            NavigationLink {
                                MarkDetailView(
                                    slug: mark.slug,
                                    bearer: bearer,
                                    hrZones: hrZones
                                )
                            } label: {
                                row(mark)
                            }
                            .buttonStyle(.plain)
                            if index < items.count - 1 {
                                Divider().overlay(Theme.Color.hairline).padding(.leading, 16)
                            }
                        }
                    }
                }
            }
        }
    }

    private func row(_ mark: MarkView) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(groupColor(mark))
                .frame(width: 3, height: 30)

            VStack(alignment: .leading, spacing: 2) {
                Text(mark.label)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text(sublabel(mark))
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer(minLength: 8)

            if let best = mark.best {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(MarkFormat.value(mark, best.value))
                        .font(.system(size: 15, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                    if let pace = MarkFormat.paceLine(mark, best.value) {
                        Text(pace)
                            .font(Theme.Typography.caption)
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
            } else {
                Text("—")
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    /// "hace 3 semanas · test de Pablo" — recency plus the origin sello when the
    /// mark did not come from the athlete themself.
    private func sublabel(_ mark: MarkView) -> String {
        guard let latest = mark.latest else {
            return mark.measuredBy == "registered" ? "Aún sin tiempo" : "Aún sin marca · \(mark.approxLabel)"
        }
        var parts: [String] = []
        if let rel = MarkFormat.relative(latest.recordedAt) { parts.append(rel) }
        switch latest.source {
        case "coach_test": parts.append("test del coach")
        case "registered": if let name = latest.eventName { parts.append(name) }
        default: break
        }
        return parts.isEmpty ? mark.approxLabel : parts.joined(separator: " · ")
    }

    private func groupColor(_ mark: MarkView) -> Color {
        switch mark.group {
        case "run":  return Theme.Color.accent
        case "ergo": return Theme.Color.info
        default:     return Theme.Color.modalityHyrox
        }
    }

    @MainActor
    private func load() async {
        error = nil
        do {
            marks = try await MarksService.fetchMarks(bearer: bearer).marks
        } catch {
            self.error = "No pudimos cargar tus marcas."
        }
        loading = false
    }
}
