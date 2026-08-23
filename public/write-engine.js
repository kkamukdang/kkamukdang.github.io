/* 한자 쓰기 엔진
 * 획순 데이터는 회차에 필요한 글자만 /kanji/{코드포인트}.json 에서 받아옵니다.
 * 단어 목록(WORDS)은 회차 YAML 에서 페이지가 넘겨줍니다.
 */
(function () {
const WORDS = window.WORDS || [];
const KANJI = {};   // 아래에서 채웁니다

const NS='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
const svg=$('svg'), gRest=$('rest'), gDone=$('done'), live=$('live'), ghost=$('ghost'),
      runner=$('runner'), gHint=$('hint'), pop=$('pop'), sheet=$('sheet'), msg=$('msg'),
      strip=$('strip'), rings=[$('flash'),$('flash2')];

const TOL=13, START_TOL=16, LOOK=60;


let gen=0;
let wi=0, stage=0, pos=-1, idx=0, combo=0, miss=0, playing=false, busy=false;
let word, chars=[], strokes=[], samples=[], len=0, prog=0, drawing=false, assist=2;

const el=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e;};
const isKanji=c=>!!KANJI[c];

/* ---------- 발음 ---------- */
function speak(text){
  if(!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='ja-JP'; u.rate=.85;
  const v=speechSynthesis.getVoices().find(v=>v.lang&&v.lang.startsWith('ja'));
  if(v) u.voice=v;
  speechSynthesis.speak(u);
}

/* ---------- 화면 ---------- */
// 요소가 없으면 조용히 건너뜁니다. HTML 에서 일부를 지워도 나머지가 멈추지 않아요.
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };

function paintNav(){
  setText('navWord', word.w);
  setText('navKana', word.kana);
  setText('navCnt', (wi+1)+' / '+WORDS.length);
  document.querySelectorAll('.stg').forEach(s=>s.classList.toggle('on',+s.dataset.s===stage));
}

function paintStrip(){
  strip.innerHTML='';
  chars.forEach((c,i)=>{
    const d=document.createElement('div');
    if(!isKanji(c.t)){ d.className='cell kana'; d.textContent=c.t; }
    else{
      d.className='cell';
      d.textContent=c.t;   // 무엇을 쓸지는 항상 보여주고, 난이도는 밑그림 유무로 조절
      if(c.ok) d.classList.add('done');
      if(i===pos&&stage>0) d.classList.add('now');
      d.onclick=()=>{ if(stage===0) startStage(1); pickChar(i); };
    }
    strip.appendChild(d);
  });
}

function showRead(on){
  $('read').classList.toggle('hidden',!on);
  $('readBtns').classList.toggle('hidden',!on);
  sheet.classList.toggle('hidden',on);
  $('writeBtns').classList.toggle('hidden',on);
}

/* ---------- 단어 · 단계 ---------- */
function loadWord(i, silent){
  gen++; clearPop(); clearTimeout(idleT);
  wi=(i+WORDS.length)%WORDS.length;
  word=WORDS[wi];
  chars=[...word.w].map(t=>({t,ok:false}));
  pos=-1; combo=0; busy=false;
  $('rWord').textContent=word.w; $('rKana').textContent=word.kana;
  $('rKo').textContent=word.ko; $('rEx').textContent=word.ex; $('rExKo').textContent=word.exko;
  if(stage===0){ showRead(true); msg.textContent=''; }
  paintNav(); paintStrip();
  // 페이지에 들어오자마자 소리가 나면 곤란하니, 첫 로딩은 조용히 띄웁니다.
  // 발음은 🔊 버튼을 누를 때만 재생돼요.
  if(stage>0) startStage(stage);
  else if(!silent) setTimeout(()=>speak(word.w),300);
}

function startStage(s){
  gen++; clearPop(); clearTimeout(idleT); playing=false;
  stage=s; paintNav();
  if(s===0){ showRead(true); msg.textContent=''; paintStrip(); speak(word.w); return; }
  assist = s===1?2:0;
  chars.forEach(c=>c.ok=false);
  showRead(false);
  pickChar(chars.findIndex(c=>isKanji(c.t)));
}

function pickChar(i){
  if(i<0||!isKanji(chars[i].t)) return;
  gen++; clearPop(); clearTimeout(idleT); playing=false; busy=false; pos=i; idx=0; miss=0; chars[i].ok=false;
  strokes=KANJI[chars[i].t];
  gRest.innerHTML=''; gDone.innerHTML='';
  strokes.forEach(d=>gRest.appendChild(el('path',{d,class:'stroke rest'})));
  gRest.style.display = assist===0?'none':'';
  paintStrip();
  msg.className='';
  msg.textContent = assist===2 ? '파란 선이 그어지는 방향 그대로 따라 그으세요'
                               : '「'+chars[i].t+'」의 첫 획을 화면에 그어보세요';
  nextStroke();
}

// 한 글자를 다 쓰면 축하 → 아직 안 쓴 글자로 이동
function charDone(){
  busy=true;
  chars[pos].ok=true; paintStrip();
  live.setAttribute('d',''); ghost.setAttribute('d',''); gHint.innerHTML=''; hideRunner();
  const left=chars.findIndex(c=>isKanji(c.t)&&!c.ok);
  // 글자를 다 쓰면 획 위에 글씨를 겹쳐 띄우는 대신, 아래 안내문과 파티클로만 알립니다.
  celebrate();
  msg.className='ok';
  msg.textContent = left<0 ? '단어 완성!' : '한 글자 완성';
  const g=gen;
  setTimeout(()=>{
    if(g!==gen) return;
    if(left>=0){ pickChar(left); return; }
    busy=true;
    if(stage===1){
      // 따라쓰기는 여기서 멈춥니다 — 다음 단계는 직접 고르세요
      msg.className='ok';
      msg.textContent='단어를 다 썼어요. 「혼자 쓰기」로 넘어가 보세요';
    } else {
      msg.textContent='다음 단어로 넘어갑니다';
      setTimeout(()=>{ if(g!==gen) return; stage=0; loadWord(wi+1); }, 900);
    }
  }, 2400);
}

/* ---------- 획 엔진 ---------- */
function sample(d){
  const p=el('path',{d}); svg.appendChild(p);
  len=p.getTotalLength();
  const n=Math.max(12,Math.ceil(len));
  samples=Array.from({length:n+1},(_,i)=>{const q=p.getPointAtLength(len*i/n);return{x:q.x,y:q.y};});
  p.remove();
}

let idleT=0;
function armIdle(){
  clearTimeout(idleT);
  if(assist!==0||playing) return;
  // 6초 동안 아무 입력이 없으면 시작점만 살짝 알려줍니다
  idleT=setTimeout(()=>{
    if(!drawing&&!busy&&!playing&&idx<strokes.length&&!gHint.childElementCount){
      drawHint(); msg.textContent='여기서 시작해요'; msg.className='';
    }
  },6000);
}

function nextStroke(){
  gHint.innerHTML='';
  if(idx>=strokes.length){ charDone(); return; }
  sample(strokes[idx]); prog=0;
  live.setAttribute('d',strokes[idx]);
  live.style.strokeDasharray=len; live.style.strokeDashoffset=len;
  if(assist===2){ ghost.setAttribute('d',strokes[idx]); showRunner(); drawHint(); }
  else { ghost.setAttribute('d',''); hideRunner(); }
  if(gRest.children[idx]) gRest.children[idx].style.display='none';
  armIdle();
}

function showRunner(){
  runner.setAttribute('d',strokes[idx]);
  runner.style.setProperty('--len',len);
  runner.style.strokeDasharray=len; runner.style.display='';
  runner.style.animation='none'; void runner.getBoundingClientRect(); runner.style.animation='';
}
const hideRunner=()=>{runner.style.display='none';};

function drawHint(){
  const a=samples[0], b=samples[Math.min(10,samples.length-1)];
  const ang=Math.atan2(b.y-a.y,b.x-a.x), L=13;
  const tx=a.x+Math.cos(ang)*L, ty=a.y+Math.sin(ang)*L;
  gHint.appendChild(el('path',{class:'hint',d:`M${a.x},${a.y}L${tx},${ty}`}));
  gHint.appendChild(el('path',{fill:'var(--guide)',d:
    `M${tx},${ty}L${tx-Math.cos(ang-.5)*4.5},${ty-Math.sin(ang-.5)*4.5}L${tx-Math.cos(ang+.5)*4.5},${ty-Math.sin(ang+.5)*4.5}Z`}));
  gHint.appendChild(el('circle',{cx:a.x,cy:a.y,r:3.4,fill:'var(--guide)'}));
  gHint.appendChild(el('circle',{class:'pulse',cx:a.x,cy:a.y,r:3.4,fill:'none',stroke:'var(--guide)','stroke-width':1}));
}

// 확인 단계에서 두 번 막히면 그 획만 잠깐 도와줍니다
function rescue(){
  clearTimeout(idleT);
  if(gRest.style.display==='none'){          // 1단계: 회색 밑그림을 되살립니다
    gRest.style.display='';
    [...gRest.children].forEach((p,i)=>p.style.display=i<idx?'none':'');
    msg.textContent='밑그림을 보여줄게요'; msg.className='';
    ghost.setAttribute('d',strokes[idx]);
    drawHint(); miss=0; return;
  }
  ghost.setAttribute('d',strokes[idx]); showRunner(); drawHint();   // 2단계: 이 획을 직접
  msg.textContent='이 획이에요'; miss=0;
}

const pt=e=>{const r=svg.getBoundingClientRect(),s=109/r.width;return{x:(e.clientX-r.left)*s,y:(e.clientY-r.top)*s};};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

svg.addEventListener('pointerdown',e=>{
  if(playing||busy||idx>=strokes.length) return;
  const p=pt(e);
  if(dist(p,samples[0])>START_TOL){
    sheet.classList.remove('shake'); void sheet.offsetWidth; sheet.classList.add('shake');
    msg.textContent='시작 위치가 달라요'; msg.className=''; combo=0;
    if(++miss>=2&&assist===0) rescue(); else armIdle();
    return;
  }
  drawing=true; clearTimeout(idleT); svg.setPointerCapture(e.pointerId); gHint.innerHTML=''; hideRunner();
});

svg.addEventListener('pointermove',e=>{
  if(!drawing) return;
  const p=pt(e); let best=prog,bd=Infinity;
  for(let i=prog;i<Math.min(samples.length,prog+LOOK);i++){
    const d=dist(p,samples[i]); if(d<bd){bd=d;best=i;}
  }
  if(bd>TOL) return;
  prog=Math.max(prog,best);
  live.style.strokeDashoffset=len*(1-prog/(samples.length-1));
  if(prog>=samples.length-3) finishStroke();
});

function stop(){
  if(!drawing) return; drawing=false;
  if(idx<strokes.length&&prog<samples.length-3){
    prog=0; live.style.strokeDashoffset=len; combo=0;
    msg.textContent='끝까지 이어서 그어보세요';
    if(assist===2){ showRunner(); drawHint(); }
    else if(++miss>=2) rescue(); else armIdle();
  }
}
svg.addEventListener('pointerup',stop);
svg.addEventListener('pointercancel',stop);

function finishStroke(){
  drawing=false; miss=0; combo++;
  live.style.strokeDashoffset=0;
  gDone.appendChild(el('path',{d:strokes[idx],class:'stroke done'}));
  live.setAttribute('d',''); ghost.setAttribute('d',''); gHint.innerHTML=''; hideRunner();
  idx++;
  if(idx<strokes.length){
    // 획을 하나 끝낼 때마다 띄우던 칭찬·콤보 문구는 글자와 겹쳐 읽기 어려워서 뺐습니다.
    msg.textContent=''; msg.className='ok';
  }
  const g=gen; setTimeout(()=>{ if(g===gen) nextStroke(); },420);
}

/* ---------- 연출 ---------- */
// 칭찬 문구(cheer)는 제거했습니다. clearPop 은 다른 곳에서 호출되므로 남겨둡니다.
function clearPop(){ if(pop) pop.classList.remove('go','long'); }

const fx=$('fx'), fxc=fx.getContext('2d'), CONFETTI='#1d232c';
let parts=[], raf=0;
const slowMo=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
function sizeFx(){const r=fx.getBoundingClientRect(),d=devicePixelRatio||1;fx.width=r.width*d;fx.height=r.height*d;fxc.setTransform(d,0,0,d,0,0);}
addEventListener('resize',sizeFx);
function burst(cx,cy,n,power){
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2+Math.random()*.3, v=power*(.6+Math.random()*.5);
    parts.push({x:cx,y:cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-power*.2,len:6+Math.random()*5,life:1});
  }
  if(!raf) raf=requestAnimationFrame(tick);
}
function tick(){
  const r=fx.getBoundingClientRect();
  fxc.clearRect(0,0,r.width,r.height);
  parts=parts.filter(p=>p.life>0);
  fxc.strokeStyle=CONFETTI; fxc.lineWidth=1.6; fxc.lineCap='round';
  for(const p of parts){
    p.vy+=.1; p.vx*=.965; p.vy*=.965; p.x+=p.vx; p.y+=p.vy; p.life-=.016;
    const s=Math.hypot(p.vx,p.vy),k=Math.min(1,s/6);
    fxc.globalAlpha=Math.max(0,p.life*.75);
    fxc.beginPath(); fxc.moveTo(p.x,p.y);
    fxc.lineTo(p.x-p.vx/s*p.len*k,p.y-p.vy/s*p.len*k); fxc.stroke();
  }
  raf=parts.length?requestAnimationFrame(tick):(fxc.clearRect(0,0,r.width,r.height),0);
}
function celebrate(){
  sizeFx(); const r=fx.getBoundingClientRect();
  rings.forEach(x=>{x.classList.remove('go'); void x.offsetWidth; x.classList.add('go');});
  burst(r.width*.5,r.height*.45, slowMo?12:22, slowMo?3:6.5);
}

