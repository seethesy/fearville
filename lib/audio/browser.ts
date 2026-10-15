import type { AudioBackend, AudioVoice } from './manager.ts';
/** Web Audio also runs in Capacitor WebViews. Only unlock() creates a context. */
export class BrowserAudioBackend implements AudioBackend {
  private context:AudioContext | null=null;
  private cache=new Map<string,Promise<AudioBuffer | null>>();
  async unlock() {
    if(typeof window==='undefined' || typeof AudioContext==='undefined') return false;
    this.context ??=new AudioContext();
    await this.context.resume();
    return this.context.state==='running';
  }
  private load(url:string) {
    const existing=this.cache.get(url);
    if(existing) return existing;
    const promise=(async()=>{
      try {
        const response=await fetch(url,{cache:'force-cache'});
        if(!response.ok) throw Error('Audio unavailable');
        return await this.context!.decodeAudioData(await response.arrayBuffer());
      } catch { this.cache.delete(url); return null; }
    })();
    this.cache.set(url,promise);
    if(this.cache.size>8) this.cache.delete(this.cache.keys().next().value!);
    return promise;
  }
  async start(url:string,loop:boolean):Promise<AudioVoice | null> {
    const context=this.context;
    if(!context || context.state!=='running') return null;
    const buffer=await this.load(url);
    if(!buffer || context.state!=='running') return null;
    const source=context.createBufferSource(), gain=context.createGain();
    source.buffer=buffer; source.loop=loop; gain.gain.value=0;
    source.connect(gain); gain.connect(context.destination);
    let stopped=false;
    source.onended=()=>{ source.disconnect(); gain.disconnect(); };
    source.start();
    return {
      fade(volume,seconds) {
        const now=context.currentTime;
        if(typeof gain.gain.cancelAndHoldAtTime==='function') gain.gain.cancelAndHoldAtTime(now);
        else { gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value,now); }
        gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(1,volume)),now+seconds);
      },
      stop(afterSeconds=0) {
        if(stopped) return; stopped=true;
        try { source.stop(context.currentTime+afterSeconds); } catch { /* Already ended. */ }
      },
    };
  }
}
