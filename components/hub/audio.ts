import {
  defaultPreferences,
  type Preferences,
} from '@/lib/accounts/preferences';
import { nativeCue, type Cue } from '@/lib/native/bridge';
let preferences = defaultPreferences;
let context: AudioContext | undefined;
let music: GainNode | undefined;
let ambient = false;
let visibilityBound = false;
function volume() {
  if (music && context)
    music.gain.setTargetAtTime(
      ambient && !(document.hidden && preferences.muteInBackground)
        ? (preferences.music / 100) * 0.035
        : 0,
      context.currentTime,
      0.3,
    );
}
export function setAudioPreferences(value: Preferences) {
  preferences = value;
  if (typeof document !== 'undefined') volume();
}
export function unlockAudio() {
  if (!context) {
    context = new AudioContext();
    music = context.createGain();
    music.gain.value = 0;
    music.connect(context.destination);
    // A quiet, original three-note ambient bed. No third-party audio downloads.
    for (const frequency of [110, 164.81, 220.4]) {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(music);
      oscillator.start();
    }
  }
  void context.resume();
  if (!visibilityBound) {
    document.addEventListener('visibilitychange', volume);
    visibilityBound = true;
  }
  volume();
}
export function ambientAudio(on: boolean) {
  ambient = on;
  if (on) unlockAudio();
  volume();
}
function toneCue(frequency: number) {
  unlockAudio();
  if (!context || (document.hidden && preferences.muteInBackground)) return;
  const tone = context.createOscillator(),
    gain = context.createGain();
  tone.frequency.setValueAtTime(frequency, context.currentTime);
  tone.frequency.exponentialRampToValueAtTime(frequency / 2, context.currentTime + 0.18);
  gain.gain.setValueAtTime((preferences.sfx / 100) * 0.12, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
  tone.connect(gain);
  gain.connect(context.destination);
  tone.start();
  tone.stop(context.currentTime + 0.3);
}
// In the app shells cues play natively, which respects the silent switch.
function cue(kind: Cue, frequency: number) {
  if (typeof document !== 'undefined' && document.hidden && preferences.muteInBackground) return;
  if (preferences.sfx <= 0) return;
  if (nativeCue(kind, (preferences.sfx / 100) * 0.3)) return;
  toneCue(frequency);
}
export function playCue() { cue('phase', 660); }
export function errorCue() { cue('error', 180); }