/* ---------- 전체 획순 재생 ---------- */
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function playStroke(i){
  return new Promise(res=>{
    const p=el('path',{d:strokes[i],class:'stroke done'}); gDone.appendChild(p);
    const L=p.getTotalLength(), dur=Math.max(320,Math.min(900,L*9));
    p.style.strokeDasharray=L; p.style.strokeDashoffset=L;
    requestAnimationFrame(()=>{p.style.transition=`stroke-dashoffset ${dur}ms linear`;p.style.strokeDashoffset=0;});
    setTimeout(res,dur+170);
  });
}
async function playAll(){
  if(playing) return;
  // 재생을 시작하면 완성 직후 예약돼 있던 동작(다음 글자·다음 단어 이동)은 취소합니다
  gen++; busy=false; clearPop(); clearTimeout(idleT);
  const g=gen;
  playing=true; clearTimeout(idleT); hideRunner(); gHint.innerHTML='';
  live.setAttribute('d',''); ghost.setAttribute('d',''); gDone.innerHTML='';
  gRest.style.display=''; [...gRest.children].forEach(p=>p.style.display='');
  msg.textContent='전체 획순을 보여주는 중'; msg.className='';
  for(let i=0;i<strokes.length;i++){ if(g!==gen){playing=false;return;} await playStroke(i); }
  await wait(700);
  if(g!==gen){ playing=false; return; }
  playing=false; gHint.innerHTML=''; hideRunner();
  // 재생이 끝나면 첫 획부터 다시 쓰도록 화면을 비웁니다
  gDone.innerHTML='';
  [...gRest.children].forEach(p=>p.style.display='');
  gRest.style.display = assist===0?'none':'';
  idx=0; prog=0; miss=0; combo=0; nextStroke();
  msg.className='';
  msg.textContent = assist===2 ? '파란 선이 그어지는 방향 그대로 따라 그으세요'
                               : '「'+chars[pos].t+'」의 첫 획을 화면에 그어보세요';
}

