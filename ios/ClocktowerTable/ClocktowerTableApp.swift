import SwiftUI
import UIKit

extension Color {
    static let tableBackground = Color(red: 54/255, green: 54/255, blue: 54/255)
    static let tableAccent = Color(red: 190/255, green: 81/255, blue: 3/255)
    static let tablePanel = Color(red: 43/255, green: 43/255, blue: 43/255)
    static let tableHighlight = Color(red: 246/255, green: 162/255, blue: 101/255)
}
@main struct ClocktowerTableApp: App {
    @StateObject private var store = TableStore()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(store).preferredColorScheme(.dark).tint(.tableAccent) }
    }
}
struct RootView: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.scenePhase) private var scene
    var body: some View {
        Group {
            if store.authenticated, let game = store.game { GameView(game: game) }
            else if store.authenticated { VStack(spacing: 24) { ProgressView("Connecting to your table…"); Text(store.error).foregroundStyle(.secondary); Button("Retry") { Task { await store.refresh() } }; Button("Return to welcome") { store.leave() } }.padding() }
            else { WelcomeView() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.tableBackground)
        .task(id: "\(scene)-\(store.authenticated)") {
            guard scene == .active, store.authenticated else { return }
            while !Task.isCancelled { await store.refresh(); do { try await Task.sleep(for: .seconds(2)) } catch { return } }
        }
        .overlay { if scene != .active { Color.tableBackground.overlay(Text("FEARVILLE").tracking(3)).ignoresSafeArea() } }
    }
}
struct WelcomeView: View {
    @EnvironmentObject var store: TableStore
    @State private var name = ""
    @State private var code = ""
    @State private var mode = "join"
    @State private var recovery = ""
    @State private var showAccount = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Text("FEARVILLE").font(.caption.bold()).tracking(3).foregroundStyle(Color.tableHighlight)
                    Text("A seat at\nthe table.").font(.system(size: 52, design: .serif))
                    Text("Trouble Brewing · In person").foregroundStyle(.secondary)
                    if let account = store.accountState?.account {
                        Text("Signed in as " + account.name)
                        Button("Account & saved games") { showAccount = true }
                    } else {
                        VStack(spacing: 12) {
                            Button("Continue with Google") { Task { await store.signIn(provider: "google") } }.disabled(store.working || store.accountState?.providers.google != true)
                            Button("Continue with Apple") { Task { await store.signIn(provider: "apple") } }.disabled(store.working || store.accountState?.providers.apple != true)
                            Text("Accounts recover your seats across devices. Guest play is available below.").font(.footnote).foregroundStyle(.secondary)
                            if let providers = store.accountState?.providers, !providers.google && !providers.apple { Text("Account sign-in is not available yet.").font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                    Picker("Your place", selection: $mode) { Text("Join").tag("join"); Text("Storytell").tag("create"); Text("Restore").tag("restore") }.pickerStyle(.segmented)
                    if mode == "restore" {
                        SecureField("Private recovery key", text: $recovery).textContentType(.password).textInputAutocapitalization(.never).autocorrectionDisabled()
                    } else {
                        TextField("Name at the table", text: $name).textContentType(.nickname)
                        if mode == "join" { TextField("Six-letter session code", text: $code).textInputAutocapitalization(.characters).autocorrectionDisabled().font(.title2.monospaced()) }
                        else { Text("Invite 5–15 players, assign characters, and lead the game.").foregroundStyle(.secondary) }
                    }
                    Button(store.working ? "Connecting…" : mode == "join" ? "Join the table" : mode == "create" ? "Create a session" : "Restore session") {
                        Task { await store.enter(action: mode, name: name, code: code, recovery: recovery) }
                    }.buttonStyle(.borderedProminent).controlSize(.large).frame(maxWidth: .infinity)
                    .disabled(store.working || (mode == "restore" ? recovery.isEmpty : name.trimmingCharacters(in: .whitespaces).isEmpty || (mode == "join" && code.count != 6)))
                    if !store.error.isEmpty { Text(store.error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
                    Text("Unofficial companion for Blood on the Clocktower. Keep the app open during play to receive information.").font(.footnote).foregroundStyle(.secondary)
                }.textFieldStyle(.roundedBorder).padding(28)
            }.background(Color.tableBackground).toolbarBackground(Color.tableBackground, for: .navigationBar)
            .task { await store.refreshAccount() }
            .sheet(isPresented: $showAccount) { NavigationStack { AccountScreen().environmentObject(store) } }
        }
    }
}
struct GameView: View {
    @EnvironmentObject var store: TableStore
    let game: GameState
    @State private var selected: GameAction?
    var body: some View {
        TabView {
            NavigationStack { FlowView(game: game, selected: $selected).navigationTitle(game.phaseLabel).navigationBarTitleDisplayMode(.inline) }.tabItem { Text("Game") }
            NavigationStack { SeatsView(game: game, selected: $selected).navigationTitle("Seats") }.tabItem { Text("Seats") }
            NavigationStack { MessagesView(game: game, selected: $selected).navigationTitle("Messages") }.tabItem { Text("Messages") }
            NavigationStack { ScriptView().navigationTitle("Trouble Brewing") }.tabItem { Text("Script") }
            NavigationStack { ControlView(game: game, selected: $selected).navigationTitle(game.host ? "Storyteller" : "Session") }.tabItem { Text("Controls") }
        }
        .sheet(item: $selected) { action in ActionView(action: action).environmentObject(store) }
        .safeAreaInset(edge: .top) {
            VStack(spacing: 5) {
                HStack { Text(game.code).font(.headline.monospaced()).tracking(3); Spacer(); Text(store.online ? (game.host ? "Storyteller" : game.name(game.me)) : "Reconnecting…").font(.caption) }
                if !store.online { Text("Actions are unavailable until you reconnect. Timers continue.").font(.caption).foregroundStyle(.orange) }
                if !store.notice.isEmpty { HStack { Text(store.notice.hasPrefix("New") ? store.notice : "Action confirmed.").font(.caption); Spacer(); Button("Dismiss") { store.notice = "" }.font(.caption) } }
            }.padding(.horizontal).padding(.vertical, 8).background(Color.tablePanel)
        }
        .toolbarBackground(Color.tableBackground, for: .tabBar)
    }
}
struct FlowView: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.scenePhase) private var scene
    let game: GameState
    @Binding var selected: GameAction?
    @State private var reveal = false
    var body: some View {
        List {
            Section {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) { Text(game.phase == "night" ? "Night \(game.night)" : game.day > 0 ? "Day \(game.day)" : "Gather your town.").font(.largeTitle.weight(.regular)); Text("TROUBLE BREWING").font(.caption).tracking(2).foregroundStyle(Color.tableHighlight) }
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let seconds = max(0, Int(ceil(game.deadline.map { $0 / 1000 - context.date.timeIntervalSince1970 - store.offset } ?? game.remaining)))
                        VStack { Text(game.deadline == nil ? "PAUSED" : "REMAINING").font(.caption2); Text(String(format: "%02d:%02d", seconds / 60, seconds % 60)).font(.title.monospacedDigit()) }
                    }
                }
                if game.phase == "lobby" { Text(game.host ? "Share the code, then assign each character in Seats." : "Your Storyteller will deal your character when everyone is ready.") }
                if game.phase == "night" && !game.host { Text("The town is asleep. Check Messages for instructions from your Storyteller and reply with your choices.") }
                if game.phase == "discovery" { Text("Speak privately with other players and compare what you know.") }
                if game.phase == "discussion" { Text("Share information and suspicions with the whole town.") }
                if game.phase == "ended" { Text(game.winner + " wins.").font(.title) }
                if let ballot = game.active { Text("\(game.name(ballot.by)) nominated \(game.name(ballot.target))."); Text("\(ballot.threshold) yes votes needed."); if game.phase == "voting" { Text(ballot.myVote.map { $0 ? "Your vote: YES" : "Your vote: NO" } ?? "Your vote is not yet submitted.") } }
                ForEach(game.issues, id: \.self) { Text($0).foregroundStyle(Color.tableHighlight) }
                ForEach(game.hints, id: \.self) { Text($0).foregroundStyle(.orange) }
            }
            if let character = game.character {
                Section("Your private character") {
                    if reveal { Text(character.name).font(.title2); Text(character.alignment.uppercased() + " TEAM").font(.caption).foregroundStyle(Color.tableHighlight); Text(character.description) }
                    Button(reveal ? "Hide character" : "Reveal my character") { reveal.toggle() }
                }
            }
            if !game.tasks.isEmpty {
                Section("Night order") { ForEach(game.tasks) { task in HStack { Text(task.done ? "✓" : "·"); Text(task.name).foregroundStyle(task.done ? .secondary : .primary); Spacer(); if task.id == game.tasks.first(where: { !$0.done })?.id { Text("NEXT").font(.caption).foregroundStyle(Color.tableHighlight) } } }
            }
            Section("Actions") {
                ForEach(game.controls.filter { !["chat","edit","configure","undo","rewind","end","overridePhase"].contains($0.action) }) { action in Button(action.title) { selected = action }.disabled(!store.online) }
            }
            if !game.ballots.isEmpty {
                Section("Today's votes") { ForEach(game.ballots) { ballot in HStack { Text(game.name(ballot.target)); Spacer(); Text("\(ballot.count) yes") } }; Text(game.leader.tied ? "Tied · no execution" : game.leader.target.isEmpty ? "No qualifying nominee" : game.leader.name + " leads the vote") }
            }
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
        .onChange(of: scene) { _, phase in if phase != .active { reveal = false } }
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
                Text(player.name).font(.title2)
                if let role = player.role { Text(role).font(.headline); if role == "drunk" { Text("Shown: " + (player.shown ?? "Unassigned")) } }
                Text(player.ghost ? "Dead vote available" : "Dead vote spent").font(.subheadline).foregroundStyle(.secondary)
                if player.nominated { Text("Nominated today").font(.caption) }
                if player.hasNominated { Text("Nomination used today").font(.caption) }
                if player.poisoned == true { Text("POISONED").foregroundStyle(.orange) }
                if player.protected == true { Text("MONK PROTECTION").foregroundStyle(Color.tableHighlight) }
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
                    Text(message.text).textSelection(.enabled)
                }.padding(.vertical, 6)
            }
            if game.messages.isEmpty { Text("No messages yet.").foregroundStyle(.secondary) }
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
    }
}
struct ScriptView: View {
    private let roles: [ScriptRole] = {
        guard let url = Bundle.main.url(forResource: "roles", withExtension: "json"), let data = try? Data(contentsOf: url), let roles = try? JSONDecoder().decode([ScriptRole].self, from: data) else { return [] }; return roles
    }()
    var body: some View { List { Section { Text("All characters on the script, including those not in play. These are short summaries."); Link("Official script and rulings", destination: URL(string: "https://wiki.bloodontheclocktower.com/Trouble_Brewing")!) }; ForEach(roles) { role in VStack(alignment: .leading, spacing: 8) { Text(role.team.uppercased()).font(.caption).foregroundStyle(Color.tableHighlight); Text(role.name).font(.headline); Text(role.description) }.padding(.vertical, 6) } }.scrollContentBackground(.hidden).background(Color.tableBackground) }
}
struct ControlView: View {
    @EnvironmentObject var store: TableStore
    let game: GameState
    @Binding var selected: GameAction?
    @State private var showRecovery = false
    @State private var confirmLeave = false
    var body: some View {
        List {
            Section("Session") {
                NavigationLink("Account & saved games") { AccountScreen() }
                Text("\(game.hostName) is Storytelling. Code: \(game.code)")
                Button("Save recovery key") { showRecovery = true }
                Button("Leave this device", role: .destructive) { confirmLeave = true }
                Text("Keep the app open and connected to receive private information. No background push notifications are used.").font(.footnote).foregroundStyle(.secondary)
            }
            if game.host {
                Section("Storyteller control") { ForEach(game.controls.filter { ["configure","undo","rewind","end","overridePhase"].contains($0.action) }) { action in Button(action.title) { selected = action }.disabled(!store.online) } }
                Section("Decision history") { ForEach(game.log.reversed()) { item in VStack(alignment: .leading) { Text(Date(timeIntervalSince1970: item.at / 1000), style: .time).font(.caption).foregroundStyle(.secondary); Text(item.text) }.padding(.vertical, 4) } }
            }
        }.scrollContentBackground(.hidden).background(Color.tableBackground)
        .sheet(isPresented: $showRecovery) { NavigationStack { VStack(alignment: .leading, spacing: 20) { Text("Keep this key private. It restores your seat and expires after 30 days. Anyone with it can access your session."); Text(store.recoveryKey).font(.body.monospaced()).textSelection(.enabled); Button("Copy key") { UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic: store.recoveryKey]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(120)]); showRecovery = false } }.padding().navigationTitle("Recovery key").toolbar { Button("Done") { showRecovery = false } } } }
        .confirmationDialog("Save your recovery key before leaving. Your seat stays in the game.", isPresented: $confirmLeave, titleVisibility: .visible) { Button("Leave this device", role: .destructive) { store.leave() }; Button("Cancel", role: .cancel) {} }
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
                Section { Text(action.description) }
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

