'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import { TableConnection } from '@/lib/game/socket-client';
import type { ViewEnvelope } from '@/lib/game/socket-protocol';
import type { GameView } from '@/lib/game/view';
import type { ActionTiming } from '@/lib/game/action-timing';
export function useTableSocket({ code,me,pov,onView,poll }: { code?: string; me?: string; pov?: string;
  onView:(view:GameView)=>void; poll:()=>Promise<void> }) {
  const [connected,setConnected]=useState(false);
  const [timing,setTiming]=useState<{rtt?:number;push?:number}>({});
  const pending=useRef(new Map<string,number>());
  const apply=useCallback((frame:ViewEnvelope)=> {
    onView(frame.data);
    const sent=frame.cause ? pending.current.get(frame.cause) : undefined;
    if(sent!==undefined) {
      setTiming((old)=>({...old,push:performance.now()-sent}));
      pending.current.delete(frame.cause!);
    }
  },[onView]);
  useEffect(()=> {
    const record=(event:Event)=> {
      const detail=(event as CustomEvent<ActionTiming>).detail;
      if(detail.duration===undefined) {
        pending.current.set(detail.id,detail.started);
        if(pending.current.size>100) pending.current.delete(pending.current.keys().next().value!);
      } else setTiming((old)=>({...old,rtt:detail.duration}));
    };
    window.addEventListener('fearville:action-timing',record);
    return ()=>window.removeEventListener('fearville:action-timing',record);
  },[]);
  useEffect(()=> {
    const connection=new TableConnection({code:code ?? '',me:me ?? '',poll,view:apply,status:setConnected,
      connect:()=> {
        const url=new URL('/api/table/socket',location.href);
        url.protocol=location.protocol==='https:'?'wss:':'ws:';
        url.searchParams.set('code',code!);
        if(pov && pov!=='host') url.searchParams.set('pov',pov);
        return new WebSocket(url);
      }});
    connection.start();
    const resume=()=> {if(!document.hidden) connection.resume();};
    window.addEventListener('online',resume);window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);
    document.addEventListener('visibilitychange',resume);
    return ()=> {connection.stop();setConnected(false);
      window.removeEventListener('online',resume);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);
      document.removeEventListener('visibilitychange',resume);};
  },[code,me,pov,poll,apply]);
  return {connected,...timing};
}
