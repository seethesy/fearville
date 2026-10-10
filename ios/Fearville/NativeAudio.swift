import Foundation
import AVFoundation

@MainActor final class NativeAudio {
    static let shared = NativeAudio()
    private var music: AVAudioPlayer?
    private var sound: AVAudioPlayer?
    private var preferences = NativePreferences()
    private var background = false
    private var enabled = false
    func apply(_ value: NativePreferences) { preferences = value; update() }
    func setBackground(_ value: Bool) { background = value; update() }
    func ambient(_ value: Bool) { enabled = value; update() }
    private func update() {
        guard enabled && preferences.music > 0 && !(background && preferences.muteInBackground) else { music?.pause(); return }
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        if music == nil { music = try? AVAudioPlayer(data: wave(seconds: 4, frequencies: [110, 165, 220], decay: false)); music?.numberOfLoops = -1 }
        music?.volume = Float(preferences.music / 100 * 0.16); music?.play()
    }
    func cue(error: Bool = false) {
        guard !(background && preferences.muteInBackground), preferences.sfx > 0 else { return }
        sound = try? AVAudioPlayer(data: wave(seconds: 0.3, frequencies: error ? [180, 90] : [660, 330], decay: true))
        sound?.volume = Float(preferences.sfx / 100 * 0.3); sound?.play()
    }
    private func wave(seconds: Double, frequencies: [Double], decay: Bool) -> Data {
        let rate = 22050, count = Int(seconds * 22050), bytes = count * 2
        var data = Data()
        func word<T: FixedWidthInteger>(_ value: T) { var little = value.littleEndian; withUnsafeBytes(of: &little) { data.append(contentsOf: $0) } }
        data.append(contentsOf: "RIFF".utf8); word(UInt32(36 + bytes)); data.append(contentsOf: "WAVEfmt ".utf8); word(UInt32(16)); word(UInt16(1)); word(UInt16(1)); word(UInt32(rate)); word(UInt32(rate * 2)); word(UInt16(2)); word(UInt16(16)); data.append(contentsOf: "data".utf8); word(UInt32(bytes))
        for i in 0..<count {
            let time = Double(i) / Double(rate)
            let value = frequencies.reduce(0.0) { $0 + sin(2 * .pi * $1 * time) } / Double(frequencies.count)
            let envelope = decay ? pow(max(0, 1 - time / seconds), 2) : 1
            word(Int16(value * envelope * 20000))
        }
        return data
    }
}