/* ---------- 조작 ---------- */
// 요소가 없으면 조용히 건너뜁니다. HTML 에서 버튼을 지워도 나머지가 멈추지 않아요.
const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

on('rSpk',   () => speak(word.w));
on('navSpk', () => speak(word.w));
on('rExSpk', () => speak(word.ex));
on('rGo',    () => startStage(1));
on('demo',   playAll);
on('reset',  () => {
  clearPop();
  pickChar(pos >= 0 ? pos : chars.findIndex(c => isKanji(c.t)));
});
on('prev',   () => loadWord(wi - 1));
on('next',   () => loadWord(wi + 1));

document.querySelectorAll('.stg').forEach(s => s.onclick = () => startStage(+s.dataset.s));


/* ---------- 획순 데이터 받아오기 ---------- */
async function boot(){
  const files = window.KANJI_FILES || {};
  const base  = window.KANJI_BASE || '/kanji/';
  msg.textContent = '획순 데이터를 불러오는 중…';
  const entries = Object.entries(files);
  const results = await Promise.all(entries.map(async ([ch, name]) => {
    try {
      const res = await fetch(base + name + '.json');
      if (!res.ok) throw new Error(res.status);
      return [ch, await res.json()];
    } catch (e) {
      console.warn('획순 데이터 없음:', ch, '— scripts/add-kanji.mjs 로 추가하세요');
      return [ch, null];
    }
  }));
  results.forEach(([ch, data]) => { if (data) KANJI[ch] = data; });

  if (!WORDS.length) { msg.textContent = '연습할 단어가 없어요'; return; }
  msg.textContent = '';
  if (window.speechSynthesis) speechSynthesis.getVoices();
  loadWord(0, true);   // 첫 화면은 자동 재생하지 않습니다
}
boot();
})();
