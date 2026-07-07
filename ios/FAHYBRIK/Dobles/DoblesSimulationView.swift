import SwiftUI

// Dobles · simulación conjunta (screen 4). The 8-station split strategy between
// the two athletes (per-station share bars), running together, RoxZone relays,
// and the coach's tactical note.
//
// Faithful to design_handoff_fhp/App Atleta - Dobles.dc.html screen 4, mapped to
// our system: SELF = brand orange (Theme.Color.accent), PARTNER = blue
// (Theme.Color.partner). The coach note is a left-accent quote in brand orange;
// the flagged (weak-spot) station carries a danger-tinted border. Never
// red-as-brand.
//
// Composes the shared Dobles atoms from DoblesPlanView.swift (DoblesSplitBar).
//
// BACKEND GAP: DoblesService.fetchSimulation returns nil (no endpoint). With no
// data we show an honest empty state — we NEVER fabricate the station split or
// the coach's note. The strategy renders only once the backend ships it.
struct DoblesSimulationView: View {
    var bearer: String? = nil

    @State private var simulation: DoblesSimulation? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var coachName: String? = nil
    @State private var loading = true
    @State private var appear = false

    // #23 (pair-owned reparto) — editable station state. The athlete adjusts the
    // split from THEIR perspective; `baseline` detects unsaved changes.
    @State private var editStations: [EditStation] = []
    @State private var baseline: [EditStation] = []
    @State private var saving = false
    @State private var saveError: String? = nil

    /// One station as the athlete edits it — self-centric (carrier + own share).
    private struct EditStation: Identifiable, Equatable {
        let id: String
        let stationIndex: Int
        let label: String
        var carrier: DoblesCarrier
        var selfShare: Double
        var note: String
    }

    private var isDirty: Bool { editStations != baseline }

    private var effectiveBearer: String? {
        bearer
    }

    private var selfName: String { simulation?.selfName ?? "Tú" }
    private var partnerName: String { simulation?.partnerName ?? partner?.firstName ?? "Compañero" }

