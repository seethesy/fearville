import SwiftUI

// Tutorials on iPhone (FEAR-16/17/18/20). Content comes from tutorials.json,
// generated from the web definitions in lib/tutorials/content.ts so both
// clients show the same words. Accounts keep progress on the server; guests
// keep it per seat on this device and see everything again on a new join.

struct TutorialStepDef: Decodable, Hashable { let title: String; let body: String; let symbol: String?; let tab: String?; let diagram: String? }
struct TutorialDef: Decodable, Identifiable {
    let id: String; let kind: String; let title: String; let summary: String; let audience: String
    let section: String?; let group: String?; let covers: [String]; let steps: [TutorialStepDef]
}
struct TutorialCatalog: Decodable { let tutorials: [TutorialDef] }
struct TutorialSeenItem: Codable { let id: String; let status: String }
struct TutorialProgressReply: Decodable { let account: Bool; let seen: [TutorialSeenItem] }

let tutorialCatalog: [TutorialDef] = {
    guard let url = Bundle.main.url(forResource: "tutorials", withExtension: "json"), let data = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode(TutorialCatalog.self, from: data) else { return [] }
    return catalog.tutorials
}()

struct TutorialEntry: Equatable { let id: String; var step: Int; let replay: Bool }

@MainActor final class TutorialCenter: ObservableObject {
    @Published private(set) var active: TutorialEntry?
    @Published private(set) var queue: [TutorialEntry] = []
    @Published private(set) var seen: [String: String] = [:]
    @Published private(set) var loaded = false
    @Published private(set) var isAccount = false
    // The tab the current step wants open; GameView switches to it.
    @Published var requestedTab: String?
    private var blockers = Set<String>()
    private var scope: String?
    private weak var store: TableStore?
    private static let guestKey = "fv.tutorials.guest"
    private struct GuestStore: Codable { var scope: String; var seen: [String: String] }

    func attach(_ store: TableStore) { self.store = store }
    func def(_ id: String) -> TutorialDef? { tutorialCatalog.first { $0.id == id } }
    private func group(_ id: String) -> [String] {
        guard let name = def(id)?.group else { return [id] }
        return tutorialCatalog.filter { $0.group == name }.map(\.id)
    }

