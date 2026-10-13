import SwiftUI

let officialTextDefaults: [String: String] = {
    guard let url = Bundle.main.url(forResource: "ui-text", withExtension: "json"), let data = try? Data(contentsOf: url), let defaults = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
    return defaults
}()
extension TableStore {
    func uiText(_ key: String, fallback: String = "", values: [String: String] = [:]) -> String {
        var text = textOverrides[key]?["value"].text ?? officialTextDefaults[key] ?? fallback
        for (name, value) in values { text = text.replacingOccurrences(of: "{" + name + "}", with: value) }
        return text
    }
    func refreshOfficialText() async {
        if let reply: HubJSON = try? await request("api/ui-text") { textOverrides = reply["overrides"].fields }
    }
}
extension HubJSON {
    var consoleText: String {
        switch self {
        case .object(let fields): return fields.keys.sorted().map { $0 + ": " + (fields[$0]?.consoleText ?? "") }.joined(separator: "\n")
        case .array(let rows): return rows.map(\.consoleText).joined(separator: "\n\n")
        case .null: return "—"
        default: return text
        }
    }
}
struct NativeAdmin: View {
    @EnvironmentObject var store: TableStore
    @State private var tab = 0
    @State private var input = ""
    @State private var output: [String] = []
    @State private var history: [String] = []
    @State private var cursor = 0
    @State private var pending: String?
    @State private var confirmationToken = ""
    @State private var busy = false
    @State private var error = ""
    @State private var editMode = false
    @State private var selected: AdminTextSelection?
    @State private var audit: [HubJSON] = []
    @State private var action = ""
    @State private var target = ""
    @State private var from = ""
    @State private var to = ""
    @State private var offset = 0
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("ADMIN ACCOUNT").font(.caption).foregroundStyle(Color.tableHighlight)
                    NativeTitle(text: "Administration")
                    Picker("Section", selection: $tab) { Text("Console").tag(0); Text("Text").tag(1); Text("Audit").tag(2) }.pickerStyle(.segmented)
                    if !error.isEmpty { Text(error).foregroundStyle(.red) }
                    if tab == 0 { console }
                    else if tab == 1 { textEditor }
                    else { auditView }
                }.padding(22)
            }.background(Color.tableBackground)
                .toolbar { Button("Sign out") { Task { await store.endAccount() } } }
                .sheet(item: $selected) { key in NativeTextEditor(textKey: key.id).environmentObject(store) }
                .task { await store.refreshAccount() }
                .onChange(of: tab) { _, value in if value == 2 { Task { await loadAudit(0) } } }
        }
    }
    private var console: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Use help for commands, catalog for items. All commands are audited.").font(.footnote)
            ForEach(Array(output.enumerated()), id: \.offset) { _, line in Text(line).font(.system(.caption, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(12).background(Color.tablePanel, in: RoundedRectangle(cornerRadius: 10)) }
            TextField("Command", text: $input).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).onSubmit { Task { await run(input) } }
            HStack {
                Button("Previous") { cursor = max(0, cursor - 1); if cursor < history.count { input = history[cursor] } }.disabled(history.isEmpty)
                Button("Next") { cursor = min(history.count, cursor + 1); input = cursor < history.count ? history[cursor] : "" }.disabled(history.isEmpty)
                Spacer()
                Button("Run") { Task { await run(input) } }.disabled(busy || input.isEmpty || pending != nil)
            }.buttonStyle(.bordered)
            if let command = pending {
                Text("Review the before/after preview above. Apply \(command)?")
                HStack { Button("Confirm", role: .destructive) { Task { await run(command, confirmed: true) } }; Button("Cancel") { pending = nil } }.disabled(busy).buttonStyle(.bordered)
            }
        }
    }
    private var textEditor: some View {
        VStack(alignment: .leading, spacing: 18) {
            Toggle("Edit mode", isOn: $editMode)
            Text("Tap official text to edit it. Changes are published to web and iPhone.").font(.footnote)
            ForEach(officialTextDefaults.keys.sorted(), id: \.self) { key in
                VStack(alignment: .leading, spacing: 8) {
                    Text(key).font(.caption).foregroundStyle(.secondary)
                    Button { selected = AdminTextSelection(id: key) } label: { Text(store.uiText(key)).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading).padding(8) }.disabled(!editMode).overlay(RoundedRectangle(cornerRadius: 6).stroke(editMode ? Color.tableHighlight : .clear, style: StrokeStyle(dash: [4])))
                }
            }
        }
    }
    private var auditView: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("Action filter", text: $action); TextField("Target filter", text: $target)
            TextField("From (ISO date)", text: $from); TextField("To (ISO date)", text: $to)
            Button("Filter") { Task { await loadAudit(0) } }.disabled(busy)
            ForEach(Array(audit.enumerated()), id: \.offset) { _, row in
                DisclosureGroup(row["action"].text + " · " + row["result"].text + " · " + hubDate(row["at"].number)) { Text(row.consoleText).font(.caption.monospaced()).textSelection(.enabled) }
            }
            HStack { Button("Newer") { Task { await loadAudit(max(0, offset - 100)) } }.disabled(offset == 0 || busy); Button("Older") { Task { await loadAudit(offset + 100) } }.disabled(audit.count < 100 || busy) }
        }.textFieldStyle(.roundedBorder)
    }
    private func run(_ command: String, confirmed: Bool = false) async {
        guard !busy else { return }; busy = true; error = ""; defer { busy = false }
        do {
            var body: [String: FieldValue] = ["command": .string(command)]
            if confirmed { body["confirmation"] = .string(confirmationToken) }
            let reply: HubJSON = try await store.request("api/admin", body: body)
            output = Array((output + ["> " + command + "\n" + reply["output"].consoleText]).suffix(100))
            pending = reply["confirmationRequired"].flag ? command : nil
            confirmationToken = reply["confirmation"].text
            if !confirmed { history.append(command); cursor = history.count }
            if pending == nil { input = "" }
            await store.refreshOfficialText()
        } catch { self.error = error.localizedDescription; pending = nil }
    }
    private func loadAudit(_ page: Int) async {
        busy = true; error = ""; defer { busy = false }
        var query = URLComponents(); query.queryItems = [URLQueryItem(name: "action", value: action), URLQueryItem(name: "target", value: target), URLQueryItem(name: "from", value: from), URLQueryItem(name: "to", value: to), URLQueryItem(name: "offset", value: String(page))]
        do { let reply: HubJSON = try await store.request("api/admin?" + (query.percentEncodedQuery ?? "")); audit = reply["audit"].items; offset = page }
        catch { self.error = error.localizedDescription }
    }
}
private struct AdminTextSelection: Identifiable { let id: String }
struct NativeTextEditor: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.dismiss) private var dismiss
    let textKey: String
    @State private var value = ""
    @State private var version: Double = 0
    @State private var history: [HubJSON] = []
    @State private var error = ""
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section { Text(textKey).font(.caption.monospaced()); Text("Keep named placeholders such as {count}. Plain text only."); TextEditor(text: $value).frame(minHeight: 140) }
                if !error.isEmpty { Text(error).foregroundStyle(.red) }
                Section {
                    Button("Save and publish") { Task { await save() } }.disabled(busy)
                    Button("Reset to default") { Task { await save(reset: true) } }.disabled(busy)
                }
                Section("Version history") {
                    ForEach(Array(history.enumerated()), id: \.offset) { _, row in
                        DisclosureGroup("Version " + row["id"].text + " · " + hubDate(row["at"].number)) {
                            Text(row["value"].text)
                            Button("Preview") { value = row["value"].text }
                            Button("Revert and publish") { Task { await revert(row["id"].text) } }.disabled(busy)
                        }
                    }
                }
            }.navigationTitle("Edit official text").toolbar { Button("Cancel") { dismiss() } }
                .task {
                    value = store.uiText(textKey); version = store.textOverrides[textKey]?["version"].number ?? 0
                    do { let key = textKey.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? textKey; let reply: HubJSON = try await store.request("api/admin?view=history&key=" + key); history = reply["history"].items }
                    catch { self.error = error.localizedDescription }
                }
        }
    }
    private func save(reset: Bool = false) async {
        busy = true; defer { busy = false }
        do { let _: HubJSON = try await store.request("api/admin", body: ["action": .string("text"), "key": .string(textKey), "value": .string(value), "version": .number(version), "reset": .bool(reset)]); await store.refreshOfficialText(); dismiss() }
        catch { self.error = error.localizedDescription }
    }
    private func revert(_ id: String) async {
        busy = true; defer { busy = false }
        do { let _: HubJSON = try await store.request("api/admin", body: ["command": .string("text revert " + textKey + " " + id)]); await store.refreshOfficialText(); dismiss() }
        catch { self.error = error.localizedDescription }
    }
}
