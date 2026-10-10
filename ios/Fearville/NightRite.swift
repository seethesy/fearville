import SwiftUI

private let riteGold = Color(red: 0.82, green: 0.67, blue: 0.30)
private let riteCream = Color(red: 0.94, green: 0.88, blue: 0.70)
private let ritePatterns = [("board", "Escape Fearville"), ("grid", "The Sphinx's Riddles"), ("ritual", "Ritual of Divination"), ("lab", "Alchemist's Laboratory")]
private let riteCharacters = ["Watchman", "Doctor", "Librarian", "Detective", "Mortician"]
private let riteLocations = ["Library", "Garden", "House", "Market", "Graveyard"]
private let riteActivities = ["Reading", "Eating", "Biking", "Shopping", "Sleeping"]
private let riteSymbols = ["☠", "☠ ⚔", "☾", "☽", "🕊", "🐦", "⋈", "⌛"]
private let riteLiquids: [Color] = [.green, .red, .blue, .purple, .yellow, .teal, .pink, Color(red:0.16, green:0.13, blue:0.25)]
private let riteSubstances = ["◉", "○", "✦", "∿", "ϟ", "⋊", "◎", "ᛟ"]
private let riteLiquidNames = ["Green with eyes", "Red with bubbles", "Blue with stars", "Purple with smoke", "Yellow with lightning", "Teal with fish", "Pink with spirals", "Black ink with runes"]

extension HubJSON {
    var riteValue: FieldValue {
        switch self {
        case .string(let x): return .string(x)
        case .number(let x): return .number(x)
        case .bool(let x): return .bool(x)
        case .array(let x): return .array(x.map(\.riteValue))
        case .object(let x): return .object(x.mapValues(\.riteValue))
        case .null: return .string("")
        }
    }
}
extension TableStore {
    func refreshRite() async {
        do {
            let reply: HubJSON = try await request("api/rite")
            applyRite(reply)
        } catch { self.error = error.localizedDescription }
    }
    private func applyRite(_ reply: HubJSON) {
        guard let game, reply["code"].text == game.code, reply["me"].text == game.me else { return }
        let version = Int(reply["version"].number), now = reply["serverNow"].number
        guard version > riteVersion || (version == riteVersion && now >= riteServerNow) else { return }
        riteState = reply["rite"]; riteVersion = version; riteServerNow = now
        offset = now / 1000 - Date().timeIntervalSince1970
    }
    func riteAction(_ action: String, _ fields: [String: FieldValue] = [:]) async throws -> String {
        var body = fields
        body["action"] = .string(action); body["version"] = .number(Double(riteVersion))
        body["epoch"] = .string(riteState?["epoch"].text ?? "")
        body["night"] = .number(Double(game?.night ?? 0))
        let reply: HubJSON = try await request("api/rite", body: body)
        applyRite(reply)
        return reply["summary"].text
    }
}

