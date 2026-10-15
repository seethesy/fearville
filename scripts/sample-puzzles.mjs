// Offline preview only; generation/solver work never runs on a live request.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PUZZLE_PRESETS, puzzlePreset } from '../lib/rite/generator-config.ts';
import { generateBoard, solveBoard } from '../lib/rite/board.ts';
import { generateLab, solveLab } from '../lib/rite/lab.ts';
import { makeRiddle, solveGrid } from '../lib/rite/grid.ts';
import { render } from '../lib/rite/grid/prose.ts';
import { rng } from '../lib/rite/random.ts';
import { generateRitual } from '../lib/rite/ritual.ts';

if (!isMainThread) {
  const { puzzle, preset, seed } = workerData;
  const start = performance.now();
  let state, metrics;
  if (puzzle === 'escape') {
    state = generateBoard(seed, 3, preset);
    const solution = solveBoard(state.blocks);
    metrics = { optimalMoves: state.par, solver: solution?.length === state.par ? 'certified' : 'unconfirmed' };
  } else if (puzzle === 'lab') {
    state = generateLab(seed, 3, preset);
    const solution = solveLab(state.vials, 120000);
    metrics = { optimalMoves: state.par, solver: solution?.length === state.par ? 'certified' : 'unconfirmed' };
  } else if (puzzle === 'sphinx') {
    const riddle = makeRiddle(seed, PUZZLE_PRESETS[preset].grid.soloClues);
    const random = rng(seed + ':wording');
    state = { type: 'grid', solution: riddle.solution, clues: riddle.cards.map(c => ({ logic:c.logic, text:render(random,c.logic,c.form) })) };
    metrics = { clues:state.clues.length, solutions:solveGrid(state.clues).length, ...riddle.difficulty };
  } else {
    state = generateRitual(seed, ['a','b','c'], [], preset);
    metrics = { omens:state.rituals.a.omens.length, solver:'lookup table (not a search puzzle)' };
  }
  parentPort.postMessage({ seed, milliseconds:Math.round(performance.now()-start), ...metrics, state });
} else {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/,'').split('=')));
  const puzzle = args.puzzle ?? 'escape';
  if (!['escape','lab','sphinx','ritual'].includes(puzzle)) throw Error('puzzle must be escape, lab, sphinx or ritual');
  const preset = puzzlePreset(args.preset ?? 'normal'), n = Number(args.n ?? 5);
  if (!Number.isInteger(n) || n < 1 || n > 500) throw Error('n must be an integer from 1 to 500');
  const output = resolve('work/puzzle-samples', `${puzzle}-${preset}`);
  mkdirSync(output, {recursive:true});
  const results = [];
  for (let i=0; i<n; i++) {
    const seed = `${args.seed ?? 'sample'}:${i}`;
    const result = await new Promise(resolveResult => {
      const worker = new Worker(new URL(import.meta.url), {workerData:{puzzle,preset,seed}});
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolveResult(result);
      };
      // A bad preset cannot hang the author's CLI indefinitely.
      const timer = setTimeout(() => finish({seed,error:'Generation exceeded 20 seconds'}), 20000);
      worker.once('message', finish);
      worker.once('error', e => finish({seed,error:e.message}));
      worker.once('exit', code => { if (!settled) finish({seed,error:`Worker exited (${code})`}); });
    });
    results.push(result);
    const {state, ...metrics} = result;
    console.log(JSON.stringify(metrics));
    if (i < 3 && state) writeFileSync(resolve(output, `example-${i+1}.html`), example(state, metrics));
  }
  const report = results.map(({state, ...metrics}) => metrics);
  writeFileSync(resolve(output,'report.json'), JSON.stringify({puzzle,preset,results:report},null,2));
  const failed = report.filter(r=>r.error).length;
  console.log(`${n-failed}/${n} generated; ${failed} failures. Examples and report: ${output}`);
  if (failed) process.exitCode = 1;
}

function escape(text) { return String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function example(state, metrics) {
  const palette=['#bd4e4e','#5d98c7','#d7b654','#6ca86b','#a775b9','#db8d56','#78c5c2','#cf84a8','#a1ad58','#8792d4'];
  let drawing='';
  if (state.type==='board') drawing=`<svg viewBox="0 0 360 360" role="img" aria-label="Escape board">${state.blocks.map(b=>`<g><rect x="${b.x*60+2}" y="${b.y*60+2}" width="${(b.horiz?b.len:1)*60-4}" height="${(b.horiz?1:b.len)*60-4}" rx="6" fill="${b.key?'#bd4e4e':'#596d80'}"/><text x="${b.x*60+10}" y="${b.y*60+25}" fill="white">${escape(b.id)}</text></g>`).join('')}</svg>`;
  if (state.type==='lab') drawing=`<div class="vials">${state.vials.map(v=>`<div class="vial" aria-label="${escape(v.id)}"><span>${escape(v.id)}</span>${Array.from({length:4},(_,i)=>`<div style="background:${v.layers[3-i]===undefined?'transparent':palette[v.layers[3-i]]}">${v.layers[3-i]??''}</div>`).join('')}</div>`).join('')}</div>`;
  if (state.type==='grid') drawing=`<ol>${state.clues.map(c=>`<li>${escape(c.text)}</li>`).join('')}</ol>`;
  if (state.type==='ritual') drawing=`<p>Performer a: ${state.rituals.a.omens.map(omen=>`[${omen.join(', ')}]`).join(' · ')}</p><p>Symbol IDs and control lookup table appear in the expandable state below.</p>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Puzzle sample ${escape(metrics.seed)}</title><style>body{font:16px system-ui;background:#17212a;color:#eee;max-width:760px;margin:auto;padding:20px}svg{width:100%;max-width:360px;background:#293744}.vials{display:flex;flex-wrap:wrap;gap:12px}.vial{width:42px;border:2px solid #aaa;border-radius:0 0 12px 12px;overflow:hidden}.vial>div{height:28px;text-align:center}.vial>span{display:block;text-align:center}pre{white-space:pre-wrap;overflow-wrap:anywhere}li{margin-bottom:12px}</style><h1>Puzzle sample</h1><pre>${escape(JSON.stringify(metrics,null,2))}</pre>${drawing}<details><summary>Solution and full generated state (spoilers)</summary><pre>${escape(JSON.stringify(state,null,2))}</pre></details></html>`;
}
