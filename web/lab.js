import {strategies, nextAction, tamperedCopy} from './lab-model.mjs';

const $ = id => document.getElementById(id);
let state = null;
let documentRecord = null;
let sources = {};
let selectedMessage = 0;
let busy = false;

function savedSession() {
  try { return sessionStorage.getItem('colouring-session'); } catch { return null; }
}
function saveSession(token) {
  try { sessionStorage.setItem('colouring-session', token); } catch { }
}
async function post(path, body) {
  const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The Python server could not complete this action.');
  return result;
}
async function protocol(action, extra = {}) {
  state = await post('/api/protocol', {action, session:state?.session || savedSession(), ...extra});
  saveSession(state.session);
  return state;
}
function notify(text, kind = '') {
  $('lab-message').textContent = text;
  $('lab-message').dataset.kind = kind;
}
async function perform(task) {
  if (busy) return;
  busy = true;
  renderControls();
  $('lab').setAttribute('aria-busy','true');
  try { await task(); }
  catch (error) { notify(error.message, 'error'); }
  finally { busy = false; $('lab').removeAttribute('aria-busy'); render(); }
}
function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function renderControls() {
  const enabled = state && !busy;
  const action = state ? nextAction(state.phase) : null;
  $('advance').textContent = busy ? 'Working…' : action?.[1] || 'Seal answers';
  $('advance').disabled = !enabled;
  $('restart').disabled = busy;
  $('strategy').disabled = busy;
  $('edge').disabled = !enabled || state.phase !== 'sealed';
  for (const id of ['tamper-button','original-button','download']) $(id).disabled = !enabled || !state.completed_rounds;
  $('tamper-kind').disabled = !enabled || !state.completed_rounds;
  $('import').disabled = busy;
}
function render() {
  renderControls();
  if (!state) return;
  $('phase').textContent = `Round ${state.round} · ${{ready:'ready to commit',sealed:'committed; awaiting your challenge',challenged:'challenge fixed; awaiting openings',opened:state.verdict?.accepted?'check passed':'check rejected'}[state.phase]}`;
  const notes = {
    ready:'The prover will relabel the colours privately and prepare fresh commitments. Reused-seal mode deliberately skips that refresh.',
    sealed:'All answers are locked. Choose a random edge, or select one manually for exploration. The choice is made after commitment.',
    challenged:'Only the two challenged endpoints may now be opened. No other colour or salt is disclosed.',
    opened:'This edge has been checked. A new round requires new commitments. This lab lets you inspect independent checks even after a rejection.'
  };
  $('action-note').textContent = notes[state.phase];
  $('rooms').replaceChildren();
  state.vertices.forEach((name, vertex) => {
    const room = textElement('span', '', 'lab-room');
    room.append(textElement('span', name));
    const value = state.visible[String(vertex)];
    const counter = textElement('span', value === undefined ? '?' : String(value+1), 'lab-counter');
    if (value !== undefined) counter.dataset.colour = value;
    counter.setAttribute('aria-label', `Room ${name}: ${value===undefined?'hidden':'colour '+(value+1)}`);
    room.append(counter); $('rooms').append(room);
  });
  const choice = $('edge').value;
  $('edge').replaceChildren(new Option('Uniform random edge','random'));
  state.edges.forEach(([a,b],i) => $('edge').append(new Option(`${state.vertices[a]}–${state.vertices[b]}`, String(i))));
  if ([...$('edge').options].some(o => o.value === choice)) $('edge').value = choice;
  $('timeline').replaceChildren();
  if (!state.events.length) $('timeline').append(textElement('p','No message has been sent. Start by sealing the answers.','small-note'));
  state.events.forEach((event, index) => {
    const button = document.createElement('button');
    button.className = 'message-entry';
    button.setAttribute('aria-pressed', index === selectedMessage ? 'true' : 'false');
    button.append(textElement('span', `${event.sequence}. ${event.sender} → ${event.recipient}`));
    button.append(textElement('small', `Round ${event.round} · ${event.bytes} UTF-8 bytes · ${event.function}()`));
    button.addEventListener('click', () => { selectedMessage=index; render(); });
    $('timeline').append(button);
  });
  $('byte-total').textContent = `${state.events.length} protocol messages · ${state.events.reduce((n,e)=>n+e.bytes,0)} bytes total. Compact JSON payloads only; excludes HTTP and interface data.`;
  const event = state.events[selectedMessage];
  if (event) {
    $('payload-title').textContent = `${event.sender} → ${event.recipient}`;
    $('payload').textContent = JSON.stringify(event.payload,null,2);
    const source = sources[event.function];
    $('source-label').textContent = source ? `${source.file}:${source.line} · ${event.function}()` : event.function;
    $('source').textContent = source?.source || 'Source unavailable. The protocol execution remains available.';
  } else {
    $('payload-title').textContent='No message sent yet'; $('payload').textContent='Seal the answers to send the first message.';
    $('source-label').textContent='Python implementation'; $('source').textContent=sources['Session.seal']?.source || 'Loading actual source…';
  }
  $('tamper-hint').textContent = state.completed_rounds ? 'Edits affect a copy only. You can always verify or download the unchanged original.' : 'Complete one round to unlock this experiment.';
}
function renderChecks(target, result, includeDigests=false) {
  target.replaceChildren();
  const title=textElement('p', result.accepted ? 'Accepted · every recorded check passed' : 'Rejected · a recorded check failed', 'result-label');
  title.dataset.result=result.accepted?'pass':'fail'; target.append(title);
  if (result.error) target.append(textElement('p',result.error,'small-note'));
  for (const round of result.rounds || []) {
    const list=document.createElement('ul'); list.className='lab-checks';
    list.append(textElement('li', `Round ${round.round}`));
    for (const check of round.checks) {
      const row=document.createElement('li'); row.append(textElement('span',check.passed===null?'—':check.passed?'✓':'×',check.passed===null?'':check.passed?'check-pass':'check-fail'),textElement('span',check.name+(check.passed===null?' · not evaluated':''))); list.append(row);
    }
    target.append(list);
  }
  if (result.limitation) target.append(textElement('p',result.limitation,'small-note'));
  if (includeDigests) {
    $('digests').replaceChildren();
    for (const detail of result.rounds?.at(-1)?.openings || []) {
      const container=document.createElement('article'); container.className='digest';
      container.append(textElement('h3',`Room ${detail.room} · ${detail.matches?'matching digest':'digest mismatch'}`));
      const dl=document.createElement('dl');
      for (const [label,value] of [['Exact encoded input',detail.encoding],['UTF-8 input length',`${detail.input_bytes} bytes`],['SHA-256 recomputed by Python',detail.recomputed],['Original commitment received before challenge',detail.original]]) {
        dl.append(textElement('dt',label),textElement('dd',value));
      }
      container.append(dl); $('digests').append(container);
    }
  }
}
async function refreshRecord() {
  documentRecord=await post('/api/transcript',{session:state.session});
  const result=await post('/api/verify',{document:documentRecord});
  renderChecks($('verification'),result,true);
}
async function start() {
  await protocol('create', strategies[$('strategy').value]);
  documentRecord=null; selectedMessage=0;
  $('verification').replaceChildren(textElement('p','Open the challenged endpoints to see the individual checks.','small-note'));
  $('digests').replaceChildren(); $('tamper-result').replaceChildren(); $('import-result').replaceChildren();
  notify('New session ready. No private colouring has been sent to the browser.');
}
$('advance').addEventListener('click',()=>perform(async()=>{
  const [action]=nextAction(state.phase);
  const extra=action==='challenge'&&$('edge').value!=='random'?{edge:Number($('edge').value)}:{};
  await protocol(action,extra);
  selectedMessage=Math.max(0,state.events.length-1);
  if(action==='open') {
    await refreshRecord();
    notify(state.verdict.accepted?'Both openings were verified by Python.':'The Python verifier rejected this edge.',state.verdict.accepted?'success':'error');
  } else notify(action==='next'?(state.mode==='reuse'?'The same private colouring and seals will be reused; previous openings remain visible.':'Prepare new commitments for the next round; previous public messages remain in the timeline.'):'Public message recorded. Inspect its exact payload below.');
}));
$('restart').addEventListener('click',()=>perform(start));
$('strategy').addEventListener('change',()=>perform(start));
$('tamper-button').addEventListener('click',()=>perform(async()=>{
  const changed=tamperedCopy(documentRecord,$('tamper-kind').value);
  const result=await post('/api/verify',{document:changed});
  renderChecks($('tamper-result'),result);
  const diff=textElement('pre',`Original last round:\n${JSON.stringify(documentRecord.rounds.at(-1),null,2)}\n\nEdited copy:\n${JSON.stringify(changed.rounds.at(-1),null,2)}`,'change-diff');
  const details=document.createElement('details');details.append(textElement('summary','Inspect the before / after values'),diff);$('tamper-result').append(details);
  notify('The edited copy was checked. The original record is unchanged.');
}));
$('original-button').addEventListener('click',()=>perform(async()=>renderChecks($('tamper-result'),await post('/api/verify',{document:documentRecord}))));
$('download').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(documentRecord,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download='transcript.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('import').addEventListener('change',()=>perform(async()=>{
  const file=$('import').files[0];if(!file)return;
  if(file.size>1024*1024)throw new Error('Choose a transcript smaller than 1 MiB for the browser verifier.');
  const record=JSON.parse(await file.text());
  renderChecks($('import-result'),await post('/api/verify',{document:record}));
}));
await perform(async()=>{
  try { const response=await fetch('/api/source');if(response.ok)sources=await response.json(); } catch { }
  $('verify-source').textContent=sources.verify?.source || 'Source unavailable.';
  $('encoding-source').textContent=[sources.encode_commitment?.source,sources.commit?.source].filter(Boolean).join('\n') || 'Source unavailable.';
  await start();
});