struct NativeRiteView: View {
    @EnvironmentObject var store: TableStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let game: GameState
    @State private var busy = false
    @State private var message = ""
    @State private var flash = false
    @State private var previousPhase = ""
    @State private var lastAction = Date.distantPast
    private var rite: HubJSON { store.riteState ?? .null }
    private var puzzle: HubJSON { rite["puzzle"] }
    var body: some View {
        Group {
            if game.host { NativeRiteSetup(game: game) }
            else if !rite.isNull && rite["enabled"].flag {
                VStack(spacing: 16) {
                    Text(rite["status"].text == "complete" ? "The Rite is complete." : rite["squad"]["title"].text).font(.system(.title2, design: .serif)).tracking(2).multilineTextAlignment(.center)
                    Text("Night \(game.night) · Your vigil").font(.caption).tracking(2)
                    HStack { ForEach(rite["squad"]["members"].items) { member in Text(member["id"].text == game.me ? "You" : member["name"].text).font(.caption).padding(7).overlay(Capsule().stroke(riteGold)) } }
                    if puzzle.isNull { Text(rite["redealing"].flag ? "Your puzzle is preparing. Plan with your vigil." : "Your puzzle opens on night \(Int(rite["opensNight"].number)). Meet your vigil and plan together.") }
                    else {
                        TimelineView(.periodic(from: .now, by: 0.1)) { context in
                            let now = (context.date.timeIntervalSince1970 + store.offset) * 1000
                            if puzzle["phase"].text == "lock" { Text("View only · Opens in \(max(0, Int(ceil((rite["lockUntil"].number-now)/1000)))) seconds. Make your night choices first.").font(.caption) }
                            if !puzzle["deadline"].isNull && puzzle["phase"].text == "turn" {
                                if puzzle["type"].text == "lab" {
                                    ZStack {Circle().stroke(Color.gray.opacity(0.3),lineWidth:5);Circle().trim(from:0,to:min(1,max(0,(puzzle["deadline"].number-now)/8000))).stroke(riteGold,lineWidth:5).rotationEffect(.degrees(-90));Text("\(min(8,max(0,Int(ceil((puzzle["deadline"].number-now)/1000)))))").font(.title.monospacedDigit())}.frame(width:64,height:64)
                                }else {VStack {Text("\(min(5,max(0,Int(ceil((puzzle["deadline"].number-now)/1000)))))").font(.largeTitle.monospacedDigit());ProgressView(value:min(5000,max(0,puzzle["deadline"].number-now)),total:5000).tint(riteGold)}}
                            }
                        }
                        if puzzle["phase"].text == "wait" { Text("Waiting for your turn. Keep this screen open.").font(.caption) }
                        if puzzle["phase"].text == "locked" { Text("Sealed for tonight. Wait for dawn.").font(.caption) }
                        if puzzle["phase"].text == "day" { Text("Plan together by day. Act at night.").font(.caption) }
                        if puzzle["phase"].text == "done" { Text("Your vigil’s puzzle is complete.").foregroundStyle(riteGold) }
                        switch puzzle["type"].text {
                        case "board": NativeEscape(puzzle: puzzle, busy: busy, send: send)
                        case "lab": NativeLaboratory(puzzle: puzzle, busy: busy, send: send)
                        case "grid": NativeRiddles(puzzle: puzzle, busy: busy, send: send).id(rite["epoch"].text)
                        case "ritual": NativeDivination(puzzle: puzzle, game: game, busy: busy, send: send).id(rite["epoch"].text)
                        default: EmptyView()
                        }
                    }
                    if !message.isEmpty { Text(message).font(.caption).accessibilityAddTraits(.updatesFrequently) }
                }.padding(16).foregroundStyle(riteCream).background(Color(red:0.06, green:0.13, blue:0.13)).clipShape(RoundedRectangle(cornerRadius:20)).overlay(RoundedRectangle(cornerRadius:20).stroke(riteGold))
                    .overlay { if flash { Color.red.opacity(0.22).allowsHitTesting(false) } }
                    .offset(x: flash && !(reduceMotion || store.preferences.reducedMotion) ? 2 : 0)
            }
        }
        .onChange(of: puzzle["phase"].text) { old, next in
            if old == "turn" && next == "locked" && Date().timeIntervalSince(lastAction) > 1 { failed("That action could not be completed.") }
            previousPhase = next
        }
        .onChange(of: puzzle["ruined"].text) { old, next in if !next.isEmpty && old != next { failed("The brew is ruined. The laboratory resets to the start of tonight.") } }
    }
    private func failed(_ text: String) {
        message = text; flash = true; NativeAudio.shared.cue(error: true)
        Task { try? await Task.sleep(for: .milliseconds(400)); flash = false }
    }
    private func send(_ action: String, _ fields: [String: FieldValue]) {
        guard !busy else { return }; busy = true
        Task {
            defer { busy = false }
            do { lastAction = Date(); let text = try await store.riteAction(action, fields); message = text; if text.contains("falters") || text.contains("ruined") { failed(text) } }
            catch { failed(error.localizedDescription) }
        }
    }
}
private typealias RiteSend = (String, [String: FieldValue]) -> Void

