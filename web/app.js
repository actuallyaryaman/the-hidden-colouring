'use strict';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const chapterNames = ['The puzzle', 'Seal the answers', 'Ask a question', 'Open two answers', 'Repeat the test', 'Break the rules'];
const lesson = [
  {label:'THE STARTING POINT',title:'A puzzle. A private answer.',intro:'You have solved a puzzle. How could you convince a friend without giving them your solution?',note:'First, learn the rule.',body:'Each circle is a room. Each line joins two rooms. Give every room one of three colours. Rooms joined by a line must have different colours.',prover:'Holds a complete solution to the puzzle.',verifier:'Knows the rooms and connections, but should not receive the full solution.',takeaway:'Checking an answer is easier than finding one.',caption:'Click a room to change its colour. Dashed lines mark conflicts.',underTitle:'Why a colouring puzzle?',under:'<p>It gives us a claim that is easy to check: “this graph can be coloured using three colours.” The secret is a complete valid colouring. We use a small graph so you can follow every action.</p><p>This first screen is a teaching view. During the actual protocol, the full colouring stays with the prover.</p>'},
  {label:'MAKE A COMMITMENT',title:'Seal it before they ask.',intro:'The prover locks in an answer for every room. You receive a receipt for each answer, but cannot read the colour inside.',note:'Think sealed envelopes.',body:'A commitment acts like a sealed, tamper-evident envelope. It hides an answer now and lets you check later that the answer was not changed.',prover:'Randomly swaps the colour names, adds secret randomness, then commits to every room.',verifier:'Receives six commitments. No colours or secret randomness are revealed yet.',takeaway:'The answer is locked before the question is known.',caption:'The hidden solution stays on the Python prover. Only commitments are sent to your browser.',underTitle:'What makes the seal work?',under:'<p>Each commitment is a SHA-256 digest of a room identifier, its colour, and 32 random bytes. A digest is a fixed-length fingerprint of that input.</p><p>The secret randomness prevents simply trying the three colours. Later, the prover supplies an opening so the verifier can recompute the fingerprint. This is a teaching construction with explicit cryptographic assumptions; see the mathematics notes.</p>'},
  {label:'LET THE VERIFIER CHOOSE',title:'Ask one unpredictable question.',intro:'Choose a line to inspect. The prover must answer using the colours that were already sealed.',note:'You choose the challenge.',body:'An edge is simply a line joining two rooms. Pick one now. The prover does not get to choose an easy question after seeing your choice.',prover:'Waits with all answers committed. Cannot replace them after the challenge.',verifier:'Chooses one edge. A uniform random choice is needed for the probability argument.',takeaway:'An unpredictable question makes cheating risky.',caption:'Choose an edge below, or let the verifier choose uniformly at random.',underTitle:'Why choose after sealing?',under:'<p>If the prover knew your question first, they could prepare two different colours just for that edge and ignore the rest of the puzzle. Committing first prevents this shortcut.</p><p>Manual choices help you explore. The statistical guarantee uses fresh, uniformly random edge challenges.</p>'},
  {label:'CHECK A SMALL PIECE',title:'Open two. Keep the rest.',intro:'The prover opens only the two rooms you challenged. Check their seals, then check that their colours differ.',note:'Two checks, one verdict.',body:'First, verify that both answers match the original commitments. Second, check the colouring rule on this edge. A pass means this check succeeded.',prover:'Reveals two colours and their random salts. Every other opening stays private.',verifier:'Recomputes two digests and checks that the revealed colours differ.',takeaway:'One successful check is not a complete proof.',caption:'Only the challenged endpoints may be opened in this round.',underTitle:'What did you actually learn?',under:'<p>You learned that these two committed answers are consistent and different. You have not seen the whole solution, and one passing edge alone says little about the other edges.</p><p>The colour names were randomly permuted before the round, so an observed “1” is not a permanent label that you can carry into the next round.</p>'},
  {label:'BUILD ASSURANCE',title:'Fresh round. Stronger evidence.',intro:'Repeat with new colour labels, new secret randomness, and a new random question. False claims become harder to sustain.',note:'Repeat without collecting.',body:'The prover shuffles the colour names and makes fresh commitments every round. Earlier openings cannot simply be assembled into one fixed colouring.',prover:'Recommits to a freshly relabelled solution before each challenge.',verifier:'Runs independent random checks and rejects a run if any round fails.',takeaway:'Repetition lowers false acceptance; it does not measure a person’s honesty.',caption:'Each tile is a completed round. A dot is a pass; × means rejection.',underTitle:'What does the probability mean?',under:'<p>For a graph with m edges that cannot be three-coloured, every fixed three-colouring has at least one invalid edge. A uniform random challenge catches at least one in m, assuming binding commitments.</p><p>After r rounds, false acceptance is at most (1 − 1/m)<sup>r</sup>, apart from commitment-breaking probability. This is not a percentage probability that the prover is honest. Our small puzzle is colourable; the false-claim experiment is in the next chapter.</p>'},
  {label:'EXPERIMENT WITH FAILURE',title:'Now, bend the rules.',intro:'Try a bad answer, an impossible puzzle, and reused envelopes. Each breaks a different part of the story.',note:'Choose an experiment.',body:'A bad colouring tests one dishonest strategy. An impossible graph tests a false claim. Reusing commitments shows why repeated openings must not expose the same fixed solution.',prover:'Follows the strategy selected below.',verifier:'Checks seals and colours exactly as before. Reused rounds deliberately violate the normal protocol.',takeaway:'Correctness, soundness, and privacy are different properties.',caption:'Choose an experiment below to begin.',underTitle:'A demo is not a security proof.',under:'<p>The protocol illustrates completeness, soundness, and zero knowledge. Tests check the implementation. Probability calculations explain detection. A simulator argument explains why the view need not disclose the witness.</p><p>The four-room complete graph is not three-colourable: every room touches all three others. Reusing envelopes is a deliberately broken variant. Both parties run on your computer for teaching, not as a secure remote service.</p>'}
];
let chapter=0, state=null, busy=false, generation=0, chosenLab='cheat', localColours=[0,0,2,0,1,2];
const puzzleEdges=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,2],[2,4],[4,0]];
const base=[0,1,2,0,1,2];
const labs={cheat:{graph:'puzzle',mode:'cheat',name:'Bad solution',note:'This graph has a solution, but this prover supplies a colouring with 2 invalid edges out of 9. A random check catches this strategy with probability 2/9 per round.'},impossible:{graph:'impossible',mode:'cheat',name:'False claim',note:'Every pair of rooms is connected. Four rooms need four colours. This prover uses only three, leaving exactly 1 invalid edge out of 6. No valid three-colouring exists.'},reuse:{graph:'puzzle',mode:'reuse',name:'Reused seals',note:'A valid colouring is sealed once and reused. Open A–B, C–D, then E–F across rounds to collect every room’s colour. This deliberately violates the fresh-round rule.'}};
function el(name, attrs={}, text) {const e=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
function htmlEscape(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function message(text='',kind=''){ $('message').textContent=text;$('message').dataset.kind=kind; }
async function request(action, extra={}) {
 const response=await fetch('/api/protocol',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,session:state?.session,...extra})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not complete the check.');state=result;return result;
}
async function guard(fn) {if(busy)return;busy=true;document.body.setAttribute('aria-busy','true');renderControls();try{await fn();}catch(error){message(error.message,'error');}finally{busy=false;document.body.removeAttribute('aria-busy');renderControls();draw();renderBoardExtra();}}
async function go(index) {
 if(busy)return;const ticket=++generation;chapter=index;message();render();$('lesson').scrollIntoView({block:'start',behavior:'instant'});
 if(index===0){state=null;return;}
 await guard(async()=>{
  const config=index===5?labs[chosenLab]:{graph:'puzzle',mode:'honest'};
  await request('create',config);if(ticket!==generation)return;
  if(index>=2&&index<=4)await request('seal');
  if(index>=3&&index<=4)await request('challenge');
  if(index===4)await request('open');
  render();
 });
}
function render(){
 const d=lesson[chapter];$('chapter-count').textContent=String(chapter+1).padStart(2,'0')+' / 06';
 $('chapter-label').textContent=d.label;$('title').textContent=d.title;$('intro').textContent=d.intro;
 $('note-index').textContent='FIELD NOTE '+String(chapter+1).padStart(2,'0');$('note-title').textContent=d.note;$('note-body').textContent=d.body;
 $('prover-note').textContent=d.prover;$('verifier-note').textContent=d.verifier;$('takeaway').textContent=d.takeaway;
 $('board-caption').textContent=d.caption;$('understand-title').textContent=d.underTitle;$('understand-body').innerHTML=d.under;
 $('chapters').innerHTML=chapterNames.map((name,i)=>`<button class="chapter" data-chapter="${i}" ${i===chapter?'aria-current="step"':''}><span class="chapter-number">${String(i+1).padStart(2,'0')}</span>${name}</button>`).join('');
 $('chapters').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.chapter))));
 $('chapter-picker').innerHTML=chapterNames.map((name,i)=>`<option value="${i}" ${i===chapter?'selected':''}>${i+1}. ${name}</option>`).join('');
 renderControls();draw();renderBoardExtra();
}
function graphData(){return chapter===0?{vertices:['A','B','C','D','E','F'],edges:puzzleEdges,visible:Object.fromEntries(localColours.map((v,i)=>[i,v])),edge:null}:state||{vertices:['A','B','C','D','E','F'],edges:puzzleEdges,visible:{},edge:null};}
function draw(){
 const data=graphData(),svg=$('graph');svg.replaceChildren();
 const width=Math.max(230,$('graph-wrap').clientWidth),height=parseFloat(getComputedStyle(svg).height)||340;
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
 const n=data.vertices.length,cx=width/2,cy=height/2+2,rx=Math.min(width*.33,160),ry=Math.min(height*.33,117),r=24;
 const pts=data.vertices.map((_,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return[cx+Math.cos(a)*rx,cy+Math.sin(a)*ry];});
 svg.append(el('desc',{},chapter===0?'Change room colours to make every connected pair different.':'Question marks are hidden colours. Only opened endpoint colours are visible.'));
 data.edges.forEach(([a,b],i)=>{
  const bad=chapter===0&&localColours[a]===localColours[b];
  svg.append(el('line',{x1:pts[a][0],y1:pts[a][1],x2:pts[b][0],y2:pts[b][1],class:'edge'+(i===data.edge?' selected':'')+(bad?' bad':'')}));
 });
 pts.forEach(([x,y],i)=>{
  const c=data.visible[String(i)],shown=c!==undefined;
  const g=el('g',chapter===0?{class:'node-hit',role:'button','data-node':i,tabindex:0,'aria-label':`Room ${data.vertices[i]}, colour ${c+1}. Change colour.`}:{role:'img','aria-label':`Room ${data.vertices[i]}, ${shown?'colour '+(c+1):'hidden'}`});
  g.append(el('circle',{class:'node-face',cx:x,cy:y,r,fill:shown?`var(--color-${['one','two','three'][c]})`:'var(--color-paper-dark)',stroke:'var(--color-rule)','stroke-width':1}));
  const t=el('text',{x,y:y+7,'text-anchor':'middle',class:'node-value'},shown?String(c+1):'?');
  if(shown)t.style.fill=c===2?'var(--color-ink)':'var(--color-surface)';g.append(t);
  g.append(el('text',{x,y:y-r-12,'text-anchor':'middle',class:'node-letter'},data.vertices[i]));
  if(chapter===0){const change=()=>{localColours[i]=(localColours[i]+1)%3;draw();svg.querySelector(`[data-node="${i}"]`)?.focus({preventScroll:true});};g.addEventListener('click',change);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();change();}});}
  svg.append(g);
 });
 if(chapter===0){const bad=puzzleEdges.filter(([a,b])=>localColours[a]===localColours[b]).length;$('board-status').textContent=bad?`${bad} conflicting ${bad===1?'line':'lines'}`:'Valid colouring';$('board-label').textContent='THE PUBLIC PUZZLE';}
 else{$('board-label').textContent=state?.graph==='impossible'?'THE IMPOSSIBLE PUZZLE':'THE VERIFIER’S VIEW';$('board-status').textContent=state?`Round ${state.round} · ${{ready:'not sealed',sealed:'sealed',challenged:'challenged',opened:state.verdict?.accepted?'passed':'rejected'}[state.phase]}`:'Preparing…';}
}
function renderBoardExtra(){
 const box=$('board-extra');box.replaceChildren();if(!state||chapter===0)return;
 if(chapter===1&&state.commitments.length){const grid=document.createElement('div');grid.className='envelopes';state.commitments.forEach((hash,i)=>{const item=document.createElement('div');item.className='envelope';item.innerHTML=`<b>Room ${state.vertices[i]} · sealed</b><code>${hash.slice(0,12)}…</code>`;grid.append(item);});box.append(grid);}
 if(state.phase==='opened'&&(chapter===3||chapter===5)){
  const checks=document.createElement('div');checks.className='checks';
  checks.innerHTML=`<div class="check-row"><strong class="${state.verdict.commitments_valid?'yes':'no'}">${state.verdict.commitments_valid?'✓':'×'}</strong> Both openings match their seals</div><div class="check-row"><strong class="${state.verdict.different_colours?'yes':'no'}">${state.verdict.different_colours?'✓':'×'}</strong> ${state.verdict.different_colours?'The two colours are different':'The two colours are the same: reject'}</div>`;box.append(checks);
  const details=document.createElement('details');details.className='receipt';const summary=document.createElement('summary');summary.textContent='Inspect the actual openings';details.append(summary);
  const pre=document.createElement('pre');pre.textContent=state.openings.map(o=>`Room ${state.vertices[o.vertex]} · colour ${o.colour+1}\nSalt: ${o.salt}\nCommitment: ${state.commitments[o.vertex]}`).join('\n\n')+'\n\nColour labels 1–3 are encoded as 0–2 internally. Full SHA-256 digests are checked, not the shortened display.';details.append(pre);box.append(details);
 }
 if(chapter===4||chapter===5){
  if(state.history.length){const strip=document.createElement('div');strip.className='round-strip';strip.setAttribute('aria-label','Completed rounds');state.history.slice(-40).forEach(h=>{const tile=document.createElement('span');tile.className='round-tile'+(h.accepted?'':' failed');tile.textContent=h.accepted?'·':'×';tile.title=`Round ${h.round}: ${h.accepted?'passed':'rejected'}`;strip.append(tile);});box.append(strip);}
  if(chapter===5&&chosenLab==='reuse')$('board-caption').textContent=`${Object.keys(state.visible).length}/${state.vertices.length} vertices revealed in the same fixed colouring. Previous openings persist.`;
 }
}
function button(label,fn,primary=false){const b=document.createElement('button');b.className='button'+(primary?' primary':'');b.textContent=label;b.disabled=busy;b.addEventListener('click',()=>guard(fn));return b;}
function renderControls(){
 $('back').disabled=chapter===0||busy;$('continue').disabled=busy;$('continue').textContent=chapter===5?'Restart lesson ↺':'Next step →';
 const box=$('interaction');box.replaceChildren();let hint='';
 if(chapter===0){box.append(button('Show a solution',async()=>{localColours=base.slice();draw();message('Every connected pair now has different colours. In the next step, this answer becomes private.','success');}));hint='Try a colour, then continue.';}
 if(chapter===1){box.append(button(state?.phase==='ready'?'Seal all six answers':'Answers sealed',async()=>{await request('seal');message('Six commitments received. No colours have been disclosed.','success');},true));if(box.firstChild)box.firstChild.disabled=busy||state?.phase!=='ready';hint='Seal the answers to continue.';$('continue').disabled=busy||state?.phase!=='sealed';}
 if(chapter===2){
  const line=document.createElement('span');line.className='interaction-label';line.textContent='Challenge one line:';box.append(line);
  if(state){const edges=document.createElement('div');edges.className='edge-choices';state.edges.forEach(([a,b],i)=>{const btt=document.createElement('button');btt.className='edge-choice';btt.textContent=state.vertices[a]+'–'+state.vertices[b];btt.disabled=busy||state.phase!=='sealed';btt.setAttribute('aria-pressed',state.edge===i?'true':'false');btt.addEventListener('click',()=>guard(async()=>{await request('challenge',{edge:i});message('Challenge locked. Only these two endpoints may be opened.');}));edges.append(btt);});box.append(edges);const b=button('Choose randomly',async()=>{await request('challenge');message('The verifier chose a uniformly random edge.');},true);b.disabled=busy||state.phase!=='sealed';box.append(b);}
  hint='Choose one edge to continue.';$('continue').disabled=busy||state?.phase!=='challenged';
 }
 if(chapter===3){const b=button(state?.phase==='opened'?'Check complete':'Open & check',async()=>{await request('open');message('Both commitments match and the colours differ. This round passes.','success');},true);b.disabled=busy||state?.phase!=='challenged';box.append(b);hint='Open the two answers.';$('continue').disabled=busy||state?.phase!=='opened';}
 if(chapter===4){box.append(button('Run one fresh round',()=>runRounds(1),true),button('Run 20 rounds',()=>runRounds(20)));if(state){const r=state.history.filter(h=>h.random).length,m=state.edges.length,p=Math.pow(1-1/m,r);const meter=document.createElement('div');meter.className='probability';meter.innerHTML=`<div class="stat-line"><span><b>${r}</b> completed random rounds</span><span>False-claim upper bound: <b>${(p*100).toFixed(2)}%</b></span></div><div class="track" role="meter" aria-label="Theoretical false acceptance upper bound" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p*100}"><div class="fill" style="width:${p*100}%"></div></div><p>This bound concerns a non-three-colourable graph with ${m} edges, under binding commitments. It is not a confidence score for this honest prover.</p>`;box.append(meter);}hint='Try repeated checks, then experiment.';}
 if(chapter===5){
  const tabs=document.createElement('div');tabs.className='lab-tabs';for(const [id,config]of Object.entries(labs)){const b=document.createElement('button');b.className='lab-tab';b.textContent=config.name;b.disabled=busy;b.setAttribute('aria-pressed',chosenLab===id?'true':'false');b.addEventListener('click',()=>{chosenLab=id;go(5);});tabs.append(b);}box.append(tabs);
  const note=document.createElement('p');note.className='small-note';note.textContent=labs[chosenLab].note;box.append(note);
  if(state){
   const labels={ready:'Seal answers',sealed:'Random challenge',challenged:'Open & check',opened:'Next round'};
   const act={ready:'seal',sealed:'challenge',challenged:'open',opened:'next'};
   box.append(button(labels[state.phase],async()=>{await request(act[state.phase]);if(state.phase==='opened')message(state.verdict.accepted?(chosenLab==='reuse'?'This edge passes, but these colours now remain in your accumulated view.':'This edge passed. A bad colouring can pass a lucky check.'):'Caught: the committed endpoint colours are identical.',state.verdict.accepted?'success':'error');else message();},true));
   if(chosenLab==='reuse'&&state.phase==='sealed'){const edges=document.createElement('div');edges.className='edge-choices';[0,2,4].forEach(i=>{const [a,b]=state.edges[i];edges.append(button(state.vertices[a]+'–'+state.vertices[b],()=>request('challenge',{edge:i})));});box.append(edges);}
   if(chosenLab!=='reuse'){box.append(button('Run 20 random rounds',()=>runRounds(20)));const stats=document.createElement('p');stats.className='small-note';const r=state.history.length,rejected=state.history.filter(h=>!h.accepted).length;stats.textContent=`${r} independent single-round trials · ${rejected} rejections. A full proof run would stop at its first rejection.`;box.append(stats);}
  }
  hint='Compare the three experiments.';
 }
 $('step-hint').textContent=hint;
}
async function runRounds(count){
 message(`Running ${count} fresh random ${count===1?'round':'rounds'}…`);
 let rejected=0;
 for(let i=0;i<count;i++){
  if(state.phase==='opened')await request('next');
  if(state.phase==='ready')await request('seal');
  if(state.phase==='sealed')await request('challenge');
  if(state.phase==='challenged'){await request('open');if(!state.verdict.accepted)rejected++;}
 }
 message(`${count} new random ${count===1?'round':'rounds'} completed${rejected?`; ${rejected} rejected`:'. All passed'}.`,rejected?'error':'success');
}
$('chapter-picker').addEventListener('change',e=>go(Number(e.target.value)));
$('back').addEventListener('click',()=>go(Math.max(0,chapter-1)));
$('continue').addEventListener('click',async()=>{
 if(busy)return;
 
 if(chapter>=1&&chapter<=3){chapter++;message();render();$('lesson').scrollIntoView({block:'start',behavior:'instant'});}
 else await go(chapter===5?0:chapter+1);
});
const sources=`<h2>Sources & boundaries</h2><p>This is an educational implementation of the classical commitment-based graph three-colouring protocol, associated with Goldreich, Micali and Wigderson. The exhibition and experiments are our presentation of that established construction.</p><ul><li><a href="https://www.wisdom.weizmann.ac.il/~oded/PSX/zk-tut02v4.pdf" target="_blank" rel="noopener">Oded Goldreich, Zero-Knowledge Twenty Years After Its Invention</a>, Figure 2 and its discussion.</li><li><a href="https://www.wisdom.weizmann.ac.il/~oded/PSX/zk.pdf" target="_blank" rel="noopener">Goldreich, chapter on zero-knowledge proof systems</a>, graph three-colourability.</li><li><a href="https://doi.org/10.1109/SFCS.1986.47" target="_blank" rel="noopener">Goldreich, Micali & Wigderson (1986), Proofs that yield nothing but their validity</a>.</li></ul><p>The small puzzle and its teaching solution are intentionally known. The Python process keeps unopened values out of the API response, but the computer owner can inspect local code and memory. This is not a remote privacy service.</p><p>SHA-256 with random salts is a practical teaching commitment. Hiding needs an explicit assumption about the hash construction; collision resistance alone does not prove it. This implementation is not a formally verified cryptographic product.</p><p>Manual edge selection is exploratory. Probability statements require uniform random challenges. A tiny public graph can also be solved independently; zero knowledge does not make easy public puzzles hard.</p>`;
const math=`<h2>The three promises</h2><h3>Completeness · a valid answer passes</h3><p>If every edge has different endpoint colours and the openings match, an honest prover passes every challenge.</p><h3>Soundness · a false claim is hard to sustain</h3><p>On a graph that is not three-colourable, any three-colouring has a bad edge. With m edges and binding commitments, one random round accepts with probability at most 1 − 1/m. Sequential repetition gives at most (1 − 1/m)<sup>r</sup>, ignoring negligible commitment-breaking probability.</p><p>For a fixed strategy with b bad edges, its single-round rejection probability is b/m; its all-pass probability after r independent rounds is (1 − b/m)<sup>r</sup>. This is not a posterior probability of honesty.</p><h3>Zero knowledge · the view needs no secret solution</h3><p>A simulator can prepare a transcript without knowing a complete solution: first sample the honest verifier’s random edge, put a uniformly random pair of different colours at its endpoints, commit to arbitrary colours elsewhere, and reveal only the chosen pair. Under the commitment-hiding assumption, the unopened commitments conceal the difference.</p><p>This is an honest-verifier simulation explanation. The simulator can arrange a complete transcript; a live prover cannot choose a future verifier challenge. General malicious-verifier zero knowledge needs the full simulation argument, usually involving rewinding. The Python module includes the honest-verifier simulator.</p><h3>Why relabel colours?</h3><p>Each round uses a uniformly random permutation of all three labels and fresh salts. The revealed ordered pair is therefore uniformly distributed over the six pairs of distinct labels. Reusing one fixed committed colouring lets a verifier accumulate the full assignment.</p><h3>Commitment encoding</h3><pre>SHA-256(JSON(["zk-colouring-v1", vertex, colour, salt]))</pre><p>Colour is encoded as 0, 1, or 2. Salt is 32 bytes from Python’s operating-system-backed secrets module. The verifier checks exact vertex IDs, full digests, and both colours.</p>`;
function dialog(content){$('dialog-body').innerHTML=content;$('info-dialog').showModal();}
$('results-button').addEventListener('click',async()=>{try{const response=await fetch('/evidence/experiments.json');if(!response.ok)throw new Error('Run the experiment script first to generate results.');const evidence=await response.json();dialog(`<h2>What the measurements show</h2><p>The experiment runner performed ${evidence.trials_per_configuration.toLocaleString()} independent runs per configuration, across ${new Set(evidence.results.map(r=>r.scenario)).size} strategies and ${new Set(evidence.results.map(r=>r.rounds)).size} round limits. Each run stops at its first rejection.</p><figure class="result-figure"><img src="/evidence/acceptance.svg" width="760" height="420" alt="Measured acceptance rates with 95% Wilson intervals, compared with theoretical probabilities. Honest runs always pass; the bad-solution and false-claim strategies pass less often with more rounds."></figure><p>Dots are measured acceptance rates; vertical bars are 95% Wilson intervals. Lines connect exact probabilities for these specified strategies. Individual points can fall away from a line because the experiment is random.</p><p>The CSV includes runtime and compact-transcript byte counts. Timings include verification and JSON encoding; byte counts exclude HTTP overhead. These measurements are evidence about the implementation and the chosen strategies, not a proof of security against every adversary.</p><p><a href="/evidence/experiments.csv" download>Download the measured CSV</a> · <a href="/evidence/experiments.json" download>Environment & full results</a></p>`);}catch(error){dialog(`<h2>Measurements unavailable</h2><p>${htmlEscape(error.message)}</p>`);}});
$('notes-button').addEventListener('click',()=>dialog(math));
$('sources-button').addEventListener('click',()=>dialog(sources));
$('about-button').addEventListener('click',()=>dialog(`<h2>A small protocol, opened up.</h2><p>A two-person SE6003 Cryptography project: implement the graph-colouring protocol, explain every step to a beginner, and compare experimental results with theory.</p><p>The Python implementation powers this lesson. The separate experiment runner writes measured results, including timing and communication counts. See the project README for instructions.</p><p>The interface is a teaching aid; the final course report still needs its own 8–12-page LNCS treatment. </p>${sources}`));
$('close-dialog').addEventListener('click',()=>$('info-dialog').close());
$('info-dialog').addEventListener('click',event=>{if(event.target===$('info-dialog')){const r=$('info-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('info-dialog').close();}});
new ResizeObserver(()=>draw()).observe($('graph-wrap'));
render();
