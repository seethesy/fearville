import tracks from './tracks.json' with { type:'json' };
import { audioVolume, type AudioSettings, type MusicContext } from './context.ts';
export type AudioVoice = { fade(volume:number,seconds:number):void; stop(afterSeconds?:number):void };
export type AudioBackend = { unlock():Promise<boolean>; start(url:string,loop:boolean):Promise<AudioVoice | null> };
export type TrackMap = { music: Record<string,string>; effects: Record<string,string> };
export const AUDIO_FADE_SECONDS = .6;
export function musicTrack(context: MusicContext, map: TrackMap = tracks) {
  return map.music[context] ?? (context.startsWith('rite.') ? map.music.rite : undefined) ??
    (context==='voting' ? map.music.day : undefined) ?? map.music.hub;
}
/** Shared music/effect ownership, independent of React and of game state. */
export class AudioManager {
  private settings:AudioSettings={music:0,sfx:60,muteInBackground:true};
  private context:MusicContext='hub';
  private unlocked=false;
  private background=false;
  private enabled=true;
  private revision=0;
  private current:{url:string;voice:AudioVoice} | null=null;
  private effects=new Set<AudioVoice>();
  private backend:AudioBackend;
  private map:TrackMap;
  private nativeEffect?: (kind:string,volume:number)=>boolean;
  constructor(backend:AudioBackend, map:TrackMap=tracks, nativeEffect?:(kind:string,volume:number)=>boolean) {
    this.backend=backend; this.map=map; this.nativeEffect=nativeEffect;
  }
  async unlock() {
    try { this.unlocked=await this.backend.unlock(); } catch { this.unlocked=false; }
    await this.sync();
  }
  setContext(context:MusicContext) { if(this.context===context) return; this.context=context; void this.sync(); }
  setPreferences(settings:AudioSettings) {
    this.settings={...settings};
    const volume=this.enabled ? audioVolume(this.settings,'sfx',this.unlocked,this.background) : 0;
    for(const effect of this.effects) effect.fade(volume,.05);
    void this.sync();
  }
  setBackground(value:boolean) {
    this.background=value;
    if(value && this.settings.muteInBackground) for(const effect of this.effects) effect.fade(0,.1);
    if(!value && this.unlocked) void this.unlock();
    else void this.sync();
  }
  setEnabled(value:boolean) {
    this.enabled=value;
    if(!value) for(const effect of this.effects) { effect.fade(0,.1); effect.stop(.1); }
    void this.sync();
  }
  private async sync() {
    const revision=++this.revision;
    const volume=this.enabled ? audioVolume(this.settings,'music',this.unlocked,this.background) : 0;
    if (!volume) {
      if(this.current) { this.current.voice.fade(0,AUDIO_FADE_SECONDS); this.current.voice.stop(AUDIO_FADE_SECONDS); this.current=null; }
      return;
    }
    const url=musicTrack(this.context,this.map);
    if (!url) return;
    if(this.current?.url===url) { this.current.voice.fade(volume,AUDIO_FADE_SECONDS); return; }
    let voice:AudioVoice | null=null;
    try { voice=await this.backend.start(url,true); } catch { /* Audio never blocks UI. */ }
    if (!voice) return;
    if(revision!==this.revision) { voice.stop(); return; }
    if(this.current) { this.current.voice.fade(0,AUDIO_FADE_SECONDS); this.current.voice.stop(AUDIO_FADE_SECONDS); }
    this.current={url,voice}; voice.fade(volume,AUDIO_FADE_SECONDS);
  }
  async playEffect(kind:string) {
    const volume=this.enabled ? audioVolume(this.settings,'sfx',this.unlocked,this.background) : 0;
    if(!volume) return;
    if(this.nativeEffect?.(kind,volume)) return;
    const url=this.map.effects[kind];
    if(!url) return;
    try {
      const voice=await this.backend.start(url,false);
      if(!voice) return;
      const current=this.enabled ? audioVolume(this.settings,'sfx',this.unlocked,this.background) : 0;
      if(!current) { voice.stop(); return; }
      this.effects.add(voice); voice.fade(current,.01);
      const timer=setTimeout(()=>this.effects.delete(voice),5000);
      // No need to hold a Node test process open; browsers return a numeric ID.
      if(typeof timer==='object' && 'unref' in timer) timer.unref();
    } catch { /* No synthesis fallback or user-facing fetch errors. */ }
  }
}
