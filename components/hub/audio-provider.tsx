'use client';
import { useEffect } from 'react';
import { onLifecycle } from '@/lib/native/bridge';
import { musicContext } from '@/lib/audio/context';
import { unlockAudio, setMusicContext, backgroundAudio, ambientAudio } from './audio';
export function AudioProvider() {
  useEffect(()=>{
    ambientAudio(true);
    const route=()=>setMusicContext(musicContext({path:location.pathname}));
    const gesture=(event:Event)=>{ if(event.isTrusted) unlockAudio(); };
    const visibility=()=>backgroundAudio(document.hidden);
    route(); visibility();
    document.addEventListener('pointerdown',gesture,{passive:true});
    document.addEventListener('keydown',gesture);
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('popstate',route);
    const unsubscribe=onLifecycle(event=>{
      if(event==='pause') backgroundAudio(true);
      if(event==='resume') backgroundAudio(document.hidden);
    });
    return ()=>{
      unsubscribe();
      document.removeEventListener('pointerdown',gesture);
      document.removeEventListener('keydown',gesture);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('popstate',route);
      ambientAudio(false);
    };
  },[]);
  return null;
}