struct AccountScreen: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.dismiss) private var dismiss
    @State private var deleteConfirmation = false
    var body: some View {
        List {
            if let state = store.accountState {
                if let account = state.account {
                    Section("Your account") { Text(account.name).font(.headline); Text(account.email).foregroundStyle(.secondary) }
                    Section("Connected accounts") {
                        Button(state.connections.contains("google") ? "Google connected" : "Connect Google") { Task { await store.signIn(provider: "google", link: true) } }.disabled(store.working || state.connections.contains("google") || !state.providers.google)
                        Button(state.connections.contains("apple") ? "Apple connected" : "Connect Apple") { Task { await store.signIn(provider: "apple", link: true) } }.disabled(store.working || state.connections.contains("apple") || !state.providers.apple)
                    }
                    Section("Saved games") {
                        if state.seats.isEmpty { Text("No saved seats yet.").foregroundStyle(.secondary) }
                        ForEach(state.seats) { seat in
                            Button { Task { await store.resumeSeat(seat); if store.authenticated { dismiss() } } } label: { VStack(alignment: .leading) { Text(seat.code).font(.headline.monospaced()); Text((seat.host == 1 ? "Storyteller" : seat.hostName + "’s game") + " · " + seat.phase).font(.caption) } }.disabled(store.working)
                        }
                        if store.authenticated { Button("Save current seat to account") { Task { await store.attachCurrentSeat() } } }
                    }
                    Section { Button("Sign out") { Task { await store.endAccount() } }.disabled(store.working); Button("Delete account", role: .destructive) { deleteConfirmation = true }.disabled(store.working) }
                } else {
                    Section("Create an account or sign in") {
                        Button("Continue with Google") { Task { await store.signIn(provider: "google") } }.disabled(store.working || !state.providers.google)
                        Button("Continue with Apple") { Task { await store.signIn(provider: "apple") } }.disabled(store.working || !state.providers.apple)
                        if !state.providers.google && !state.providers.apple { Text("Account sign-in is not available yet. Guest play is still available.").foregroundStyle(.secondary) }
                    }
                }
            } else { ProgressView("Loading account…") }
            if !store.error.isEmpty { Text(store.error).foregroundStyle(.red) }
            Section { Link("Privacy and account data", destination: store.baseURL.appendingPathComponent("privacy")) }
        }.navigationTitle("Account").scrollContentBackground(.hidden).background(Color.tableBackground)
        .task { await store.refreshAccount() }
        .confirmationDialog("Delete your profile, connections, and saved seat access? Games you host will end. Shared records in other people’s games remain. This cannot be undone.", isPresented: $deleteConfirmation, titleVisibility: .visible) {
            Button("Delete account permanently", role: .destructive) { Task { await store.endAccount(delete: true) } }
            Button("Cancel", role: .cancel) {}
        }
    }
}
