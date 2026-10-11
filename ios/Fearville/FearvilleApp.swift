import SwiftUI
import UIKit

extension Color {
    static let tableBackground = Color(red: 25/255, green: 25/255, blue: 28/255)
    static let tableAccent = Color(red: 237/255, green: 122/255, blue: 40/255)
    static let tablePanel = Color(red: 36/255, green: 36/255, blue: 40/255)
    static let tableHighlight = Color(red: 246/255, green: 162/255, blue: 101/255)
}
@main struct FearvilleApp: App {
    @StateObject private var store = TableStore()
    @StateObject private var tutorials = TutorialCenter()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(store).environmentObject(tutorials).preferredColorScheme(.dark).tint(.tableAccent).onAppear { tutorials.attach(store) } }
    }
}
struct RootView: View {
    @EnvironmentObject var store: TableStore
    @EnvironmentObject var tutorials: TutorialCenter
    @Environment(\.scenePhase) private var scene
    var body: some View {
        Group {
            if store.showingTable && store.authenticated, let game = store.game { GameView(game: game) }
            else if store.showingTable && store.authenticated { VStack(spacing: 24) { ProgressView("Connecting to your table…"); Text(store.error).foregroundStyle(.secondary); Button("Retry") { Task { await store.refresh() } }; Button("Return to welcome") { store.leave() } }.padding() }
            else if store.accountState?.account != nil { NativeHub() }
            else { NativeWelcome() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.tableBackground)
        .task { await store.refreshAccount() }
        .task(id: "\(scene)-\(store.authenticated)-\(store.showingTable)") {
            guard scene == .active, store.authenticated, store.showingTable else { return }
            while !Task.isCancelled { await store.refresh(); do { try await Task.sleep(for: .seconds(2)) } catch { return } }
        }
        .overlay { TutorialOverlay() }
        .task(id: store.accountState?.account?.id ?? "guest") { tutorials.attach(store); await tutorials.load() }
        .dynamicTypeSize(store.preferences.largerText ? .xLarge ... .accessibility5 : .xSmall ... .accessibility5)
        .task(id: scene) {
            NativeAudio.shared.setBackground(scene != .active)
            guard scene == .active else { await store.presence(false); return }
            while !Task.isCancelled { await store.presence(true); do { try await Task.sleep(for: .seconds(45)) } catch { return } }
        }
        .overlay { if scene != .active { Color.tableBackground.overlay(Text("FEARVILLE").tracking(3)).ignoresSafeArea() } }
    }
}
struct GameView: View {
    @EnvironmentObject var store: TableStore
    @EnvironmentObject var tutorials: TutorialCenter
    let game: GameState
    @State private var selected: GameAction?
    @State private var tab = "game"
    @State private var showHelp = false
    @State private var showSettings = false
    // Section tutorial for each tab (players only; FEAR-18).
    private func section(for tab: String) -> String? {
        guard !game.host else { return nil }
        switch tab {
        case "game": return game.phase == "lobby" ? nil : "flow"
        case "seats": return "seats"
        case "messages": return "messages"
        case "script": return "rules"
        case "controls": return "session"
        default: return nil
        }
    }
    private var voteOpen: Bool { !game.host && game.phase == "voting" && game.active != nil && game.active?.myVote == nil }
    // Night Rite guides: a player's own vigil pattern; every enabled pattern
    // for the Storyteller.
    private var ownGuide: String? {
        guard !game.host, let rite = store.riteState, !rite.isNull else { return nil }
        let kind = rite["squad"]["kind"].text
        return kind.isEmpty ? nil : "guide." + kind
    }
    private var riteGuides: [String] {
        guard let rite = store.riteState, !rite.isNull, rite["enabled"].flag else { return [] }
        if game.host { return rite["config"]["patterns"].items.map(\.text) }
        let kind = rite["squad"]["kind"].text
        return kind.isEmpty ? [] : [kind]
    }
    // Night Rite: the 30-second night lock, a timed turn, or an open vote.
    private var riteHold: Bool {
        guard !game.host, let puzzle = store.riteState?["puzzle"], !puzzle.isNull else { return false }
        let phase = puzzle["phase"].text
        return phase == "lock" || phase == "turn" || (!puzzle["vote"].isNull && !puzzle["vote"]["answered"].flag)
    }
    @State private var confirmExit = false
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { FlowView(game: game, selected: $selected).navigationTitle(game.phaseLabel).navigationBarTitleDisplayMode(.inline) }.tabItem { Text("Game") }.tag("game")
            NavigationStack { SeatsView(game: game, selected: $selected).navigationTitle("Seats") }.tabItem { Text("Seats") }.tag("seats")
            NavigationStack { MessagesView(game: game, selected: $selected).navigationTitle("Messages") }.tabItem { Text("Messages") }.tag("messages")
            NavigationStack { ScriptView(script: game.script ?? "horrors", riteGuides: riteGuides).navigationTitle(game.scriptName ?? "Horrors of Fearville") }.tabItem { Text("Script") }.tag("script")
            NavigationStack { ControlView(game: game, selected: $selected).navigationTitle(game.host ? "Storyteller" : "Session") }.tabItem { Text("Controls") }.tag("controls")
        }
        .sheet(item: $selected) { action in ActionView(action: action).environmentObject(store) }
        .sheet(isPresented: $showSettings) { NavigationStack { NativeSettings() } }
        .sheet(isPresented: $showHelp) { NavigationStack { HelpView(host: game.host, seated: !game.host, ownGuides: ownGuide.map { [$0] } ?? []).toolbar { Button("Done") { showHelp = false } } }.environmentObject(tutorials) }
        // Tutorials: seat scope, walkthrough chapters, first-open sections,
        // and the states that hold popups (FEAR-16/17/18).
        .task(id: game.code + ":" + game.me) { tutorials.setScope(game.code + ":" + game.me) }
        .onChange(of: "\(game.phase)|\(game.day)|\(tutorials.loaded)", initial: true) { _, _ in
            tutorials.walkthrough(for: game)
            if !game.host && game.phase == "night" { tutorials.requestSection("night") }
        }
        .onChange(of: "\(game.phase)|\(game.night)|\(ownGuide ?? "")|\(tutorials.loaded)", initial: true) { _, _ in tutorials.riteGuide(for: game, rite: store.riteState) }
        .onChange(of: tab, initial: true) { _, next in if let s = section(for: next) { tutorials.requestSection(s) } }
        .onChange(of: tutorials.requestedTab) { _, next in if let next { tab = next; tutorials.requestedTab = nil } }
        .onChange(of: selected?.id, initial: true) { _, open in tutorials.setBlocker("action", open != nil) }
        .onChange(of: game.glimpse?.id, initial: true) { _, open in tutorials.setBlocker("glimpse", open != nil) }
        .onChange(of: voteOpen, initial: true) { _, open in tutorials.setBlocker("vote", open) }
        .onChange(of: riteHold, initial: true) { _, open in tutorials.setBlocker("rite", open) }
        .onChange(of: showHelp) { _, open in tutorials.setBlocker("help", open) }
        .safeAreaInset(edge: .top) {
            VStack(spacing: 5) {
                HStack { Button { store.leave() } label: { Label("Return home", systemImage: "house") }; Spacer(); Button { showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings"); if game.phase == "lobby" || (!game.host && game.phase == "ended") { Button(game.host ? "Close lobby" : "Leave lobby", role: .destructive) { confirmExit = true } } }
                HStack { if game.phase == "lobby" { Text(game.code).font(.headline.monospaced()).tracking(3) }; Spacer(); Button { showHelp = true } label: { Label("Help", systemImage: "questionmark.circle") }.font(.caption); Text(store.online ? (game.host ? "Storyteller" : game.name(game.me)) : "Reconnecting…").font(.caption) }
                NativeError()
                if !store.online { Text("Actions are unavailable until you reconnect. Timers continue.").font(.caption).foregroundStyle(.orange) }
                if !store.notice.isEmpty { HStack { Text(store.notice.hasPrefix("New") ? store.notice : "Action confirmed.").font(.caption); Spacer(); Button("Dismiss") { store.notice = "" }.font(.caption) } }
            }.padding(.horizontal).padding(.vertical, 8).background(Color.tablePanel)
        }
        .toolbarBackground(Color.tableBackground, for: .tabBar)
        .onAppear { NativeAudio.shared.ambient(true) }
        .onDisappear { NativeAudio.shared.ambient(false) }
        .confirmationDialog(game.host ? "Close lobby for everyone?" : "Leave this lobby?", isPresented: $confirmExit, titleVisibility: .visible) {
            Button(game.host ? "Close lobby for everyone" : "Leave lobby", role: .destructive) { Task { await store.exitLobby(host: game.host) } }
            Button("Cancel", role: .cancel) {}
        } message: { Text(game.host ? "Everyone loses access. Completed games stay in account history. Return home keeps the lobby open." : "Your seat and access are removed. Return home keeps your seat.") }
    }
}
struct FlowView: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.scenePhase) private var scene
    let game: GameState
    @Binding var selected: GameAction?
    @State private var reveal = false
    @State private var glimpse: Glimpse?
    @State private var dismissedGlimpse = ""
    var body: some View {
        List {
            if !game.host && store.riteState?["enabled"].flag == true { Section("Night Rite") { NativeRiteView(game: game) } }
            if let current = game.glimpse { Section("Sphinx") { Text("Your glimpse of every role is open until the night choice timer ends."); Button("View glimpse") { glimpse = current } } }
            Section {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) { Text(game.phase == "night" ? "Night \(game.night)" : game.day > 0 ? "Day \(game.day)" : "Gather your town.").font(.largeTitle.weight(.regular)) }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let seconds = max(0, Int(ceil(game.deadline.map { $0 / 1000 - context.date.timeIntervalSince1970 - store.offset } ?? game.remaining)))
                        VStack { Text(game.deadline == nil ? "PAUSED" : "REMAINING").font(.caption2); Text(String(format: "%02d:%02d", seconds / 60, seconds % 60)).font(.title.monospacedDigit()) }
                    }
                }
                if game.phase == "lobby" { Text(game.host ? "Share the code, then assign each character in Seats." : "Your Storyteller will deal your character when everyone is ready.") }
                if game.phase == "discovery" { Text("Speak privately with other players and compare what you know.") }
                if game.phase == "discussion" { Text("Share information and suspicions with the whole town.") }
                if game.phase == "ended" { Text(game.winner + " wins.").font(.title) }
                if let ballot = game.active { Text("\(game.name(ballot.by)) nominated \(game.name(ballot.target))."); Text("\(ballot.threshold) yes votes needed."); if game.phase == "voting" { Text(ballot.myVote.map { $0 ? "Your vote: YES" : "Your vote: NO" } ?? "Your vote is not yet submitted.") } }
                ForEach(game.issues, id: \.self) { Text($0).foregroundStyle(Color.tableHighlight) }
                ForEach(game.hints, id: \.self) { Text($0).foregroundStyle(.orange) }
            }
            if let character = game.character {
                Section {
                    if reveal { Text(character.name).font(.title2); Text(character.alignment.uppercased() + " TEAM").font(.caption).foregroundStyle(Color.tableHighlight); GlossaryText(text: character.description) }
                    Button(reveal ? "Hide character" : "Reveal my character") { reveal.toggle() }
                }
            }
            if game.host && !game.tasks.isEmpty {
                Section("Night order") {
                    ForEach(game.tasks) { task in
                        HStack {
                            Text(task.done ? "✓" : "·")
                            Text(task.name).foregroundStyle(task.done ? .secondary : .primary)
                            Spacer()
                            if task.id == game.tasks.first(where: { !$0.done })?.id {
                                Text("NEXT").font(.caption).foregroundStyle(Color.tableHighlight)
                            }
                        }
                    }
                }
            }
            Section("Actions") {
                ForEach(game.controls.filter { !["chat","edit","configure","undo","rewind","end","overridePhase"].contains($0.action) }) { action in Button(action.title) { selected = action }.disabled(!store.online) }
            }
            if !game.ballots.isEmpty {
                Section("Today's votes") { ForEach(game.ballots) { ballot in HStack { Text(game.name(ballot.target)); Spacer(); Text("\(ballot.count) yes") } }; Text(game.leader.tied ? "Tied · no execution" : game.leader.target.isEmpty ? "No qualifying nominee" : game.leader.name + " leads the vote") }
            }
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
        .task(id: scene) {
            guard scene == .active else { return }
            while !Task.isCancelled {
                await store.refreshRite()
                let interactive = store.riteState?["status"].text == "open" && store.game?.phase == "night"
                do { try await Task.sleep(for: .seconds(interactive ? 3 : 8)) } catch { return }
            }
        }
        .onChange(of: scene) { _, phase in if phase != .active { reveal = false; glimpse = nil } }
        .onAppear { showGlimpse() }
        .onChange(of: game.glimpse?.id) { _, _ in showGlimpse() }
        .sheet(item: $glimpse, onDismiss: { dismissedGlimpse = game.glimpse?.id ?? "" }) { current in NavigationStack { GlimpseView(glimpse: current).environmentObject(store) } }
    }
    private func showGlimpse() {
        guard let current = game.glimpse else { glimpse = nil; return }
        if current.id != dismissedGlimpse && glimpse == nil { glimpse = current }
    }
}
struct SeatsView: View {
    @EnvironmentObject var store: TableStore
    let game: GameState
    @Binding var selected: GameAction?
    var body: some View {
        List(game.players) { player in
            VStack(alignment: .leading, spacing: 8) {
                Text("SEAT \(player.seat) · \(player.alive ? "ALIVE" : "DEAD")").font(.caption).foregroundStyle(Color.tableHighlight)
                HStack { NativeAvatar(avatar: player.avatar ?? "ghost", effect: player.deathEffect ?? "spirit", alive: player.publicAlive ?? player.alive).frame(width: 48, height: 48); Text(player.name).font(.title2) }
                if let role = player.role { Text(role).font(.headline); if role == "drunk" { Text("Shown: " + (player.shown ?? "Unassigned")) } }
                Text(player.ghost ? "Dead vote available" : "Dead vote spent").font(.subheadline).foregroundStyle(.secondary)
                if player.nominated { Text("Nominated today").font(.caption) }
                if player.hasNominated { Text("Nomination used today").font(.caption) }
                if player.poisoned == true { Text("POISONED").foregroundStyle(.orange) }
                if player.feared == true { Text("FEARED").foregroundStyle(.orange) }
                if player.protected == true { Text("PROTECTED").foregroundStyle(Color.tableHighlight) }
                if let notes = player.notes, !notes.isEmpty { Text(notes) }
                if let action = game.controls.first(where: { $0.action == "edit" && $0.fields.first?.value?.text == player.id }) { Button("Edit seat & character") { selected = action }.disabled(!store.online) }
            }.padding(.vertical, 8)
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
    }
}
struct MessagesView: View {
    @EnvironmentObject var store: TableStore
    let game: GameState
    @Binding var selected: GameAction?
    @State private var filter = "all"
    var body: some View {
        List {
            if let action = game.controls.first(where: { $0.action == "chat" }) { Button(game.host ? "Write a message" : "Message Storyteller") { selected = action }.disabled(!store.online) }
            if game.host { Picker("Conversation", selection: $filter) { Text("All conversations").tag("all"); ForEach(game.players) { Text($0.name).tag($0.id) } } }
            ForEach(game.messages.filter { !game.host || filter == "all" || $0.from == filter || $0.to == filter }.reversed()) { message in
                VStack(alignment: .leading, spacing: 8) {
                    HStack { Text(game.name(message.from)).bold(); Spacer(); Text(Date(timeIntervalSince1970: message.at / 1000), style: .time).font(.caption) }
                    Text(message.to == "all" ? "Everyone" : "Private").font(.caption).foregroundStyle(.secondary)
                    if message.kind == "info" { GlossaryText(text: message.text) } else { Text(message.text).textSelection(.enabled) }
                }.padding(.vertical, 6)
            }
            if game.messages.isEmpty { Text("No messages yet.").foregroundStyle(.secondary) }
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
    }
}
// Generated reference data use the same definitions and variants as the web.
struct GlossaryEntry: Decodable, Identifiable { let id: String; let term: String; let definition: String; let example: String? }
struct GlossaryData: Decodable { let terms: [GlossaryEntry]; let forms: [String: String] }
let glossaryData: GlossaryData = {
    guard let url = Bundle.main.url(forResource: "glossary", withExtension: "json"), let data = try? Data(contentsOf: url), let result = try? JSONDecoder().decode(GlossaryData.self, from: data) else { return GlossaryData(terms: [], forms: [:]) }
    return result
}()
let GLOSSARY = glossaryData.terms
struct GlossaryText: View {
    let text: String
    @State private var selected: GlossaryEntry?
    private var attributed: AttributedString {
        let forms = glossaryData.forms.keys.sorted { $0.count > $1.count }.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "|")
        guard !forms.isEmpty, let pattern = try? NSRegularExpression(pattern: "(?<![\\p{L}\\p{N}_])(" + forms + ")(?![\\p{L}\\p{N}_])", options: [.caseInsensitive]) else { return AttributedString(text) }
        let source = text as NSString
        var result = AttributedString(), last = 0, seen = Set<String>()
        for match in pattern.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            let word = source.substring(with: match.range)
            guard let id = glossaryData.forms[word.lowercased()], !seen.contains(id), GLOSSARY.contains(where: { $0.id == id }) else { continue }
            seen.insert(id)
            result.append(AttributedString(source.substring(with: NSRange(location: last, length: match.range.location - last))))
            var term = AttributedString(word)
            term.link = URL(string: "fearville-glossary://" + id)
            term.underlineStyle = .single
            result.append(term)
            last = match.range.location + match.range.length
        }
        result.append(AttributedString(source.substring(from: last)))
        return result
    }
    var body: some View {
        Text(attributed)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "fearville-glossary", let id = url.host, let entry = GLOSSARY.first(where: { $0.id == id }) else { return .discarded }
                selected = selected?.id == id ? nil : entry
                return .handled
            })
            .popover(item: $selected) { entry in
                VStack(alignment: .leading, spacing: 10) {
                    Text(entry.term).font(.headline)
                    Text(entry.definition)
                    if let example = entry.example { Text("Example: " + example).italic() }
                    Button("Close definition") { selected = nil }
                }.padding().frame(maxWidth: 320).presentationCompactAdaptation(.popover)
            }
    }
}
struct ScriptView: View {
    let script: String
    // Night Rite patterns whose guides to show (see RiteGuideSection).
    var riteGuides: [String] = []
    private static let all: [ScriptRole] = {
        guard let url = Bundle.main.url(forResource: "roles", withExtension: "json"), let data = try? Data(contentsOf: url), let roles = try? JSONDecoder().decode([ScriptRole].self, from: data) else { return [] }; return roles
    }()
    private var roles: [ScriptRole] { ScriptView.all.filter { ($0.script ?? "horrors") == script } }
    private func teamName(_ team: String) -> String { ["townsfolk": "Villager", "outsider": "Fool", "traveler": "Traveler · neutral", "minion": "Haunt", "demon": "Horror"][team] ?? team }
    var body: some View { List {
        Section("How to play") {
            Label("Two teams, one hidden Horror", systemImage: "person.3").font(.headline)
            Text("Good aims to kill the Horror. Evil usually wins with only two living players. Character abilities can change the outcome; the neutral Storyteller resolves them.")
            Label("Day and night", systemImage: "moon.stars").font(.headline)
            Text("By day, talk, share information, and bluff. At night, follow private instructions from the Storyteller. Some characters act only once or under special conditions.")
            Label("Nominations and execution", systemImage: "hand.raised").font(.headline)
            Text("Living players may nominate once each day; each player can be nominated once. Votes need half of living players, rounded up. The highest qualifying tally leads to execution; ties mean no execution. The nominee does not vote at this table.")
            Label("Death is not the end", systemImage: "cloud.fog").font(.headline)
            Text("Dead players keep talking and win with their team. They cannot nominate and have one final vote. A counted Yes spends it; No does not. Abilities usually stop on death unless they say otherwise.")
            Label("Information can be wrong", systemImage: "eye.slash").font(.headline)
            Text("Drunkenness and poison disable abilities without telling their owners. Information may be false. Ask the Storyteller privately when unsure.")
            Label("Keep the game fair", systemImage: "heart").font(.headline)
            Text("Bluffing is welcome; peeking at private screens is not. Respect other players. Specific character rules take precedence.")
        }
        if !riteGuides.isEmpty { Section("Night Rite") { RiteGuideRows(patterns: riteGuides) } }
        Section { Text("All characters on the script, including those not in play. These are short summaries.") }; Section("Glossary") { ForEach(GLOSSARY) { entry in VStack(alignment: .leading, spacing: 6) { Text(entry.term).font(.headline); Text(entry.definition); if let example = entry.example { Text("Example: " + example).font(.callout).italic().foregroundStyle(.secondary) } }.padding(.vertical, 4) } }; ForEach(roles) { role in VStack(alignment: .leading, spacing: 8) { Text(teamName(role.team).uppercased()).font(.caption).foregroundStyle(Color.tableHighlight); Label(role.name, systemImage: nativeRoleIcon(role.team)).font(.headline); GlossaryText(text: role.description) }.padding(.vertical, 6) } }.scrollContentBackground(.hidden).background(Color.tableBackground) }
}
// The Sphinx's nightly glimpse. Opens on its own and closes when the server
// stops sending it (the night-choice timer ended).
struct GlimpseView: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.dismiss) private var dismiss
    let glimpse: Glimpse
    var body: some View {
        List {
            Section { Text("Keep this screen to yourself. It closes when the night choice timer ends.")
                if let deadline = glimpse.deadline { TimelineView(.periodic(from: .now, by: 1)) { context in Text("\(max(0, Int(ceil(deadline / 1000 - context.date.timeIntervalSince1970 - store.offset))))s remaining").monospacedDigit().foregroundStyle(Color.tableHighlight) } }
            }
            Section("Every player’s role") { ForEach(glimpse.entries) { entry in HStack { Text("\(entry.seat). \(entry.name)" + (entry.alive ? "" : " (dead)")).foregroundStyle(entry.alive ? .primary : .secondary); Spacer(); Text(entry.role).bold() } } }
        }.scrollContentBackground(.hidden).background(Color.tableBackground).navigationTitle("Sphinx · Night \(glimpse.night)").toolbar { Button("Hide") { dismiss() } }
    }
}
struct ControlView: View {
    @EnvironmentObject var store: TableStore
    let game: GameState
    @Binding var selected: GameAction?
    var body: some View {
        List {
            Section("Session") {
                NavigationLink("Account & saved games") { NativeAccount() }
                NavigationLink("Help & tutorials") { HelpView(host: game.host, seated: !game.host) }
                Text("\(game.hostName) is Storytelling.")
                Button("Return home") { store.leave() }
                Text("Keep the app open and connected to receive private information. No background push notifications are used.").font(.footnote).foregroundStyle(.secondary)
            }
            if game.host {
                Section("Night vigil setup") { NativeRiteView(game: game) }
                Section("Storyteller control") { ForEach(game.controls.filter { ["configure","undo","rewind","end","overridePhase"].contains($0.action) }) { action in Button(action.title) { selected = action }.disabled(!store.online) } }
                Section("Decision history") { ForEach(game.log.reversed()) { item in VStack(alignment: .leading) { Text(Date(timeIntervalSince1970: item.at / 1000), style: .time).font(.caption).foregroundStyle(.secondary); Text(item.text) }.padding(.vertical, 4) } }
            }
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
    }
}
struct ActionView: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.dismiss) private var dismiss
    let action: GameAction
    @State private var values: [String: FieldValue]
    @State private var preview: ActionReply?
    @State private var error = ""
    @State private var busy = false
    init(action: GameAction) { self.action = action; _values = State(initialValue: Dictionary(uniqueKeysWithValues: action.fields.map { ($0.key, $0.value ?? .string("")) })) }
    var body: some View {
        NavigationStack {
            Form {
                Section { GlossaryText(text: action.description) }
                if let preview {
                    Section("Confirm this result") { Text(preview.summary).textSelection(.enabled) }
                    Button("Back to choices") { self.preview = nil }
                    Button(busy ? "Applying…" : "Confirm action", role: action.danger == true ? .destructive : nil) { Task { await send(confirm: true) } }.disabled(busy || !store.online)
                } else {
                    ForEach(action.fields) { field in
                        Section(field.label) {
                            if field.type == "checkbox" { Toggle(field.label, isOn: Binding(get: { values[field.key]?.flag ?? false }, set: { values[field.key] = .bool($0) })) }
                            else if field.type == "select" { Picker(field.label, selection: textBinding(field)) { if !(field.options ?? []).contains(where: { $0.value.isEmpty }) { Text("Choose…").tag("") }; ForEach(field.options ?? [], id: \.value) { Text($0.label).tag($0.value) } }.pickerStyle(.menu) }
                            else if field.type == "textarea" { TextEditor(text: textBinding(field)).frame(minHeight: 100) }
                            else { TextField(field.label, text: textBinding(field)).keyboardType(field.type == "number" ? .numberPad : .default) }
                            if let hint = field.hint { Text(hint).font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                    Button(busy ? "Checking…" : "Preview action") { Task { await send(confirm: false) } }.disabled(busy || !store.online)
                }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
            }.scrollContentBackground(.hidden).background(Color.tableBackground).navigationTitle(action.title).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
    }
    private func textBinding(_ field: ActionField) -> Binding<String> { Binding(get: { values[field.key]?.text ?? "" }, set: { text in if field.type == "number", let n = Double(text) { values[field.key] = .number(n) } else { values[field.key] = .string(text) } }) }
    private func send(confirm: Bool) async {
        busy = true; error = ""; defer { busy = false }
        do {
            let reply = try await store.perform(action, values: values, preview: !confirm, version: confirm ? preview?.version ?? -1 : store.game?.version ?? -1)
            if confirm { dismiss() } else { preview = reply }
        } catch { self.error = error.localizedDescription; preview = nil; await store.refresh() }
    }
}
