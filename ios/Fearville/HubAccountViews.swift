import SwiftUI

struct NativeStats: View {
    let stats: HubJSON
    @State private var script = ""
    @State private var type = ""
    private var selected: HubJSON { stats["scripts"].items.first { $0["script"].text == script } ?? stats }
    private var filtered: HubJSON { selected["roleTypes"].items.first { $0["type"].text == type } ?? selected }
    private func percentage(_ value: HubJSON) -> String { value.isNull ? "—" : value.text + "%" }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            NativeTitle(text: "Your record")
            HStack { Text("Level " + stats["progression"]["level"].text).font(.title2); Spacer(); Text(stats["progression"]["xp"].text + " XP").foregroundStyle(Color.tableHighlight) }
            ProgressView(value: stats["progression"]["earned"].number, total: max(1, stats["progression"]["required"].number)).accessibilityLabel("Progress to next level")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                tile("Games", stats["games"].text)
                tile("Wins / losses", stats["wins"].text + " / " + stats["losses"].text)
                tile("Win rate", percentage(stats["winRate"]))
                tile("Elo / peak", stats["elo"].text + " / " + stats["peakElo"].text)
                tile("Storyteller games", stats["storyteller"]["games"].text)
                tile("Storyteller rating", stats["storyteller"]["rating"].isNull ? "—" : stats["storyteller"]["rating"].text + " ★")
                tile("MVP votes", stats["mvpVotes"].text)
                tile("MVP bonus XP", stats["mvpXp"].text)
                tile("Good wins / losses", stats["town"]["wins"].text + " / " + stats["town"]["losses"].text)
                tile("Evil wins / losses", stats["evil"]["wins"].text + " / " + stats["evil"]["losses"].text)
                tile("Ranked wins / losses", stats["ranked"]["wins"].text + " / " + stats["ranked"]["losses"].text)
                tile("Survival", percentage(stats["survivalRate"]))
                tile("Current / best streak", stats["currentWinStreak"].text + " / " + stats["bestWinStreak"].text)
                tile("Average duration", stats["averageDurationMinutes"].isNull ? "—" : stats["averageDurationMinutes"].text + " min")
                tile("Average opponent Elo", stats["averageOpponentElo"].isNull ? "—" : stats["averageOpponentElo"].text)
                tile("Average teammate Elo", stats["averageTeamElo"].isNull ? "—" : stats["averageTeamElo"].text)
            }
            Picker("Script", selection: $script) { Text("All scripts").tag(""); ForEach(Array(stats["scripts"].items.enumerated()), id: \.offset) { _, item in Text(item["name"].text).tag(item["script"].text) } }
                .onChange(of: script) { _, _ in type = "" }
            Picker("Role type", selection: $type) { Text("All role types").tag(""); ForEach(Array(selected["roleTypes"].items.enumerated()), id: \.offset) { _, item in Text(item["type"].text.capitalized).tag(item["type"].text) } }
            Text(hubRecordLine(filtered, rate: percentage(filtered["winRate"]))).font(.callout).foregroundStyle(.secondary)
            ForEach(filtered["roles"].items) { role in
                VStack(alignment: .leading, spacing: 8) { Label(role["name"].text, systemImage: nativeRoleIcon(role["roleType"].text)).font(.headline); Text(hubRecordLine(role, rate: percentage(role["winRate"]))).font(.callout); Text(hubEloLine(role)).font(.caption).foregroundStyle(.secondary); Divider() }
            }
            if filtered["roles"].items.isEmpty { Text("Your character statistics appear after your first completed game.").foregroundStyle(.secondary) }
        }
    }
    private func tile(_ label: String, _ value: String) -> some View { VStack(alignment: .leading, spacing: 8) { Text(label).font(.caption).foregroundStyle(.secondary); Text(value).font(.title2.weight(.semibold)).minimumScaleFactor(0.6).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading).padding(16).background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 12)) }
}
struct NativeHistory: View {
    @EnvironmentObject var store: TableStore
    var handle: String? = nil
    @State private var rows: [HubJSON] = []
    @State private var offset = 0
    @State private var more = true
    @State private var loading = false
    @State private var error = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Past games").font(.title2)
            ForEach(rows) { game in
                VStack(alignment: .leading, spacing: 10) {
                    Text(game["storyteller"].flag ? "Storyteller" : game["roleName"].text).font(.headline)
                    Text(hubGameResult(game)).foregroundStyle(Color.tableHighlight)
                    Text(hubGameScript(game)).font(.caption)
                    Text(hubGameRewards(game)).font(.caption).foregroundStyle(.secondary)
                    if handle == nil { NavigationLink("View recap") { NativeRecap(id: game["id"].text) } }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(18).background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 12))
            }
            if rows.isEmpty && !loading { Text("Completed games appear here.").foregroundStyle(.secondary) }
            if more { Button(loading ? "Loading…" : "Load older games") { Task { await load() } }.disabled(loading) }
            if !error.isEmpty { Text(error).foregroundStyle(.red) }
        }.task { if rows.isEmpty { await load() } }
    }
    private func load() async {
        loading = true; defer { loading = false }
        do {
            var components = URLComponents(); components.path = "api/social/history"; components.queryItems = [URLQueryItem(name: "offset", value: String(offset))]; if let handle { components.queryItems?.append(URLQueryItem(name: "handle", value: handle)) }
            let data: HubJSON = try await store.request(components.string!)
            rows.append(contentsOf: data["games"].items.filter { new in !rows.contains { $0.id == new.id } }); more = !data["nextOffset"].isNull; offset = Int(data["nextOffset"].number); error = ""
        } catch { self.error = error.localizedDescription }
    }
}
struct NativeRecap: View {
    @EnvironmentObject var store: TableStore
    let id: String
    @State private var recap: HubJSON?
    @State private var error = ""
    var body: some View {
        List {
            if let recap {
                Section { NativeTitle(text: "The town, revealed."); Text((recap["winner"].text == "good" ? "Good" : "Evil") + " won · " + hubDate(recap["ended"].number)) }
                Section("Players & secrets") { ForEach(recap["players"].items) { player in NavigationLink { NativeRecapPlayer(player: player, recap: recap) } label: { HStack { NativeAvatar(avatar: player["avatar"].text.isEmpty ? "ghost" : player["avatar"].text).frame(width: 40, height: 40); VStack(alignment: .leading) { Text(player["name"].text); Text(player["role"].text + (player["alive"].flag ? " · Survived" : " · Died")).font(.caption).foregroundStyle(.secondary) } } } } }
                Section("Storyteller decisions") { ForEach(recap["decisions"].items) { decision in VStack(alignment: .leading, spacing: 8) { Text(decision["text"].text); Text(Date(timeIntervalSince1970: decision["at"].number / 1000), style: .time).font(.caption).foregroundStyle(.secondary) } }; if recap["decisions"].items.isEmpty { Text("No decisions were recorded.") } }
            } else if error.isEmpty { ProgressView("Loading recap…") }
            if !error.isEmpty { Text(error).foregroundStyle(.red); Button("Retry") { Task { await load() } } }
        }.scrollContentBackground(.hidden).background(Color.tableBackground).navigationTitle("Game recap").task { await load() }
    }
    private func load() async { do { var c = URLComponents(); c.path = "api/social/recap"; c.queryItems = [URLQueryItem(name: "id", value: id)]; let data: HubJSON = try await store.request(c.string!); recap = data["recaps"].items.first; error = "" } catch { self.error = error.localizedDescription } }
}
struct NativeRecapPlayer: View {
    let player: HubJSON
    let recap: HubJSON
    @State private var tab = "history"
    var body: some View {
        List {
            Section { Text(player["role"].text).font(.title2); Picker("Recap section", selection: $tab) { Text("History").tag("history"); Text("Notes").tag("notes"); Text("Messages").tag("messages") }.pickerStyle(.segmented) }
            if tab == "history" { Section("Their story") { ForEach(recap["decisions"].items.filter { $0["actor"].text == player.id || $0["playerIds"].items.contains { $0.text == player.id } }) { Text($0["text"].text) } } }
            if tab == "notes" {
                Section("Notebook") { Text(player["notebook"]["text"].text.isEmpty ? "No written notes." : player["notebook"]["text"].text) }
                Section("Player suspicions") { ForEach(player["notebook"]["players"].fields.keys.sorted(), id: \.self) { key in Text(hubSuspicion(recap: recap, notebook: player["notebook"], key: key)) } }
                Section("Role notes") { ForEach(player["notebook"]["roles"].fields.keys.sorted(), id: \.self) { key in Text(key + ": " + player["notebook"]["roles"][key].text) } }
            }
            if tab == "messages" { Section("Messages") { ForEach(recap["messages"].items.filter { $0["from"].text == player.id || $0["to"].text == player.id || $0["to"].text == "all" }) { message in VStack(alignment: .leading, spacing: 8) { Text(message["from"].text == "host" ? "Storyteller" : recap["players"].items.first { $0.id == message["from"].text }?["name"].text ?? "Player").font(.caption).foregroundStyle(Color.tableHighlight); Text(message["text"].text) } } } }
        }.scrollContentBackground(.hidden).background(Color.tableBackground).navigationTitle(player["name"].text)
    }
}
struct NativePublicProfile: View {
    @EnvironmentObject var store: TableStore
    let handle: String
    @State private var data: HubJSON?
    @State private var error = ""
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                NativeTitle(text: "@" + handle)
                if let data {
                    NativeAvatar(avatar: data["account"]["avatar"].text.isEmpty ? "ghost" : data["account"]["avatar"].text).frame(width: 72, height: 72)
                    Text(data["account"]["name"].text).font(.title2)
                    Text(data["relation"].text.capitalized).foregroundStyle(.secondary)
                    if data["canRequest"].flag { Button("Send friend request") { Task { await store.socialAction(["action": .string("request"), "handle": .string(handle)]); await load() } }.disabled(store.working) }
                    if data["stats"].isNull { Text("This player’s record is private.").foregroundStyle(.secondary) } else { NativeStats(stats: data["stats"]) }
                    if data["recent"].isNull { Text("Game history is private.").foregroundStyle(.secondary) } else { NativeHistory(handle: handle) }
                } else if error.isEmpty { ProgressView() }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }; NativeError()
            }.padding(22)
        }.background(Color.tableBackground).navigationTitle("Player profile").task { await load() }
    }
    private func load() async { do { var c = URLComponents(); c.path = "api/social/profile"; c.queryItems = [URLQueryItem(name: "handle", value: handle)]; data = try await store.request(c.string!); error = "" } catch { self.error = error.localizedDescription } }
}
struct NativeSettings: View {
    @EnvironmentObject var store: TableStore
    @EnvironmentObject var tutorials: TutorialCenter
    @State private var tutorialsReset = false
    @Environment(\.dismiss) private var dismiss
    @State private var preferences = NativePreferences()
    @State private var stats = "friends"
    @State private var history = "friends"
    @State private var requests = true
    @State private var invites = "friends"
    @State private var loaded = false
    @State private var busy = false
    @State private var message = ""
    @State private var musicPreview = false
    @State private var delete = false
    @State private var confirmation = ""
    var body: some View {
        Form {
            Section("Sound & comfort") {
                Text("Music · \(Int(preferences.music))%"); Slider(value: $preferences.music, in: 0...100, step: 1).accessibilityLabel("Music volume")
                Text("Sound effects · \(Int(preferences.sfx))%"); Slider(value: $preferences.sfx, in: 0...100, step: 1).accessibilityLabel("Sound effects volume")
                Button(musicPreview ? "Stop music preview" : "Preview music") { musicPreview.toggle(); NativeAudio.shared.ambient(musicPreview) }
                Button("Test sound effect") { NativeAudio.shared.cue() }
                Toggle("Mute in background", isOn: $preferences.muteInBackground)
                Toggle("Reduce motion", isOn: $preferences.reducedMotion)
                Toggle("Larger text", isOn: $preferences.largerText)
            }
            Section("Privacy & social") {
                Toggle("Public profile statistics", isOn: Binding(get: { stats == "public" }, set: { stats = $0 ? "public" : "friends" }))
                Toggle("Receive friend requests", isOn: $requests)
                Toggle("Show online status to friends", isOn: $preferences.showOnline)
                Picker("Record visibility", selection: $stats) { Text("Public").tag("public"); Text("Friends").tag("friends"); Text("Only me").tag("private") }
                Picker("Game history", selection: $history) { Text("Public").tag("public"); Text("Friends").tag("friends"); Text("Only me").tag("private") }
                Picker("Game invitations", selection: $invites) { Text("Friends").tag("friends"); Text("Nobody").tag("nobody") }
                Text("Your username remains searchable. Detailed recaps are only available to participants.").font(.caption).foregroundStyle(.secondary)
            }.disabled(!loaded)
            Section { Button(busy ? "Saving…" : "Save settings") { Task { await save() } }.disabled(busy || !loaded); if !message.isEmpty { Text(message).foregroundStyle(Color.tableHighlight) }; NativeError() }
            Section("Tutorials") {
                Button("Show tutorials again") { Task { await tutorials.reset(); tutorialsReset = true } }
                Text(tutorialsReset ? "Tutorials will show again." : "Each tutorial shows once per account, on every device.").font(.caption).foregroundStyle(.secondary)
            }
            Section("Sign-in connections") {
                Text(store.accountState?.account?.email ?? "")
                ForEach(["google", "apple"], id: \.self) { provider in
                    let connected = store.accountState?.connections.contains(provider) == true
                    Button((connected ? "Connected to " : "Connect ") + provider.capitalized) { Task { await store.signIn(provider: provider, link: true) } }.disabled(connected || store.working || (provider == "google" ? store.accountState?.providers.google != true : store.accountState?.providers.apple != true))
                }
                Button("Sign out") { Task { await store.endAccount(); if store.error.isEmpty { dismiss() } } }.disabled(store.working)
                Button("Delete account", role: .destructive) { delete = true }
            }
        }.scrollContentBackground(.hidden).background(Color.tableBackground).navigationTitle("Settings").toolbar { Button("Done") { dismiss() } }
        .task { preferences = store.preferences; await store.refreshSocial(); if let privacy = store.socialState?["privacy"] { stats = privacy["stats"].text; history = privacy["history"].text; requests = privacy["requests"].text == "everyone"; invites = privacy["invites"].text; loaded = true } }
        .onChange(of: preferences) { _, value in store.preferences = value; NativeAudio.shared.apply(value) }
        .onDisappear { NativeAudio.shared.ambient(store.showingTable) }
        .alert("Delete your account?", isPresented: $delete) {
            TextField("Type DELETE", text: $confirmation)
            Button("Delete account", role: .destructive) { Task { await store.endAccount(delete: true); if store.error.isEmpty { dismiss() } } }.disabled(confirmation != "DELETE" || store.working)
            Button("Cancel", role: .cancel) { confirmation = "" }
        } message: { Text("This permanently removes your profile, friends, connections, and saved seats, and closes games you host. Finished games remain in other players’ history without your account link.") }
    }
    private func save() async {
        busy = true; message = ""; defer { busy = false }
        do { try await store.saveAccount(["action": .string("preferences"), "settings": .object(preferences.fields)]); let _: HubJSON = try await store.request("api/social", body: ["action": .string("privacy"), "privacy": .object(["stats": .string(stats), "history": .string(history), "requests": .string(requests ? "everyone" : "nobody"), "invites": .string(invites)])]); message = "Settings saved." } catch { message = error.localizedDescription }
    }
}

