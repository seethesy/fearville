import SwiftUI
import PhotosUI
import UIKit

struct NativeTitle: View {
    let text: String
    var body: some View { Text(text).font(.custom("MetalMania-Regular", size: 34, relativeTo: .largeTitle)).foregroundStyle(.primary) }
}
struct NativeError: View {
    @EnvironmentObject var store: TableStore
    var body: some View { if !store.error.isEmpty { Text(store.error).foregroundStyle(.red).font(.callout).accessibilityAddTraits(.updatesFrequently) } }
}
struct NativeHub: View {
    @State private var selection = 0
    private let tabs = [("Play", "play.fill"), ("Social", "globe"), ("Rules", "book"), ("Account", "person.crop.circle")]
    var body: some View {
        Group {
            switch selection {
            case 1: NavigationStack { NativeSocial() }
            case 2: NavigationStack { NativeRules() }
            case 3: NavigationStack { NativeAccount() }
            default: NavigationStack { NativePlay() }
            }
        }.safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                ForEach(0..<tabs.count, id: \.self) { i in
                    Button { selection = i } label: {
                        Image(systemName: tabs[i].1).font(.title3).frame(maxWidth: .infinity).frame(height: 50)
                            .foregroundStyle(selection == i ? Color.tableHighlight : .secondary)
                            .background(selection == i ? Color.tableAccent.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 12))
                    }.accessibilityLabel(tabs[i].0).accessibilityAddTraits(selection == i ? .isSelected : [])
                }
            }.padding(.horizontal, 18).padding(.vertical, 8).background(Color.tablePanel)
        }
    }
}
struct NativeSignIn: View {
    @EnvironmentObject var store: TableStore
    var body: some View {
        VStack(spacing: 14) {
            Text("SIGN IN OR CREATE AN ACCOUNT").font(.caption).tracking(2).foregroundStyle(Color.tableHighlight)
            Button { Task { await store.signIn(provider: "google") } } label: { Text("Continue with Google").frame(maxWidth: .infinity) }.disabled(store.working || store.accountState?.providers.google != true)
            Button { Task { await store.signIn(provider: "apple") } } label: { Label("Continue with Apple", systemImage: "apple.logo").frame(maxWidth: .infinity) }.disabled(store.working || store.accountState?.providers.apple != true)
            if let availability = store.accountState?.providers, !availability.google && !availability.apple { Text("Account sign-in is currently unavailable. You can still join as a guest.").font(.footnote).foregroundStyle(.secondary) }
        }.buttonStyle(.bordered).controlSize(.large)
    }
}
struct NativeWelcome: View {
    @EnvironmentObject var store: TableStore
    @State private var guest = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    Image("FearvilleLogo").resizable().scaledToFit().frame(width: 86, height: 86).accessibilityHidden(true)
                    NativeTitle(text: "Welcome to Fearville.")
                    Text("Hidden roles. Tall tales. Suspicious friends.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                    NativeSignIn()
                    if guest { NativeJoin(guest: true) }
                    else { Button("Continue as guest") { guest = true }.buttonStyle(.borderedProminent).controlSize(.large) }
                    if store.authenticated { Button("Rejoin your lobby") { store.showingTable = true } }
                    NativeRecovery()
                    NativeError()
                }.padding(26)
            }.background(Color.tableBackground)
        }
    }
}
struct NativeJoin: View {
    @EnvironmentObject var store: TableStore
    var guest = false
    @State private var name = ""
    @State private var code = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if guest { TextField("Lobby name", text: $name).textContentType(.nickname).onChange(of: name) { _, value in name = String(value.prefix(32)) } }
            Text("Have a code? Join below!").font(.headline)
            TextField("6-digit session code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode).font(.title2.monospaced()).onChange(of: code) { _, value in code = String(value.filter { ($0.isASCII && $0.isLetter) || ($0.isASCII && $0.isNumber) }.prefix(6)).uppercased() }
            Button { Task { await store.enter(action: "join", name: name, code: code) } } label: { Text(store.working ? "Joining…" : "Join game").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large).disabled(store.working || code.count != 6 || (guest && name.trimmingCharacters(in: .whitespaces).isEmpty))
        }.textFieldStyle(.roundedBorder).padding(20).background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 16))
    }
}
struct NativeRecovery: View {
    @EnvironmentObject var store: TableStore
    @State private var key = ""
    var body: some View {
        DisclosureGroup("Recover a seat on another device") {
            SecureField("Private recovery key", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder)
            Button("Restore my seat") { Task { await store.enter(action: "restore", name: "", recovery: key) } }.disabled(key.isEmpty || store.working)
        }.font(.callout)
    }
}
struct NativePlay: View {
    @EnvironmentObject var store: TableStore
    @State private var custom = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NativeTitle(text: "Choose your game.")
                Text("Gather the town. The night is yours.").foregroundStyle(.secondary)
                if store.authenticated { Button("Rejoin your lobby") { store.showingTable = true }.buttonStyle(.bordered) }
                VStack(spacing: 12) {
                    ForEach(["Standard", "Quickplay", "Rated"], id: \.self) { mode in
                        Button {} label: { HStack { Text(mode).font(.headline); Spacer(); Text("Coming soon").font(.caption) }.padding(22).frame(maxWidth: .infinity).background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 12)) }.disabled(true).opacity(0.45).accessibilityLabel(mode + ", coming soon")
                    }
                    Button { custom.toggle() } label: { HStack { Label("Custom", systemImage: "wand.and.stars").font(.headline); Spacer(); Image(systemName: "arrow.right") }.padding(22).background(Color.tableAccent.opacity(0.18), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.tableAccent)) }
                    if custom {
                        Button("Create a lobby") { Task { await store.enter(action: "create", name: "") } }.buttonStyle(.borderedProminent).controlSize(.large)
                        Button("Open sandbox") { Task { await store.enter(action: "createSandbox", name: "") } }.buttonStyle(.bordered).controlSize(.large)
                        Text("Sandbox has practice players and no timers.").font(.footnote).foregroundStyle(.secondary)
                    }
                }.disabled(store.working)
                NativeJoin()
                NativeError()
                if let seats = store.accountState?.seats, !seats.isEmpty {
                    Text("Saved lobbies").font(.title2)
                    ForEach(seats) { seat in HStack { VStack(alignment: .leading) { Text(seat.code).font(.headline.monospaced()); Text(seat.host == 1 ? "Storyteller" : seat.hostName + "’s table").font(.caption).foregroundStyle(.secondary) }; Spacer(); Button("Rejoin") { Task { await store.resumeSeat(seat) } }.disabled(store.working) } }
                }
                NativeRecovery()
            }.padding(22)
        }.background(Color.tableBackground).navigationTitle("Fearville").navigationBarTitleDisplayMode(.inline).task { await store.refreshAccount() }
    }
}
struct NativeSocial: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.scenePhase) private var scene
    @State private var username = ""
    @State private var pending: HubJSON?
    @State private var action = ""
    var body: some View {
        List {
            Section { NativeTitle(text: "Find your people."); NativeError() }
            Section("Add a friend") {
                TextField("@username", text: $username).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Send friend request") { Task { await store.socialAction(["action": .string("request"), "handle": .string(username)]); if store.error.isEmpty { username = "" } } }.disabled(username.isEmpty || store.working || store.accountState?.account?.handle == nil)
                if store.accountState?.account?.handle == nil { Text("Choose a unique username in Profile first.").font(.footnote).foregroundStyle(.secondary) }
            }
            if let data = store.socialState {
                if !data["invites"].items.isEmpty { Section("Invitations") { ForEach(data["invites"].items) { invite in VStack(alignment: .leading, spacing: 10) { Text(invite["hostName"].text + "’s table · " + invite["code"].text).font(.headline); Text("Invited by " + invite["sender"]["name"].text).font(.caption); HStack { inviteButton("Join", "acceptInvite", invite); inviteButton("Decline", "declineInvite", invite) } } } } }
                Section("Friends") {
                    if data["friends"].items.isEmpty { Text("Your friends will appear here. Share your username to get started.").foregroundStyle(.secondary) }
                    ForEach(data["friends"].items.sorted { $0["online"].flag && !$1["online"].flag }) { person in
                        VStack(alignment: .leading, spacing: 12) {
                            personLink(person)
                            HStack { Circle().fill(person["online"].flag ? .green : .gray).frame(width: 7, height: 7); Text(person["online"].flag ? "Online" : "Offline"); Text("· " + person["together"].text + " games together") }.font(.caption).foregroundStyle(.secondary)
                            HStack { Button("Remove") { pending = person; action = "remove" }; Button("Block", role: .destructive) { pending = person; action = "block" } }.font(.caption)
                        }.padding(.vertical, 5)
                    }
                }
                Section("Friend requests") {
                    ForEach(data["incoming"].items) { person in VStack(alignment: .leading) { personLink(person); HStack { personButton("Accept", "accept", person); personButton("Decline", "dismiss", person); Button("Block", role: .destructive) { pending = person; action = "block" } } } }
                    ForEach(data["outgoing"].items) { person in HStack { personLink(person); Spacer(); personButton("Cancel request", "dismiss", person) } }
                    if data["incoming"].items.isEmpty && data["outgoing"].items.isEmpty { Text("No pending requests.").foregroundStyle(.secondary) }
                }
                Section("Blocked users") {
                    ForEach(data["blocked"].items) { person in HStack { Text("@" + person["handle"].text); Spacer(); personButton("Unblock", "unblock", person) } }
                    if data["blocked"].items.isEmpty { Text("No blocked users.").foregroundStyle(.secondary) }
                }
            } else { ProgressView("Loading friends…") }
        }.buttonStyle(.borderless).scrollContentBackground(.hidden).background(Color.tableBackground).navigationTitle("Social").navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshSocial() }
        .task(id: scene) { guard scene == .active else { return }; while !Task.isCancelled { await store.refreshSocial(); do { try await Task.sleep(for: .seconds(15)) } catch { return } } }
        .confirmationDialog(action == "block" ? "Block this player?" : "Remove this friend?", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), titleVisibility: .visible) { Button(action == "block" ? "Block player" : "Remove friend", role: .destructive) { if let person = pending { Task { await store.socialAction(["action": .string(action), "account": .string(person["id"].text)]) } }; pending = nil }; Button("Cancel", role: .cancel) { pending = nil } }
    }
    @ViewBuilder private func personLink(_ person: HubJSON) -> some View {
        if !person["handle"].text.isEmpty { NavigationLink { NativePublicProfile(handle: person["handle"].text) } label: { HStack { NativeAvatar(avatar: person["avatar"].text.isEmpty ? "ghost" : person["avatar"].text).frame(width: 38, height: 38); VStack(alignment: .leading) { Text(person["name"].text); Text("@" + person["handle"].text).font(.caption).foregroundStyle(.secondary) } } } }
        else { Text(person["name"].text) }
    }
    private func personButton(_ title: String, _ operation: String, _ person: HubJSON) -> some View { Button(title) { Task { await store.socialAction(["action": .string(operation), "account": .string(person["id"].text)]) } }.disabled(store.working) }
    private func inviteButton(_ title: String, _ operation: String, _ invite: HubJSON) -> some View { Button(title) { Task { await store.socialAction(["action": .string(operation), "invite": .string(invite["id"].text)]) } }.disabled(store.working) }
}
struct NativeRules: View {
    @State private var script = "horrors"
    var body: some View { ScriptView(script: script).safeAreaInset(edge: .top) { Picker("Script", selection: $script) { Text("Horrors of Fearville").tag("horrors"); Text("Holy Moon and Stars").tag("holyMoonStars") }.pickerStyle(.segmented).padding().background(Color.tablePanel) }.navigationTitle("Rules & scripts").navigationBarTitleDisplayMode(.inline) }
}
struct NativeAccount: View {
    @EnvironmentObject var store: TableStore
    @EnvironmentObject var tutorials: TutorialCenter
    @State private var tab = "profile"
    @State private var settings = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                NativeTitle(text: "Your place in the town.")
                Picker("Account section", selection: $tab) { Text("Profile").tag("profile"); Text("History").tag("history") }.pickerStyle(.segmented)
                if store.accountState?.account == nil { NativeSignIn() }
                else if tab == "profile" {
                    NativeProfileEditor()
                    if let data = store.socialState { NativeStats(stats: data["stats"]) } else { ProgressView("Loading your record…") }
                } else {
                    Text("Saved lobbies").font(.title2)
                    Button("Save the seat on this device") { Task { await store.attachCurrentSeat() } }
                    ForEach(store.accountState?.seats ?? []) { seat in HStack { Text(seat.code).monospaced(); Spacer(); Button("Rejoin") { Task { await store.resumeSeat(seat) } }.disabled(store.working) } }
                    NativeHistory()
                    if let data = store.socialState {
                        Text("Storyteller feedback").font(.title2)
                        if data["ratings"].items.isEmpty { Text("Player feedback appears here after you storytell.").foregroundStyle(.secondary) }
                        ForEach(Array(data["ratings"].items.enumerated()), id: \.offset) { _, rating in VStack(alignment: .leading, spacing: 8) { Text(String(repeating: "★", count: Int(rating["stars"].number))).foregroundStyle(Color.tableHighlight); Text(hubDate(rating["created"].number)).font(.caption); if !rating["comment"].text.isEmpty { Text(rating["comment"].text) } } }
                    }
                }
                NativeError()
            }.padding(22)
        }.background(Color.tableBackground).navigationTitle("Account").navigationBarTitleDisplayMode(.inline)
        .toolbar { Button { settings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings") }
        .sheet(isPresented: $settings) { NavigationStack { NativeSettings() } }
        .task { await store.refreshSocial() }
        .onAppear { tutorials.requestSection("account") }
    }
}
struct NativeAvatar: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let avatar: String
    var effect = "none"
    var alive = true
    @State private var animate = false
    private var symbol: String { nativeAvatars.first { $0.0 == avatar }?.2 ?? "cloud.fog" }
    private var photo: UIImage? { guard avatar.hasPrefix("data:image/jpeg;base64,"), let bytes = Data(base64Encoded: String(avatar.dropFirst(23))) else { return nil }; return UIImage(data: bytes) }
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Circle().fill(Color.tableAccent.opacity(0.14))
                if let photo { Image(uiImage: photo).resizable().scaledToFill().frame(width: geometry.size.width, height: geometry.size.height).clipShape(Circle()) }
                else { Image(systemName: symbol).resizable().scaledToFit().padding(geometry.size.width * 0.23).foregroundStyle(Color.tableHighlight) }
                if animate { Image(systemName: effect == "embers" ? "flame.fill" : effect == "petals" ? "camera.macro" : effect == "mist" ? "cloud.fog.fill" : "sparkles").font(.largeTitle).foregroundStyle(effect == "petals" ? .pink : Color.tableHighlight).offset(y: -32).transition(.scale.combined(with: .opacity)) }
            }.opacity(alive ? 1 : 0.55).overlay(Circle().stroke(Color.tableHighlight.opacity(0.5)))
        }.onChange(of: alive) { old, next in
            guard old && !next, effect != "none", !store.preferences.reducedMotion, !reduceMotion else { return }
            withAnimation(.easeOut(duration: 0.7)) { animate = true }
            Task { try? await Task.sleep(for: .seconds(1.5)); withAnimation { animate = false } }
        }.accessibilityLabel(avatar.hasPrefix("data:") ? "Profile photo" : nativeAvatars.first { $0.0 == avatar }?.1 ?? "Avatar")
    }
}
struct NativeProfileEditor: View {
    @EnvironmentObject var store: TableStore
    @State private var avatar = "ghost"
    @State private var lobbyName = ""
    @State private var username = ""
    @State private var effect = "spirit"
    @State private var photo: PhotosPickerItem?
    @State private var previewAlive = true
    @State private var editing = false
    @State private var busy = false
    @State private var message = ""
    private var nextChange: Double { (store.accountState?.account?.handleChangedAt ?? 0) + 30 * 86400000 }
    private var locked: Bool { store.accountState?.account?.handleChangedAt != nil && nextChange > Date().timeIntervalSince1970 * 1000 }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 20) { NativeAvatar(avatar: avatar, effect: effect, alive: previewAlive).frame(width: 78, height: 78); VStack(alignment: .leading) { Text(username.isEmpty ? "Your identity" : "@" + username).font(.title2); Text(lobbyName).foregroundStyle(.secondary) }; Spacer() }
            Button(editing ? "Hide profile editor" : "Edit profile & cosmetics") { editing.toggle() }
            if editing {
                Text("Unique username").font(.headline)
                TextField("Username", text: $username).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().disabled(locked).onChange(of: username) { _, value in username = String(value.prefix(20)) }
                Text(locked ? "Next change: " + hubDate(nextChange) : "3–20 letters, numbers, or underscores. Changes allowed once every 30 days; not case-sensitive.").font(.caption).foregroundStyle(.secondary)
                Button("Save username") { save(["action": .string("handle"), "handle": .string(username)]) }.disabled(locked || busy || username.count < 3 || username.lowercased() == store.accountState?.account?.handle)
                Divider()
                Text("Default lobby name").font(.headline)
                TextField("Name at the table", text: $lobbyName).textContentType(.nickname).onChange(of: lobbyName) { _, value in lobbyName = String(value.prefix(32)) }
                Text("Other players may use the same lobby name.").font(.caption).foregroundStyle(.secondary)
                Text("Default avatar").font(.headline)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 14) {
                    ForEach(nativeAvatars, id: \.0) { preset in Button { avatar = preset.0 } label: { VStack(spacing: 6) { NativeAvatar(avatar: preset.0).frame(width: 42, height: 42); Text(preset.1).font(.system(size: 9)) }.frame(maxWidth: .infinity).padding(8).background(avatar == preset.0 ? Color.tableAccent.opacity(0.2) : Color.clear, in: RoundedRectangle(cornerRadius: 8)) }.accessibilityLabel(preset.1).accessibilityAddTraits(avatar == preset.0 ? .isSelected : []) }
                }
                PhotosPicker(selection: $photo, matching: .images) { Label("Upload a profile photo", systemImage: "photo") }.disabled(busy)
                Text("Preset collisions receive a temporary random icon in that lobby. Uploaded photos can repeat.").font(.caption).foregroundStyle(.secondary)
                Picker("Death animation", selection: $effect) { ForEach(nativeEffects, id: \.0) { Text($0.1).tag($0.0) } }
                Button("Preview death animation") { previewAlive = true; Task { try? await Task.sleep(for: .milliseconds(100)); previewAlive = false; try? await Task.sleep(for: .seconds(2)); previewAlive = true } }.disabled(effect == "none" || store.preferences.reducedMotion)
                Button("Save profile") { save(["action": .string("profile"), "lobbyName": .string(lobbyName), "avatar": .string(avatar), "deathEffect": .string(effect)]) }.buttonStyle(.borderedProminent).disabled(busy || lobbyName.trimmingCharacters(in: .whitespaces).isEmpty)
                if !message.isEmpty { Text(message).font(.callout).foregroundStyle(Color.tableHighlight) }
            }
        }.textFieldStyle(.roundedBorder).padding(20).background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 16))
        .onAppear { let p = store.accountState?.profile; avatar = p?.avatar ?? "ghost"; effect = p?.deathEffect ?? "spirit"; lobbyName = p?.lobbyName ?? store.accountState?.account?.name ?? ""; username = store.accountState?.account?.handle ?? "" }
        .onChange(of: photo) { _, item in Task { busy = true; defer { busy = false }; do { guard let data = try await item?.loadTransferable(type: Data.self), data.count <= 8 * 1024 * 1024, let image = UIImage(data: data) else { throw NSError(domain: "Photo", code: 1, userInfo: [NSLocalizedDescriptionKey: "Choose an image smaller than 8 MB."]) }; avatar = try portrait(image) } catch { message = error.localizedDescription } } }
    }
    private func save(_ fields: [String: FieldValue]) { busy = true; message = ""; Task { defer { busy = false }; do { try await store.saveAccount(fields); username = store.accountState?.account?.handle ?? username; message = "Saved. Profile defaults apply when you join your next lobby." } catch { message = error.localizedDescription } } }
    private func portrait(_ image: UIImage) throws -> String {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let result = UIGraphicsImageRenderer(size: CGSize(width: 128, height: 128), format: format).image { context in
            UIColor.darkGray.setFill(); context.fill(CGRect(x: 0, y: 0, width: 128, height: 128))
            let scale = max(128 / image.size.width, 128 / image.size.height), width = image.size.width * scale, height = image.size.height * scale
            image.draw(in: CGRect(x: (128 - width) / 2, y: (128 - height) / 2, width: width, height: height))
        }
        for quality in [0.85, 0.7, 0.5, 0.3] { if let bytes = result.jpegData(compressionQuality: quality) { let value = "data:image/jpeg;base64," + bytes.base64EncodedString(); if value.count <= 16000 { return value } } }
        throw NSError(domain: "Photo", code: 2, userInfo: [NSLocalizedDescriptionKey: "This photo is too detailed. Try a simpler image."])
    }
}
