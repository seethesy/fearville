'use client';
import {useEffect,useState} from 'react';
import {useAccount} from '@/components/hub/account-context';
import {useText} from '@/components/ui-text';
export function GameTrustReward({game}:{game:string}) {
  const {state}=useAccount();
  const account=state?.account?.id;
  const text=useText();
  const [reward,setReward]=useState<{game:string;account:string;amount:number}|null>(null);
  useEffect(()=>{
    if(!account) return;
    let live=true;
    const refresh=()=>void fetch('/api/wallet?game='+encodeURIComponent(game),{cache:'no-store'}).then(async r=>{
      if(r.ok){const data=await r.json() as {gameEarned?:number};if(live)setReward({game,account,amount:data.gameEarned??0});}
    }).catch(()=>{});
    refresh(); const timer=setInterval(refresh,15000);
    return()=>{live=false;clearInterval(timer);};
  },[account,game]);
  return reward?.game===game && reward.account===account && reward.amount>0?<p aria-live="polite">{text('wallet.gameEarned',{amount:reward.amount})}</p>:null;
}