    // MARK: Progress
    func load() async {
        var account = false, items: [TutorialSeenItem] = []
        if let store, let reply = try? await store.tutorialProgress(), reply.account { account = true; items = reply.seen }
        isAccount = account
        if account { seen = [:]; for item in items where seen[item.id] != "completed" { seen[item.id] = item.status } }
        else { seen = guestSeen() }
        loaded = true
        queue.removeAll { !$0.replay && seen[$0.id] != nil }
        if let current = active, !current.replay, seen[current.id] != nil { active = nil }
        pump()
    }
    func setScope(_ next: String) {
        guard scope != next else { return }
        scope = next
        guard loaded, !isAccount else { return }
        // A different seat is a new join: guests start over.
        if guestStore()?.scope != next { seen = [:]; saveGuest() }
    }
    private func guestStore() -> GuestStore? {
        guard let data = UserDefaults.standard.data(forKey: Self.guestKey) else { return nil }
        return try? JSONDecoder().decode(GuestStore.self, from: data)
    }
    private func guestSeen() -> [String: String] {
        guard let stored = guestStore(), scope == nil || stored.scope == scope else { return [:] }
        return stored.seen
    }
    private func saveGuest() {
        let value = GuestStore(scope: scope ?? guestStore()?.scope ?? "", seen: seen)
        if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: Self.guestKey) }
    }
    private func mark(_ ids: [String], _ status: String) {
        var changed: [String] = []
        for id in ids {
            if status == "skipped" && seen[id] == "completed" { continue }
            if seen[id] != status { seen[id] = status; changed.append(id) }
        }
        guard !changed.isEmpty else { return }
        if isAccount {
            let store = self.store
            Task { for id in changed { _ = try? await store?.markTutorial(id, status: status) } }
        } else { saveGuest() }
    }
    func reset() async {
        if isAccount { _ = try? await store?.resetTutorials() }
        seen = [:]; active = nil; queue = []
        if !isAccount { saveGuest() }
    }

    // MARK: Queue
    func request(_ id: String) {
        guard def(id) != nil, active?.id != id, !queue.contains(where: { $0.id == id }), seen[id] == nil else { return }
        queue.append(TutorialEntry(id: id, step: 0, replay: false))
        pump()
    }
    func requestSection(_ section: String) {
        if let t = tutorialCatalog.first(where: { $0.kind == "section" && $0.section == section }) { request(t.id) }
    }
    // Replays never unmark anything; a grouped tutorial replays the group.
    func replay(_ id: String) {
        let ids = group(id).filter { def($0) != nil }
        queue.removeAll { ids.contains($0.id) }
        queue.insert(contentsOf: ids.map { TutorialEntry(id: $0, step: 0, replay: true) }, at: 0)
        pump()
    }
    var blocked: Bool { !blockers.isEmpty }
    func setBlocker(_ key: String, _ on: Bool) {
        if on { blockers.insert(key) } else { blockers.remove(key) }
        pump()
    }
    private func pump() {
        if blocked || !loaded {
            // Suspend: the active tutorial waits at the front, same step.
            if let current = active { queue.insert(current, at: 0); active = nil }
            return
        }
        guard active == nil else { return }
        queue.removeAll { !$0.replay && seen[$0.id] != nil }
        guard !queue.isEmpty else { return }
        let next = queue.removeFirst()
        active = next
        requestedTab = def(next.id)?.steps.first?.tab
    }
    func next() {
        guard var current = active, let t = def(current.id) else { return }
        if current.step < t.steps.count - 1 {
            current.step += 1; active = current; requestedTab = t.steps[current.step].tab
            return
        }
        active = nil
        mark([t.id] + t.covers, "completed")
        pump()
    }
    func back() {
        guard var current = active, current.step > 0, let t = def(current.id) else { return }
        current.step -= 1; active = current; requestedTab = t.steps[current.step].tab
    }
    // Skip ends this tutorial (and the rest of its group) only.
    func skip() {
        guard let current = active else { return }
        let ids = group(current.id)
        active = nil
        queue.removeAll { ids.contains($0.id) }
        mark(ids, "skipped")
        pump()
    }

    // MARK: Triggers (same rules as lib/tutorials/engine.ts)
    func walkthrough(for game: GameState) {
        guard !game.host else { return }
        if game.phase == "lobby" { request("walkthrough.lobby"); return }
        guard game.phase != "ended" else { return }
        request("walkthrough.start")
        if game.day >= 1 && ["discovery", "discussion", "nomination", "defense", "voting", "dayReview"].contains(game.phase) { request("walkthrough.day") }
    }
    // Night Rite guide: a seated player's own pattern guide during the nights
    // before the Rite opens (night 1 for everyone), as riteGuideTrigger on web.
    func riteGuide(for game: GameState, rite: HubJSON?) {
        guard !game.host, game.phase == "night", game.night >= 1, let rite, !rite.isNull, rite["enabled"].flag else { return }
        let kind = rite["squad"]["kind"].text
        let opens = rite["opensNight"].isNull ? 2 : Int(rite["opensNight"].number)
        guard !kind.isEmpty, game.night < opens else { return }
        request("guide." + kind)
    }
    func help(host: Bool, seated: Bool, ownGuides: [String] = []) -> [(String, [TutorialDef])] {
        func fits(_ t: TutorialDef) -> Bool { t.audience == "all" || (t.audience == "host" ? host : seated && !host) }
        let walkthrough = tutorialCatalog.filter { $0.kind == "walkthrough" && fits($0) }
        let firstOfGroups = walkthrough.enumerated().filter { pair in pair.element.group == nil || walkthrough.firstIndex(where: { $0.group == pair.element.group }) == pair.offset }.map { $0.element }
        let sections: [(String, [TutorialDef])] = [
            ("Getting started", firstOfGroups),
            ("Storyteller tour", tutorialCatalog.filter { $0.kind == "tour" && fits($0) }),
            // Only the player's own Night Rite guide, never other patterns'.
            ("Your Night Rite guide", tutorialCatalog.filter { $0.kind == "guide" && fits($0) && ownGuides.contains($0.id) }),
            ("Sections", tutorialCatalog.filter { $0.kind == "section" && fits($0) }),
        ]
        return sections.filter { !$0.1.isEmpty }
    }
    func isSeen(_ id: String) -> Bool { group(id).allSatisfy { seen[$0] != nil } }
}

