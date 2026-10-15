'use client';
import { useEffect, useRef, useState } from 'react';
import AppLink from '@/components/app-link';
import { HubShell } from '@/components/hub/shell';
import { useAccount } from '@/components/hub/account-context';
import { Escape } from '@/components/rite/night-rite/escape';
import { Laboratory } from '@/components/rite/night-rite/laboratory';
import { Sphinx } from '@/components/rite/night-rite/sphinx';
import { PATTERNS } from '@/lib/rite/types';
import { startRush, retryRush, failRush, rushAction, rushView, elapsedRush,
  type RushKind, type RushPuzzle, type RushRun } from '@/lib/puzzle-rush/engine';
import './puzzle-rush.css';

export default function PuzzleRush() {
  const {state:account,error:accountError} = useAccount();
  return <HubShell active="Play" title="Puzzle Rush" subtitle="One puzzle. Your pace. No time limit.">
    {!account ? <output>{accountError || 'Checking your account…'}</output> :
      !account.account ? <section className="panel"><h2>Sign in to play</h2><p>Puzzle Rush is available to signed-in players.</p><AppLink className="primary" href="/#signin">Sign in</AppLink></section> :
      <SoloPuzzles key={account.account.id} />}
  </HubShell>;
}

function SoloPuzzles() {
  const [choice,setChoice] = useState<RushKind | 'mixed'>('mixed');
  const [run,setRun] = useState<RushRun | null>(null);
  const current = useRef<RushRun | null>(null);
  const [now,setNow] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [flash,setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestBusy = useRef(false);
  const [revision,setRevision] = useState(0);
  useEffect(()=>()=>{ request.current?.abort(); if (flashTimer.current) clearTimeout(flashTimer.current); },[]);
  const playing = run?.status === 'playing';
  useEffect(()=>{
    if (!playing) return;
    const timer=setInterval(()=>setNow(Date.now()),250);
    return ()=>clearInterval(timer);
  },[playing]);
  const apply = (next: RushRun | null) => { current.current=next; setRun(next); setNow(Date.now()); };
  const complain = (message: string) => {
    setError(message); setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current=setTimeout(()=>setFlash(false),400);
  };
  async function next() {
    if (requestBusy.current) return;
    requestBusy.current=true;
    setBusy(true); setError('');
    const controller=new AbortController(); request.current=controller;
    try {
      const kinds: RushKind[]=['board','grid','lab'];
      const kind=choice==='mixed' ? kinds[Math.floor(Math.random()*kinds.length)] : choice;
      const response=await fetch('/api/puzzle-rush?puzzle='+kind,{cache:'no-store',signal:controller.signal});
      const data=await response.json() as {puzzle?:RushPuzzle;error?:string};
      if (!response.ok || !data.puzzle) throw Error(data.error || 'Could not prepare a puzzle.');
      if (controller.signal.aborted) return;
      apply(startRush(data.puzzle,Date.now())); setRevision(r=>r+1);
    } catch (error) {
      if (!controller.signal.aborted) complain(error instanceof Error ? error.message : 'Could not prepare a puzzle.');
    } finally {
      requestBusy.current=false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const send=async (action:string,payload:Record<string,unknown>={})=>{
    const previous=current.current;
    if (!previous || requestBusy.current) return;
    setError('');
    try {
      const next=rushAction(previous,action,payload,Date.now());
      apply(next);
      if (action==='riteGridSubmit' && next.status!=='solved') complain('That answer does not fit all the clues. Keep trying.');
      if (action==='riteLabCall' && payload.kind==='reset') setRevision(r=>r+1);
    } catch(error) { complain(error instanceof Error ? error.message : 'Try another move.'); }
  };
  const puzzle=run ? rushView(run) : null;
  const seconds=run ? Math.floor(elapsedRush(run,now)/1000) : 0;
  return <section className={'panel night-rite puzzle-rush '+(flash?'rite-flash':'')} aria-label="Solo puzzles">
    {!run ? <>
      <h2>Choose your puzzle</h2>
      <label className="field">Puzzle<select value={choice} disabled={busy} onChange={e=>setChoice(e.target.value as RushKind|'mixed')}>
        <option value="mixed">Mixed</option>{(['board','grid','lab'] as const).map(kind=><option key={kind} value={kind}>{PATTERNS[kind]}</option>)}
      </select></label>
      <p>Slide the carriage to safety, solve every Sphinx clue, or sort the Alchemist’s liquids. Play alone with no turns or votes.</p>
      <button className="primary" disabled={busy} onClick={()=>void next()}>{busy?'Preparing…':'Start puzzle'}</button>
    </> : <>
      <header className="rush-heading"><h2>{PATTERNS[run.puzzle.type]}</h2><p>Elapsed <output>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</output> · {run.moves} moves</p></header>
      {run.status==='playing' && puzzle && <div key={revision}>
        {puzzle.type==='board' && <Escape puzzle={puzzle} send={send} busy={busy} solo />}
        {puzzle.type==='lab' && <Laboratory puzzle={puzzle} send={send} busy={busy} solo />}
        {puzzle.type==='grid' && <Sphinx puzzle={puzzle} send={send} busy={busy} solo />}
        <div className="rite-buttons rush-actions">
          <button className="secondary" onClick={()=>{apply(retryRush(run,Date.now()));setError('');setRevision(r=>r+1);}}>Retry</button>
          <button className="secondary" onClick={()=>{apply(failRush(run,Date.now()));setError('');}}>Give up</button>
        </div>
      </div>}
      {run.status!=='playing' && <div className="rush-result" aria-live="polite">
        <h3>{run.status==='solved'?'Puzzle solved!':'Puzzle unfinished'}</h3>
        <p>{run.status==='solved'?'Solved':'Failed'} · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} · {run.moves} moves</p>
        <div className="rite-buttons">
          <button className="primary" disabled={busy} onClick={()=>void next()}>{busy?'Preparing…':'Next puzzle'}</button>
          <button className="secondary" disabled={busy} onClick={()=>{apply(retryRush(run,Date.now()));setError('');setRevision(r=>r+1);}}>Retry same puzzle</button>
        </div>
      </div>}
      <button className="secondary" disabled={busy} onClick={()=>{apply(null);setError('');}}>Choose another puzzle</button>
    </>}
    {error && <p className="rite-error" role="alert">{error}</p>}
    <AppLink className="quiet-link" href="/">Quit to Play →</AppLink>
  </section>;
}
