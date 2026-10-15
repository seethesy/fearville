import type { Preferences } from '@/lib/accounts/preferences';
import { nativeCue } from '@/lib/native/bridge';
import { AudioManager } from '@/lib/audio/manager';
import { BrowserAudioBackend } from '@/lib/audio/browser';
import type { MusicContext } from '@/lib/audio/context';
let manager:AudioManager | undefined;
function audio() {
  return manager ??=new AudioManager(new BrowserAudioBackend(),undefined,(kind,volume)=>
    kind==='phase' || kind==='error' ? nativeCue(kind,volume*.3) : false);
}
export function setAudioPreferences(value:Preferences) { audio().setPreferences(value); }
/** Call only from the provider's trusted user-gesture handler. */
export function unlockAudio() { void audio().unlock(); }
export function setMusicContext(value:MusicContext) { audio().setContext(value); }
export function backgroundAudio(value:boolean) { audio().setBackground(value); }
export function ambientAudio(on:boolean) { audio().setEnabled(on); }
export function playCue() { void audio().playEffect('phase'); }
export function errorCue() { void audio().playEffect('error'); }