struct TutorialOverlay: View {
    @EnvironmentObject var tutorials: TutorialCenter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack(alignment: .bottom) {
            if let entry = tutorials.active, let def = tutorials.def(entry.id), !def.steps.isEmpty {
                let index = min(entry.step, def.steps.count - 1)
                let step = def.steps[index]
                let last = index == def.steps.count - 1
                Color.black.opacity(0.62).ignoresSafeArea().contentShape(Rectangle()).onTapGesture {}.accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(def.title.uppercased()).font(.caption.bold()).tracking(2).foregroundStyle(Color.tableHighlight)
                        Spacer()
                        Text("Step \(index + 1) of \(def.steps.count)").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                    }
                    if let diagram = step.diagram {
                        // Night Rite guide drawing (vector PDF in the asset catalog).
                        Image(diagram).resizable().scaledToFit().frame(maxWidth: .infinity).clipShape(RoundedRectangle(cornerRadius: 10)).accessibilityHidden(true)
                    } else if let symbol = step.symbol {
                        Image(systemName: symbol).font(.system(size: 34, weight: .light)).foregroundStyle(Color.tableHighlight)
                            .frame(maxWidth: .infinity, minHeight: 76)
                            .background(LinearGradient(colors: [Color(red: 0.12, green: 0.11, blue: 0.1), Color(red: 0.2, green: 0.15, blue: 0.11)], startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: 10))
                            .accessibilityHidden(true)
                    }
                    Text(step.title).font(.system(.title2, design: .serif)).accessibilityAddTraits(.isHeader)
                    Text(step.body).fixedSize(horizontal: false, vertical: true)
                    ProgressView(value: Double(index + 1), total: Double(def.steps.count)).tint(.tableAccent).accessibilityHidden(true)
                    HStack(spacing: 12) {
                        Button("Skip") { tutorials.skip() }.foregroundStyle(Color.tableHighlight)
                        Spacer()
                        Button("Back") { tutorials.back() }.buttonStyle(.bordered).disabled(index == 0)
                        Button(last ? "Done" : "Next") { tutorials.next() }.buttonStyle(.borderedProminent)
                    }.controlSize(.large)
                }
                .padding(20)
                .background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 14))
                .overlay(alignment: .top) { Rectangle().fill(Color.tableAccent).frame(height: 3).clipShape(RoundedRectangle(cornerRadius: 2)) }
                .padding(.horizontal, 16).padding(.bottom, 12)
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.isModal)
                .accessibilityAction(.escape) { tutorials.skip() }
                .transition(reduceMotion ? .identity : .move(edge: .bottom).combined(with: .opacity))
                .id(def.id + "-\(index)")
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: tutorials.active)
    }
}

struct HelpView: View {
    @EnvironmentObject var tutorials: TutorialCenter
    @Environment(\.dismiss) private var dismiss
    let host: Bool
    let seated: Bool
    var ownGuides: [String] = []
    var body: some View {
        List {
            Section { Text("Replay any tour or guide. Skip at any step.") + Text(tutorials.blocked ? " A timed step is in progress, so your choice starts when it ends." : "") }
            ForEach(tutorials.help(host: host, seated: seated, ownGuides: ownGuides), id: \.0) { title, items in
                Section(title) {
                    ForEach(items) { item in
                        Button {
                            tutorials.replay(item.id)
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) { Text(item.title).foregroundStyle(.primary); Text(item.summary).font(.caption).foregroundStyle(.secondary) }
                                Spacer()
                                Label(tutorials.isSeen(item.id) ? "Replay" : "Start", systemImage: "play.fill").labelStyle(.titleAndIcon).font(.caption)
                            }
                        }
                        .accessibilityLabel((tutorials.isSeen(item.id) ? "Replay " : "Start ") + item.title)
                    }
                }
            }
        }
        .scrollContentBackground(.hidden).background(Color.tableBackground)
        .navigationTitle("Help & tutorials")
    }
}

// Night Rite guides on the rules screen: each step with its diagram.
struct RiteGuideRows: View {
    let patterns: [String]
    var body: some View {
        ForEach(patterns, id: \.self) { kind in
            if let guide = tutorialCatalog.first(where: { $0.id == "guide." + kind }) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(guide.title).font(.headline)
                    Text(guide.summary).font(.callout).foregroundStyle(.secondary)
                    ForEach(guide.steps, id: \.self) { step in
                        if let diagram = step.diagram {
                            Image(diagram).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 10)).accessibilityHidden(true)
                        }
                        Text(step.title).font(.subheadline.bold())
                        Text(step.body).fixedSize(horizontal: false, vertical: true)
                    }
                }.padding(.vertical, 6)
            }
        }
    }
}