// Built outside the views: long string concatenations inside a ViewBuilder
// exceed the Swift type checker's time limit.
func hubGameResult(_ game: HubJSON) -> String {
    let winner: String = game["winner"].text == "good" ? "Good" : "Evil"
    return winner + " won · " + hubDate(game["ended"].number)
}
func hubGameScript(_ game: HubJSON) -> String {
    let script: String = game["script"].text == "horrors" ? "Horrors of Fearville" : "Holy Moon and Stars"
    return script + " · " + game["players"].text + " players"
}
func hubGameRewards(_ game: HubJSON) -> String {
    let elo: String = game["ranked"].flag ? " · Elo " + game["eloDelta"].text : ""
    return game["xp"].text + " XP · " + game["mvpVotes"].text + " MVP votes" + elo
}
func hubSuspicion(recap: HubJSON, notebook: HubJSON, key: String) -> String {
    let note: HubJSON = notebook["players"][key]
    let name: String = recap["players"].items.first { $0.id == key }?["name"].text ?? key
    return name + ": " + note["role"].text + " · " + note["confidence"].text
}
func hubRecordLine(_ record: HubJSON, rate: String) -> String {
    let played: String = record["played"].text, wins: String = record["wins"].text, losses: String = record["losses"].text
    return played + " played · " + wins + " wins · " + losses + " losses · " + rate
}
func hubEloLine(_ role: HubJSON) -> String {
    let opponent: String = role["averageOpponentElo"].isNull ? "—" : role["averageOpponentElo"].text
    let team: String = role["averageTeamElo"].isNull ? "—" : role["averageTeamElo"].text
    return "Opponent Elo " + opponent + " · Teammate Elo " + team
}