private struct NativeEscape: View {
    let puzzle: HubJSON; let busy: Bool; let send: RiteSend
    @State private var selected = ""
    var body: some View {
        VStack(spacing: 14) {
            GeometryReader { geometry in
                let cell = geometry.size.width / 6
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius:6).fill(Color(red:0.27, green:0.25, blue:0.18))
                    Path { p in for i in 0...6 { p.move(to:CGPoint(x:CGFloat(i)*cell,y:0));p.addLine(to:CGPoint(x:CGFloat(i)*cell,y:cell*6));p.move(to:CGPoint(x:0,y:CGFloat(i)*cell));p.addLine(to:CGPoint(x:cell*6,y:CGFloat(i)*cell)) } }.stroke(Color.black.opacity(0.3),lineWidth:2)
                    ForEach(puzzle["blocks"].items) { b in
                        let horizontal=b["horiz"].flag, width=cell*(horizontal ? b["len"].number : 1), height=cell*(horizontal ? 1 : b["len"].number)
                        ZStack {
                            RoundedRectangle(cornerRadius:7).fill(b["key"].flag ? Color(red:0.59,green:0.15,blue:0.2) : Color(red:0.43,green:0.31,blue:0.2))
                            RoundedRectangle(cornerRadius:7).stroke(b["key"].flag ? riteGold : Color(red:0.65,green:0.56,blue:0.4),style:StrokeStyle(lineWidth:selected==b.id ? 3:2,dash:b["key"].flag ? [6,3] : b["kind"].text=="wood" ? [2,3] : []))
                            Text(["carriage":"♞", "coach":"♞", "wood":"╱╱", "crates":"▧", "car":"🚗", "tree":"🪵", "brick":"▤"][b["kind"].text] ?? "▧").font(.title2)
                        }.frame(width:width-4,height:height-4).offset(x:b["x"].number*cell+2,y:b["y"].number*cell+2)
                            .onTapGesture { selected=b.id }
                            .gesture(DragGesture().onEnded { value in let dx=Int((value.translation.width/cell).rounded()),dy=Int((value.translation.height/cell).rounded()); if dx != 0 || dy != 0 { move(b,dx,dy) } })
                            .accessibilityElement(children:.ignore).accessibilityLabel("\(b["key"].flag ? "Red carriage" : b["kind"].text), column \(Int(b["x"].number)+1), row \(Int(b["y"].number)+1)").accessibilityAddTraits(.isButton)
                    }
                    Text("❯❯").foregroundStyle(riteGold).offset(x:cell*6-8,y:cell*2+8)
                }.overlay(Rectangle().stroke(Color.brown,lineWidth:8)).padding(4)
            }.aspectRatio(1,contentMode:.fit)
            Text("Get the red carriage through the gate. Slide one piece along its length.").font(.caption)
            if let b=puzzle["blocks"].items.first(where:{$0.id==selected}) { HStack { Button("←"){move(b,-1,0)};Button("→"){move(b,1,0)};Button("↑"){move(b,0,-1)};Button("↓"){move(b,0,1)} }.buttonStyle(.bordered).disabled(busy || puzzle["phase"].text != "turn") }
            if puzzle["phase"].text=="turn" { Button("Pass"){send("ritePass",["turn":.string(puzzle["turn"].text)])}.disabled(busy) }
        }
    }
    private func move(_ b:HubJSON,_ dx:Int,_ dy:Int){guard !busy && puzzle["phase"].text == "turn" else {return};send("riteBoardMove",["block":.string(b.id),"x":.number(b["x"].number+Double(dx)),"y":.number(b["y"].number+Double(dy)),"turn":.string(puzzle["turn"].text)])}
}
private struct VialShape: Shape {
    let kind:Int
    func path(in rect:CGRect)->Path {
        let w=rect.width,h=rect.height
        var p=Path()
        switch kind {
        case 1: p.move(to:CGPoint(x:w*0.4,y:0));p.addLines([CGPoint(x:w*0.6,y:0),CGPoint(x:w*0.6,y:h*0.3),CGPoint(x:w*0.95,y:h),CGPoint(x:w*0.05,y:h),CGPoint(x:w*0.4,y:h*0.3)])
        case 2: p.move(to:CGPoint(x:w*0.4,y:0));p.addLine(to:CGPoint(x:w*0.6,y:0));p.addLine(to:CGPoint(x:w*0.6,y:h*0.35));p.addCurve(to:CGPoint(x:w*0.4,y:h*0.35),control1:CGPoint(x:w*1.5,y:h),control2:CGPoint(x:-w*0.5,y:h));p.addLine(to:CGPoint(x:w*0.4,y:0))
        case 3: p.addRoundedRect(in:CGRect(x:w*0.35,y:0,width:w*0.3,height:h),cornerSize:CGSize(width:w*0.15,height:w*0.15))
        case 4: p.addRect(CGRect(x:w*0.2,y:0,width:w*0.6,height:h))
        case 5: p.move(to:CGPoint(x:w*0.4,y:0));p.addLines([CGPoint(x:w*0.6,y:0),CGPoint(x:w*0.6,y:h*0.35),CGPoint(x:w*0.95,y:h*0.5),CGPoint(x:w*0.95,y:h),CGPoint(x:w*0.05,y:h),CGPoint(x:w*0.05,y:h*0.5),CGPoint(x:w*0.4,y:h*0.35)])
        case 6: p.addRoundedRect(in:CGRect(x:0,y:h*0.3,width:w,height:h*0.7),cornerSize:CGSize(width:w*0.4,height:w*0.4))
        default: p.addRoundedRect(in:rect,cornerSize:CGSize(width:4,height:4))
        };p.closeSubpath();return p
    }
}
private struct NativeLaboratory: View {
    @EnvironmentObject var store:TableStore
    let puzzle:HubJSON;let busy:Bool;let send:RiteSend
    @State private var from="";@State private var sheet=false
    var body:some View {
        VStack(spacing:16) {
            LazyVGrid(columns:Array(repeating:GridItem(.flexible(),spacing:9),count:5),spacing:24) {
                ForEach(puzzle["vials"].items) { vial in
                    Button { if !from.isEmpty && from != vial.id {send("riteLabPour",["from":.string(from),"to":.string(vial.id),"turn":.string(puzzle["turn"].text)]);from=""}else{from=from==vial.id ? "":vial.id} } label: {
                        GeometryReader { geometry in
                            let shape=VialShape(kind:Int(vial["shape"].number))
                            ZStack(alignment:.bottom) {
                                VStack(spacing:0) { ForEach(Array(vial["layers"].items.reversed().enumerated()),id:\.offset) { _,c in Rectangle().fill(riteLiquids[Int(c.number)]).overlay(Text(riteSubstances[Int(c.number)]).font(.caption).foregroundStyle(riteCream)).frame(height:geometry.size.height/4) } }.frame(maxHeight:.infinity,alignment:.bottom).clipShape(shape)
                                shape.stroke(from==vial.id ? riteGold : Color(red:0.73,green:0.83,blue:0.86),lineWidth:from==vial.id ? 3:2)
                            }
                        }.frame(height:98).padding(.horizontal,2)
                    }.buttonStyle(.plain).disabled(busy || puzzle["phase"].text != "turn").accessibilityLabel("Vial \(vial.id), \(vial["layers"].items.map{riteLiquidNames[Int($0.number)]}.joined(separator:", "))")
                }
            }.padding(.vertical,10).background(Color.brown.opacity(0.10))
            Text("Tap a vial, then where to pour it. Match color and substance.").font(.caption)
            if puzzle["phase"].text=="turn" {HStack {Button("Undo / Reset"){sheet=true};Button("Pass"){send("ritePass",["turn":.string(puzzle["turn"].text)])}}.buttonStyle(.bordered).disabled(busy)}
            if !puzzle["vote"].isNull {
                VStack {Text("A vote has been called").font(.headline);Text(puzzle["vote"]["kind"].text=="undo" ? "Undo tonight’s last pour?" : "Reset the original puzzle?")
                    TimelineView(.periodic(from:.now,by:0.1)){c in Text("\(max(0,Int(ceil(puzzle["vote"]["deadline"].number/1000-c.date.timeIntervalSince1970-store.offset))))").font(.largeTitle)}
                    if puzzle["vote"]["canVote"].flag && !puzzle["vote"]["answered"].flag {HStack {Button("Yes"){ballot(true)};Button("No"){ballot(false)}}.buttonStyle(.bordered).disabled(busy)}
                    Text("Everyone must agree. No answer counts as no. Votes are anonymous.").font(.caption)
                }.padding().overlay(RoundedRectangle(cornerRadius:14).stroke(riteGold))
            }
            if !puzzle["voteResult"].isNull {Text(puzzle["voteResult"]["passed"].flag ? "The vote passed." : "The vote failed.").font(.caption)}
        }.confirmationDialog("Call a vote · This uses your turn",isPresented:$sheet) {Button("Undo the last pour tonight"){call("undo")}.disabled(!puzzle["canUndo"].flag);Button("Reset the original puzzle"){call("reset")};Button("Never mind",role:.cancel){}}
            .onChange(of:puzzle["turn"].text){_,_ in from="";sheet=false}
    }
    private func call(_ kind:String){send("riteLabCall",["kind":.string(kind),"turn":.string(puzzle["turn"].text)])}
    private func ballot(_ yes:Bool){send("riteLabBallot",["yes":.bool(yes),"vote":.string(puzzle["vote"]["id"].text)])}
}
private struct NativeRiddles: View {
    let puzzle:HubJSON;let busy:Bool;let send:RiteSend
    @State private var characters=[Int](repeating:-1,count:5)
    @State private var activities=[Int](repeating:-1,count:5)
    @State private var kind="character";@State private var token = -1
    private let colors:[Color]=[.purple,.red,.blue,.yellow,.gray]
    private let characterIcons=["eye","cross.case","books.vertical","magnifyingglass","person.crop.circle.badge.xmark"]
    private let activityIcons=["book","apple.logo","bicycle","basket","bed.double"]
    private var editable:Bool { ["day","turn"].contains(puzzle["phase"].text) }
    private var complete:Bool {Set(characters).count==5 && !characters.contains(-1) && Set(activities).count==5 && !activities.contains(-1)}
    var body:some View {
        VStack(spacing:18) {
            VStack(spacing:14) {
                HStack {place(0);place(1)}
                place(2).frame(maxWidth:180)
                HStack {place(3);place(4)}
            }.padding(12).background(Color(red:0.1,green:0.22,blue:0.16)).clipShape(RoundedRectangle(cornerRadius:16)).overlay(RoundedRectangle(cornerRadius:16).stroke(riteGold,lineWidth:2))
            Text("Choose a token, then a place. Tap a filled spot to clear it.").font(.caption)
            HStack {ForEach(0..<5,id:\.self){i in Button {kind="character";token=i} label:{VStack {Image(systemName:characterIcons[i]).font(.title2).frame(width:40,height:40).foregroundStyle(colors[i]).background(colors[i].opacity(0.2),in:Circle());Text(riteCharacters[i]).font(.system(size:9))}.opacity(characters.contains(i) ? 0.45:1)}.buttonStyle(.plain).disabled(!editable)}}
            HStack {ForEach(0..<5,id:\.self){i in Button {kind="activity";token=i} label:{VStack {Image(systemName:activityIcons[i]).font(.title2);Text(riteActivities[i]).font(.system(size:9))}.frame(maxWidth:.infinity).opacity(activities.contains(i) ? 0.45:1)}.buttonStyle(.plain).disabled(!editable)}}
            HStack {Button("Save working board"){send("riteNotes",["placements":board])}.disabled(!editable || busy);Button("Submit for tonight"){send("riteGridSubmit",["solution":board])}.disabled(!complete || busy || puzzle["phase"].text != "turn")}.buttonStyle(.bordered)
            VStack(alignment:.leading,spacing:14) {
                Text("YOUR CLUES").font(.system(.headline,design:.serif)).tracking(2)
                ForEach(puzzle["clues"].items.filter{!$0["forged"].flag}) {clue in HStack {Image(systemName:clue["hidden"].flag ? "lock":"sparkle");Text(clue["hidden"].flag ? "Revealed night \(Int(clue["revealNight"].number))" : clue["text"].text)}.font(.callout);Divider()}
                let forged=puzzle["clues"].items.filter{$0["forged"].flag}
                if !forged.isEmpty {VStack(alignment:.leading){Text("EXTRA CLUES · EVIL ONLY").font(.caption);ForEach(forged){clue in Text("FORGED · "+clue["text"].text)}}.padding(12).foregroundStyle(.pink).overlay(RoundedRectangle(cornerRadius:12).stroke(Color.red,style:StrokeStyle(dash:[5,3])))}
            }.padding(14).background(Color.black.opacity(0.15),in:RoundedRectangle(cornerRadius:14))
        }.onAppear {for p in puzzle["placements"].items {let i=Int(p["location"].number);if (0..<5).contains(i){characters[i]=Int(p["character"].number);activities[i]=Int(p["activity"].number)}}}
    }
    private var board:FieldValue {.array((0..<5).map{i in .object(["location":.number(Double(i)),"character":.number(Double(characters[i])),"activity":.number(Double(activities[i]))])})}
    private func choose(_ i:Int,_ spot:String){
        if token>=0 {if kind=="character" {for j in 0..<5 where characters[j]==token {characters[j] = -1};characters[i]=token}else{for j in 0..<5 where activities[j]==token {activities[j] = -1};activities[i]=token};token = -1}
        else if spot=="character" {characters[i] = -1}else{activities[i] = -1}
    }
    private func place(_ i:Int)->some View {
        VStack(spacing:4) {
            NativeTownBuilding(place:i).frame(height:73)
            Text(riteLocations[i].uppercased()).font(.system(.caption,design:.serif)).tracking(1).padding(5).frame(maxWidth:.infinity).overlay(Capsule().stroke(riteGold))
            HStack(spacing:-8) {
                Button{choose(i,"character")}label:{ZStack {Circle().stroke(riteGold,style:StrokeStyle(lineWidth:2,dash:characters[i]<0 ? [4,3]:[]));if characters[i]>=0 {Image(systemName:characterIcons[characters[i]]).font(.title2).foregroundStyle(colors[characters[i]])}}.frame(width:43,height:43)}
                Button{choose(i,"activity")}label:{ZStack {Circle().stroke(riteGold.opacity(0.7),style:StrokeStyle(dash:[4,3]));if activities[i]>=0 {Image(systemName:activityIcons[activities[i]]).font(.title3)}}.frame(width:30,height:30).offset(y:12)}
            }.buttonStyle(.plain).disabled(!editable)
        }.frame(maxWidth:.infinity)
    }
}
private struct NativeTownBuilding:View {
    let place:Int
    var body:some View {
        Canvas {ctx,size in
            let sx=size.width/140,sy=size.height/90
            func rect(_ x:Double,_ y:Double,_ w:Double,_ h:Double,_ color:Color){ctx.fill(Path(CGRect(x:x*sx,y:y*sy,width:w*sx,height:h*sy)),with:.color(color))}
            func circle(_ x:Double,_ y:Double,_ w:Double,_ h:Double,_ color:Color){ctx.fill(Path(ellipseIn:CGRect(x:x*sx,y:y*sy,width:w*sx,height:h*sy)),with:.color(color))}
            func roof(_ points:[CGPoint],_ color:Color){var p=Path();p.addLines(points.map{CGPoint(x:$0.x*sx,y:$0.y*sy)});p.closeSubpath();ctx.fill(p,with:.color(color))}
            circle(8,75,124,10,Color.brown.opacity(0.5))
            if place==1 {
                for x in stride(from:15,to:130,by:22){circle(Double(x),44,26,30,.green.opacity(0.5))}
                circle(42,61,57,18,.cyan.opacity(0.6));rect(67,32,7,37,.gray);circle(52,27,38,9,.cyan.opacity(0.8))
            }else{
                rect(27,38,86,39,place==4 ? .gray:.brown)
                roof([CGPoint(x:15,y:38),CGPoint(x:70,y:6),CGPoint(x:125,y:38)],place==2 ? Color(red:0.55,green:0.22,blue:0.18):.gray)
                if place==0 {for x in stride(from:35,to:112,by:20){rect(Double(x),38,9,38,riteCream)}}
                else if place==3 {for x in stride(from:20,to:122,by:20){rect(Double(x),23,10,21,.red)};for x in stride(from:37,to:112,by:16){circle(Double(x),50,10,10,x%3==0 ? .orange:.green)}}
                else {rect(41,48,13,16,.yellow.opacity(0.8));rect(87,48,13,16,.yellow.opacity(0.8));rect(62,52,17,26,Color.black.opacity(0.6))}
                if place==4 {for x in stride(from:8,to:134,by:16){rect(Double(x),62,4,22,.gray)};rect(68,0,4,13,.gray);rect(63,4,14,4,.gray)}
            }
        }
    }
}
private let nativeControlCounts = ["candles":8,"offerings":6,"chalice":3,"dial":8,"incense":3]
private let nativeOfferings = [["Bone","Feather","Herb"],["Bone","Herb","Feather"],["Feather","Bone","Herb"],["Feather","Herb","Bone"],["Herb","Bone","Feather"],["Herb","Feather","Bone"]]
private func nativeControlLabel(_ control:String,_ value:Int)->String {
    if control=="candles" {return ["Red","White","Purple"].enumerated().map{i,c in c+((value & (1<<i)) != 0 ? " lit":" unlit")}.joined(separator:", ")}
    if control=="offerings" {return nativeOfferings[value].joined(separator:" · ")}
    if control=="chalice" {return ["Low","Half","Full"][value]}
    if control=="incense" {return ["Unlit","Smoldering","Blazing"][value]}
    return ["I","II","III","IV","V","VI","VII","VIII"][value]
}
private struct NativeDivination:View {
    let puzzle:HubJSON;let game:GameState;let busy:Bool;let send:RiteSend
    @State private var tab="Altar";@State private var page=0;@State private var values:[String:Int]=[:]
    var body:some View {
        VStack(spacing:16) {
            Picker("Ritual pages",selection:$tab){Text("Altar").tag("Altar");Text("Omens").tag("Omens");Text("Grimoire").tag("Grimoire")}.pickerStyle(.segmented)
            if tab=="Altar" {
                Text("Your omens: \(game.name(puzzle["myOmensHolder"].text)) · Your grimoire: \(game.name(puzzle["myKeeper"].text))").font(.caption)
                ForEach(puzzle["altar"].items,id:\.selfID) {item in
                    let control=item["control"].text,value=values[control] ?? Int(item["value"].number)
                    VStack {Text(control=="dial" ? "MOON DIAL" : control.uppercased()).font(.system(.headline,design:.serif)).foregroundStyle(riteGold)
                        NativeRitualControl(control:control,value:Binding(get:{values[control] ?? value},set:{values[control]=$0}))
                    }.padding(12).background(Color(red:0.12,green:0.08,blue:0.2),in:RoundedRectangle(cornerRadius:12)).overlay(RoundedRectangle(cornerRadius:12).stroke(Color.purple.opacity(0.5))).disabled(busy || puzzle["phase"].text != "turn")
                }
                Button(puzzle["performed"].flag ? "The ritual is performed" : puzzle["usedTonight"].flag ? "Sealed until the next night" : "Perform the ritual"){
                    let altar=puzzle["altar"].items.map{item in FieldValue.object(["control":.string(item["control"].text),"value":.number(Double(values[item["control"].text] ?? Int(item["value"].number)))])}
                    send("riteRitualPerform",["altar":.array(altar)])
                }.buttonStyle(.borderedProminent).disabled(busy || puzzle["phase"].text != "turn" || puzzle["performed"].flag)
                Text("One attempt per night from night \(Int(puzzle["firstAttemptNight"].number)).").font(.caption)
                if !puzzle["result"].isNull && !puzzle["result"].flag {Text("The ritual falters. Nothing more is revealed.").foregroundStyle(.pink)}
            }else if tab=="Omens" {
                Text("For \(game.name(puzzle["omensFor"].text))’s ritual").font(.headline)
                ForEach(Array(puzzle["omens"].items.enumerated()),id:\.offset){i,set in HStack {Text(["I","II","III"][i]);ForEach(Array(set.items.enumerated()),id:\.offset){_,sym in symbol(Int(sym.number))}}.padding(15).background(Color.purple.opacity(0.15),in:RoundedRectangle(cornerRadius:14))}
                Text("Read the symbols aloud. Sets are unlabeled; order inside a set does not matter.").font(.caption)
            }else{
                Text("You keep this book for \(game.name(puzzle["keeperFor"].text))").font(.headline)
                Picker("Grimoire page",selection:$page){ForEach(Array(puzzle["book"].items.enumerated()),id:\.offset){i,p in Text(p["control"].text).tag(i)}}.pickerStyle(.menu)
                if page<puzzle["book"].items.count {let p=puzzle["book"].items[page];ForEach(Array(p["entries"].items.enumerated()),id:\.offset){_,entry in HStack {ForEach(Array(entry["symbols"].items.enumerated()),id:\.offset){_,s in symbol(Int(s.number))};Text("→").foregroundStyle(riteGold);VStack {NativeAltarIllustration(control:p["control"].text,value:Int(entry["value"].number)).frame(height:40);Text(nativeControlLabel(p["control"].text,Int(entry["value"].number))).font(.system(size:9))}}.padding(8).background(Color.purple.opacity(0.1),in:RoundedRectangle(cornerRadius:8))}}
            }
        }.padding(10).background(Color(red:0.06,green:0.03,blue:0.12),in:RoundedRectangle(cornerRadius:14)).overlay(RoundedRectangle(cornerRadius:14).stroke(riteGold.opacity(puzzle["performed"].flag ? 0.8 : 0),lineWidth:2)).shadow(color:riteGold.opacity(puzzle["performed"].flag ? 0.3 : 0),radius:14)
    }
    private func symbol(_ i:Int)->some View {Text(riteSymbols[i]).font(.title2).frame(width:38,height:38).background(Color.purple.opacity(0.2),in:Circle()).overlay(Circle().stroke(Color.purple.opacity(0.5))).accessibilityLabel(["Skull","Skull and crossbones","Waning crescent","Waxing crescent","Flying crow","Perched crow","Triangular hourglass","Curvy hourglass"][i])}
}
private extension HubJSON {var selfID:String {self["control"].text}}
private struct NativeRitualControl:View {
    let control:String
    @Binding var value:Int
    var body:some View {
        VStack(spacing:10) {
            if control=="chalice" {
                Button {value=(value+1)%3} label:{VStack {NativeAltarIllustration(control:control,value:value).frame(height:85);Text(nativeControlLabel(control,value)+" · Tap to change")}}.buttonStyle(.plain)
            }else{
                NativeAltarIllustration(control:control,value:value).frame(height:85)
                if control=="candles" {HStack {ForEach(0..<3,id:\.self){i in Button(["Red","White","Purple"][i]+((value & (1<<i)) != 0 ? " lit":" unlit")){value ^= (1<<i)}.buttonStyle(.bordered).accessibilityAddTraits((value & (1<<i)) != 0 ? .isSelected:[])}}}
                else if control=="offerings" {HStack {ForEach(0..<3,id:\.self){slot in Picker("Slot \(slot+1)",selection:Binding(get:{nativeOfferings[value][slot]},set:{offering in var next=nativeOfferings[value];if let other=next.firstIndex(of:offering){next.swapAt(slot,other)};value=nativeOfferings.firstIndex(of:next) ?? value})){ForEach(["Bone","Feather","Herb"],id:\.self){Text($0).tag($0)}}.pickerStyle(.menu)}}}
                else {LazyVGrid(columns:Array(repeating:GridItem(.flexible()),count:control=="dial" ? 4:3)){ForEach(0..<(nativeControlCounts[control] ?? 1),id:\.self){v in Button(nativeControlLabel(control,v)){value=v}.font(.caption).buttonStyle(.bordered).tint(v==value ? riteGold:.purple).accessibilityAddTraits(v==value ? .isSelected:[])}}}
            }
        }
    }
}
private struct NativeAltarIllustration:View {
    let control:String;let value:Int
    var body:some View {
        HStack {
            if control=="candles" {ForEach(0..<3,id:\.self){i in VStack(spacing:0){Image(systemName:"flame.fill").foregroundStyle((value & (1<<i)) != 0 ? Color.orange:Color.clear);RoundedRectangle(cornerRadius:3).fill([Color.red,Color.white,Color.purple][i]).frame(width:18,height:40)}}}
            else if control=="offerings" {ForEach(Array(nativeOfferings[value].enumerated()),id:\.offset){_,item in Image(systemName:item=="Bone" ? "cross" : item=="Feather" ? "feather":"leaf.fill").font(.title).foregroundStyle(riteCream).frame(width:36,height:36).overlay(Circle().stroke(riteGold,style:StrokeStyle(dash:[4,3])))}}
            else if control=="chalice" {Image(systemName:"wineglass.fill").font(.system(size:46)).foregroundStyle(riteGold).overlay(Text(["LOW","HALF","FULL"][value]).font(.system(size:8)).offset(y:22))}
            else if control=="dial" {ZStack {Circle().stroke(riteGold,lineWidth:2);Rectangle().fill(riteGold).frame(width:3,height:24).offset(y:-12).rotationEffect(.degrees(Double(value)*45));Text(nativeControlLabel(control,value)).font(.caption).offset(y:24)}.frame(width:70,height:70)}
            else {VStack {Image(systemName:value==2 ? "flame.fill":value==1 ? "smoke.fill":"minus").foregroundStyle(value==2 ? .orange:.gray);Image(systemName:"tray.fill").foregroundStyle(riteGold)}}
        }.frame(maxWidth:.infinity)
    }
}
private struct NativeRiteSetup:View {
    @EnvironmentObject var store:TableStore
    let game:GameState
    @State private var enabled=false;@State private var patterns=Set(["board","grid","ritual","lab"])
    @State private var opening=2;@State private var lock=30;@State private var window=60;@State private var threshold=50;@State private var first=3;@State private var forged=1;@State private var notify=true
    @State private var teams:[HubJSON]=[];@State private var moved:[String:String]=[:];@State private var kinds:[String:String]=[:]
    @State private var message="";@State private var busy=false;@State private var loaded=false
    private var rite:HubJSON {store.riteState ?? .null}
    var body:some View {
        VStack(alignment:.leading,spacing:14) {
            if game.phase=="lobby" || (rite["status"].text=="dormant" && game.night<Int(rite["config"]["opensNight"].number)) {
                Toggle("Enable Night Rite",isOn:$enabled)
                ForEach(ritePatterns,id:\.0){kind,name in Toggle(name,isOn:Binding(get:{patterns.contains(kind)},set:{if $0 {patterns.insert(kind)}else{patterns.remove(kind)}}))}
                Stepper("Opening night: \(opening)",value:$opening,in:2...20)
                Stepper("Night lock: \(lock) seconds",value:$lock,in:0...120)
                Stepper("Puzzle window: \(window) seconds",value:$window,in:60...300,step:10)
                Stepper("Vigils needed: \(threshold)%",value:$threshold,in:1...100)
                Stepper("Divination first attempt: night \(first)",value:$first,in:2...20)
                Stepper("Forged clues per Evil player: \(forged)",value:$forged,in:0...4)
                Toggle("Privately notify completed vigils",isOn:$notify)
                ForEach(teams){team in Picker(team.id,selection:Binding(get:{kinds[team.id] ?? team["kind"].text},set:{kinds[team.id]=$0})){ForEach(ritePatterns.filter{patterns.contains($0.0)},id:\.0){k,n in Text(n).tag(k)}}}
                ForEach(game.players){p in if !teams.isEmpty {Picker(p.name,selection:Binding(get:{moved[p.id] ?? teams.first(where:{$0["members"].items.contains(where:{$0.text==p.id})})?.id ?? ""},set:{moved[p.id]=$0})){ForEach(teams){t in Text(t.id).tag(t.id)}}}}
                HStack {Button("Save Rite setup"){save(false)};Button("Assign automatically"){save(true)}}.buttonStyle(.bordered).disabled(busy)
            }
            if rite["preparing"].flag {ProgressView("Preparing the vigils’ puzzles…")}
            ForEach(rite["squads"].items){s in NativeHostVigil(squad:s,game:game,busy:busy,sealed:rite["status"].text=="complete",send:action)}
            if rite["status"].text=="open" && game.phase=="night" {Button("Close Rite window now"){action("riteForce",[:])}.disabled(busy)}
            if !message.isEmpty {Text(message).font(.caption)}
        }.onAppear {if !rite.isNull {load();loaded=true}}.onChange(of:store.riteVersion){_,_ in if !loaded && !rite.isNull {load();loaded=true}}
    }
    private func load(){let c=rite["config"];enabled=c["enabled"].flag;patterns=Set(c["patterns"].items.map(\.text));opening=Int(c["opensNight"].number);lock=Int(c["lockSeconds"].number);window=Int(c["windowSeconds"].number);threshold=Int(c["threshold"].number*100);first=Int(c["ritualFirstNight"].number);forged=Int(c["forgedPerEvil"].number);notify=c["notifyCompletion"].flag;teams=rite["plans"].items;moved=[:];kinds=[:]}
    private func save(_ automatic:Bool){
        var fields:[String:FieldValue]=["config":.object(["enabled":.bool(enabled),"patterns":.array(ritePatterns.filter{patterns.contains($0.0)}.map{.string($0.0)}),"opensNight":.number(Double(opening)),"lockSeconds":.number(Double(lock)),"windowSeconds":.number(Double(window)),"threshold":.number(Double(threshold)/100),"ritualFirstNight":.number(Double(first)),"forgedPerEvil":.number(Double(forged)),"notifyCompletion":.bool(notify)])]
        if automatic {fields["redeal"] = .bool(true)}
        else if !teams.isEmpty {fields["plans"] = .array(teams.map{t in .object(["id":.string(t.id),"kind":.string(kinds[t.id] ?? t["kind"].text),"members":.array(game.players.filter{p in (moved[p.id] ?? teams.first(where:{$0["members"].items.contains(where:{$0.text==p.id})})?.id)==t.id}.map{.string($0.id)})])})}
        action("configureRite",fields)
    }
    private func action(_ name:String,_ fields:[String:FieldValue]){busy=true;Task {defer{busy=false};do{message=try await store.riteAction(name,fields);load()}catch{message=error.localizedDescription}}}
}
private struct NativeHostVigil:View {
    let squad:HubJSON;let game:GameState;let busy:Bool;let sealed:Bool;let send:RiteSend
    private var state:HubJSON {squad["state"]}
    private var display:HubJSON {var fields=state.fields;fields["phase"] = .string("day");return .object(fields)}
    var body:some View {
        DisclosureGroup(ritePatterns.first(where:{$0.0==squad["kind"].text})?.1 ?? squad.id) {
            VStack(alignment:.leading,spacing:12) {
                Text(squad["members"].items.map{game.name($0.text)}.joined(separator:", "))
                Text(squad["completeNight"].isNull ? "In progress":"Complete")
                if state["type"].text=="board" || state["type"].text=="lab" {
                    Text("Par: "+state["par"].text+" · Distance: "+(state["distance"].isNull ? "Uncertified":state["distance"].text))
                    let turn=state["turn"],cursor=Int(state["turn"]["cursor"].number)
                    Text("Current turn: "+(cursor<turn["order"].items.count ? game.name(turn["order"].items[cursor].text):"Finished"))
                    if state["type"].text=="board" {NativeEscape(puzzle:display,busy:true,send:{_,_ in})}
                    else {NativeLaboratory(puzzle:display,busy:true,send:{_,_ in})}
                    ForEach(Array(turn["log"].items.enumerated()),id:\.offset){_,l in Text(game.name(l["player"].text)+": "+l["kind"].text+" "+l["detail"].text).font(.caption)}
                }else if state["type"].text=="grid" {
                    Text("Solution").font(.headline)
                    ForEach(Array(state["solution"].items.enumerated()),id:\.offset){_,t in Text(riteCharacters[Int(t["character"].number)]+" / "+riteLocations[Int(t["location"].number)]+" / "+riteActivities[Int(t["activity"].number)]).font(.caption)}
                    ForEach(state["clues"].items){c in Text(game.name(c["holder"].text)+": "+c["text"].text+(c["forged"].flag ? " [FORGED]":"")+" · Night "+c["revealNight"].text).font(.caption)}
                }else {
                    ForEach(squad["members"].items,id:\.text){member in
                        let r=state["rituals"][member.text]
                        VStack(alignment:.leading) {Text(game.name(member.text)+": "+(r["doneNight"].isNull ? "Pending":"Performed")).font(.headline)
                            Text("Omens: "+game.name(r["omensHolder"].text)+" · Grimoire: "+game.name(r["keeper"].text)).font(.caption)
                            ForEach(r["target"].items,id:\.selfID){t in Text(t["control"].text+": "+nativeControlLabel(t["control"].text,Int(t["value"].number))).font(.caption)}
                            ForEach(Array(r["attempts"].items.enumerated()),id:\.offset){_,a in Text("Night "+a["night"].text+": "+(a["ok"].flag ? "Success":"Failed")).font(.caption)}
                        }
                    }
                }
                Button("Redeal puzzle"){send("riteRedeal",["squad":.string(squad.id)])}.disabled(busy || sealed)
            }
        }
    }
}