    /// Coach display name — AGNOSTIC data from the athlete week API
    /// (coaches.full_name), never hardcoded. "Coach Demo 1" in the demo, not
    /// "Pablo". Neutral fallback when absent; we never fabricate a name.
    private var coachLabel: String { coachName ?? "Coach" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                    .staggerReveal(appear, index: 0)

                if loading {
                    ProgressView()
                        .tint(Theme.Color.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Theme.Spacing.xxl)
                } else if let simulation {
                    content(simulation)
                } else {
                    RedesignEmptyState(
                        symbol: "flag.checkered",
                        title: "Sin simulación programada",
                        message: "Cuando tu coach programe una simulación conjunta verás aquí el reparto de las 8 estaciones, los relevos y la nota táctica."
                    )
                    .padding(.top, Theme.Spacing.xl)
                    .staggerReveal(appear, index: 1)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.m)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .instrumentCanvas()
        .navigationTitle("Simulación")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: effectiveBearer) {
            loading = true
            if let bearer = effectiveBearer {
                partner = try? await PartnerService.fetchPartner(bearer: bearer)
                // Coach identity from the athlete week API (same source ProfileView
                // reads), so the tactical note is attributed to the real coach.
                if let resp = try? await PlanService.fetchWeek(bearer: bearer),
                   let name = resp.coachName?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !name.isEmpty {
                    coachName = name
                }
            }
            simulation = await DoblesService.fetchSimulation(bearer: effectiveBearer)
            loadEditState(from: simulation)
            loading = false
            withAnimation { appear = true }
        }
    }

    /// Seed the editable state from the loaded (reader-centric) simulation.
    private func loadEditState(from sim: DoblesSimulation?) {
        guard let sim else { editStations = []; baseline = []; return }
        let stations = sim.stationSplits.map { s in
            EditStation(
                id: s.id,
                stationIndex: s.resolvedStationIndex,
                label: s.station,
                carrier: s.resolvedCarrier,
                selfShare: s.selfShare,
                note: s.splitNote ?? ""
            )
        }
        editStations = stations
        baseline = stations
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(simulation?.title ?? "Simulación Doubles")
                .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            if let intro = introLine {
                Text(intro)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "{day} · la hacéis juntos. {intro}" assembled from the payload.
    private var introLine: String? {
        guard let sim = simulation else { return nil }
        var parts: [String] = []
        if let day = sim.dayLabel, !day.isEmpty {
            parts.append("\(day) · la hacéis juntos.")
        } else {
            parts.append("La hacéis juntos.")
        }
        if let intro = sim.intro, !intro.isEmpty { parts.append(intro) }
        let joined = parts.joined(separator: " ")
        return joined.isEmpty ? nil : joined
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ sim: DoblesSimulation) -> some View {
        // Legend.
        HStack(spacing: Theme.Spacing.l) {
            // Dot = identity FILL (accent); label = AA-safe TEXT role (accentText).
            legendDot(dotColor: Theme.Color.accent, textColor: Theme.Color.accentText, label: selfName)
            legendDot(dotColor: Theme.Color.partner, textColor: Theme.Color.partner, label: partnerName)
            Spacer(minLength: 0)
            if let provenance = provenanceLabel {
                Text(provenance)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .staggerReveal(appear, index: 1)

        // Editable station reparto — the athlete adjusts who does each station.
        if !editStations.isEmpty {
            VStack(spacing: 7) {
                ForEach(editStations.indices, id: \.self) { i in
                    editableStationRow(i)
                }
            }
            .staggerReveal(appear, index: 2)

            // Save bar — appears only with unsaved changes (pair-style: no approval
            // flow; the change reaches the partner instantly, provenance is the tell).
            if isDirty {
                if let saveError {
                    Text(saveError)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Color.danger)
                }
                ExpertPrimaryButton(title: saving ? "Guardando…" : "Guardar reparto", height: 48, enabled: !saving) {
                    Task { await performSave() }
                }
                .staggerReveal(appear, index: 3)
            }
        } else {
            RedesignEmptyState(
                symbol: "square.split.2x1",
                title: "Sin reparto de estaciones",
                message: "El coach aún no ha definido el reparto de las estaciones."
            )
            .padding(.top, Theme.Spacing.l)
            .staggerReveal(appear, index: 2)
        }

        // Coach tactical note (left-accent quote).
        if let note = sim.coachNote, !note.isEmpty {
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(coachLabel)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 11)
            .padding(.horizontal, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .overlay(alignment: .leading) {
                Rectangle().fill(Theme.Color.accent).frame(width: 3)
            }
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Nota del coach \(coachLabel): \(note)")
            .staggerReveal(appear, index: 3)
        }

        // Start CTA.
        ExpertPrimaryButton(title: "▶ Empezar simulación juntos", height: 52) {
            // BACKEND GAP: starting a joint simulation (live, both athletes
            // against the shared station plan) is not wired — no start endpoint.
        }
        .staggerReveal(appear, index: 4)
    }

    // MARK: - Pieces

    private func legendDot(dotColor: Color, textColor: Color, label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(dotColor).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(textColor)
                .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    // An editable station: who does it (yo / compañero / repartida), the share
    // when shared, and an optional reparto note. Binds by index into editStations.
    @ViewBuilder
    private func editableStationRow(_ index: Int) -> some View {
        let station = editStations[index]
        let pct = Int((max(0, min(1, station.selfShare)) * 100).rounded())
        VStack(alignment: .leading, spacing: 8) {
            Text(station.label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)

            Picker("Reparto", selection: Binding(
                get: { editStations[index].carrier },
                set: { newValue in
                    editStations[index].carrier = newValue
                    // Pin the share to the full carrier so it round-trips honestly.
                    if newValue == .mine { editStations[index].selfShare = 1 }
                    else if newValue == .partner { editStations[index].selfShare = 0 }
                    else if station.selfShare >= 0.999 || station.selfShare <= 0.001 {
                        editStations[index].selfShare = 0.5
                    }
                }
            )) {
                Text(selfName).tag(DoblesCarrier.mine)
                Text("Repartida").tag(DoblesCarrier.split)
                Text(partnerName).tag(DoblesCarrier.partner)
            }
            .pickerStyle(.segmented)

            if station.carrier == .split {
                HStack(spacing: 8) {
                    Text("\(selfName) \(pct)%")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(minWidth: 62, alignment: .leading)
                    Slider(
                        value: Binding(
                            get: { editStations[index].selfShare },
                            // Snap to 5% steps — a coach/athlete never means finer.
                            set: { editStations[index].selfShare = (($0 * 20).rounded()) / 20 }
                        ),
                        in: 0...1
                    )
                    .tint(Theme.Color.accent)
                    Text("\(partnerName) \(100 - pct)%")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.partner)
                        .frame(minWidth: 62, alignment: .trailing)
                }
            }

            TextField("Nota (ej. alterna 250m)", text: Binding(
                get: { editStations[index].note },
                set: { editStations[index].note = String($0.prefix(120)) }
            ))
            .font(.system(size: 12))
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(Theme.Color.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }

    // MARK: - Provenance + save

    /// "Propuesta de Pablo" (coach) / "Ajustado por Guillem · hace 2h" (athlete).
    private var provenanceLabel: String? {
        guard let sim = simulation, let name = sim.lastEditedByName else { return nil }
        switch sim.lastEditedByKind {
        case "coach": return "Propuesta de \(name)"
        case "athlete":
            if let rel = relativeTimeES(sim.updatedAt) { return "Ajustado por \(name) · \(rel)" }
            return "Ajustado por \(name)"
        default: return nil
        }
    }

    /// Compact Spanish relative time from an ISO8601 string ("hace 2h", "ayer").
    private func relativeTimeES(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fmt.date(from: iso) ?? {
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f.date(from: iso)
        }()
        guard let date else { return nil }
        let mins = max(0, Int(Date().timeIntervalSince(date) / 60))
        if mins < 1 { return "ahora" }
        if mins < 60 { return "hace \(mins) min" }
        let hours = mins / 60
        if hours < 24 { return "hace \(hours)h" }
        let days = hours / 24
        return days == 1 ? "ayer" : "hace \(days) días"
    }

    /// Build the self-centric PUT body and save. On success the returned DTO
    /// refreshes the view (provenance now this athlete); on failure the edits stay
    /// and an inline error shows.
    private func performSave() async {
        guard let bearer = effectiveBearer, !saving else { return }
        saving = true
        saveError = nil
        let body = DoblesSimulationEditBody(
            stationSplits: editStations.map { s in
                let trimmed = s.note.trimmingCharacters(in: .whitespacesAndNewlines)
                let share = s.carrier == .split ? s.selfShare : (s.carrier == .mine ? 1 : 0)
                return DoblesSimulationEditBody.Station(
                    stationIndex: s.stationIndex,
                    carrier: s.carrier.rawValue,
                    selfShare: share,
                    note: trimmed.isEmpty ? nil : trimmed
                )
            }
        )
        if let updated = await DoblesService.updateSimulation(body, bearer: bearer) {
            simulation = updated
            loadEditState(from: updated)
        } else {
            saveError = "No se pudo guardar. Inténtalo de nuevo."
        }
        saving = false
    }
}
