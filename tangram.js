// ① ファイルの先頭に追加
document.addEventListener('DOMContentLoaded', () => {
  // ← ここから下は 既存の tangram.js 本文

// Tangram A (HTML5 Canvas, Mobile Friendly, Spreadsheet Logging)
// ===== 設定（必ず自分の値に変更） =====
const ENDPOINT_URL = 'PUT_APPS_SCRIPT_WEB_APP_URL_HERE'; // 例: https://script.google.com/macros/s/XXXX/exec
const POST_TOKEN   = 'PUT_RANDOM_TOKEN_HERE';            // GAS側のTOKENと一致させる
const APP_VERSION  = 'tangramA-html5-1.0.0';

// ===== 画面論理解像度（HiDPI対応でスケール） =====
const WORLD_W = 1500;
const WORLD_H = 900;
const SNAP_DISTANCE = 25; // px

// 7タングラムピース（Python版を踏襲）
const TANGRAM_PIECES = [
  [ [0,0], [300,0], [150,150] ],
  [ [0,0], [0,300], [150,150] ],
  [ [0,0], [150,150], [0,150] ],
  [ [0,0], [150,0], [75,75] ],
  [ [150,0], [150,150], [75,75] ],
  [ [0,150], [75,225], [150,150], [75,75] ],
  [ [0,0], [150,0], [225,75], [75,75] ],
];
const COLORS = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#9B59B6", "#F39C12", "#1ABC9C"];

const PUZZLES = [
  {
    title: "アヒル",
    target: [
      [482, 394],[588, 288],[800, 288],[800, 182],
      [906, 182],[1012, 182],[906, 288],[906, 394],
      [800, 500],[588, 500]
    ],
  },
  {
    title: "凹み",
    target: [
      [482, 182],[588, 182],[588, 394],[800, 394],
      [800, 182],[906, 182],[906, 500],[482, 500]
    ],
  },
  {
    title: "家",
    target: [
      [694,76],[906,288],[800,288],
      [800,500],[588,500],[588,288],[482,288]
    ],
  },
  {
    title: "コマ",
    target: [
      [482,394],[588,288],[641,288],[641,182],
      [747,182],[747,288],[800,288],[906,394],[694,606]
    ],
  },
  {
    title: "サカナ",
    target: [
      [332,356],[544,356],[619,281],[469,281],[544,206],
      [694,206],[844,356],[694,506],[694,612],
      [588,612],[694,506],[619,431],[544,506],[394,506],[438,462]
    ],
  },
];

// ===== ユーティリティ =====
const $ = sel => document.querySelector(sel);
const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const degToRad = d => (d*Math.PI)/180;
function centroid(points){ let sx=0, sy=0; for(const [x,y] of points){ sx+=x; sy+=y; } return [sx/points.length, sy/points.length]; }
function transform(points, offset, angle, flipped){
  const [cx,cy]=centroid(points); const a=degToRad(angle); const cos=Math.cos(a), sin=Math.sin(a);
  return points.map(([x,y])=>{ let dx=x-cx, dy=y-cy; if(flipped) dx=-dx; const xr=dx*cos-dy*sin; const yr=dx*sin+dy*cos; return [xr+cx+offset[0], yr+cy+offset[1]]; });
}
function distanceSq(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; }

function drawPolygon(ctx, pts, fillStyle=null, strokeStyle="#222", lineWidth=2){
  if(pts.length===0) return;
  ctx.beginPath();
  for(let i=0;i<pts.length;i++){ const [x,y]=pts[i]; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.closePath();
  if(fillStyle){ ctx.fillStyle=fillStyle; ctx.fill(); }
  if(strokeStyle && lineWidth){ ctx.strokeStyle=strokeStyle; ctx.lineWidth=lineWidth; ctx.stroke(); }
}

function alphaCount(ctx, w, h){ const data=ctx.getImageData(0,0,w,h).data; let cnt=0; for(let i=3;i<data.length;i+=4){ if(data[i]!==0) cnt++; } return cnt; }

// ===== ゲームステート =====
const state = {
  pieces: [],
  selectedId: null,
  puzzleIndex: 0,
  step: 'home', // 'home' | 'play' | 'intermission' | 'finished'
  results: [], // seconds per puzzle
  elapsed: 0,
  timerId: null,
};

// 初期ピース配置
function resetPieces(){
  state.pieces = TANGRAM_PIECES.map((shape,i)=>({
    id:i,
    shape: shape.map(([x,y])=>[x,y]),
    color: COLORS[i%COLORS.length],
    offset: [80 + i*200, 680],
    angle: 0,
    flipped: false,
  }));
  state.selectedId = null;
}

// ===== Canvas & Offscreen =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const offTarget = document.createElement('canvas'); offTarget.width=WORLD_W; offTarget.height=WORLD_H; const ctxT = offTarget.getContext('2d');
const offUnion  = document.createElement('canvas'); offUnion.width=WORLD_W; offUnion.height=WORLD_H; const ctxU = offUnion.getContext('2d');
const tmp       = document.createElement('canvas'); tmp.width=WORLD_W; tmp.height=WORLD_H; const ctxX = tmp.getContext('2d');

function resizeCanvas(){
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = WORLD_W * dpr; canvas.height = WORLD_H * dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ===== 描画 =====
function render(){
  ctx.clearRect(0,0,WORLD_W, WORLD_H);

  // ターゲット
  const target = PUZZLES[state.puzzleIndex].target;
  ctx.save();
  drawPolygon(ctx, target, '#2b2b2b', '#444', 2);
  ctx.restore();

  // ピース
  const ts = state.pieces.map(p=> ({...p, world: transform(p.shape, p.offset, p.angle, p.flipped)}));
  ts.forEach(p=>{
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    drawPolygon(ctx, p.world, p.color, '#1a1a1a', 2);
    ctx.restore();
  });

  // 選択枠
  if(state.selectedId!=null){
    const p = ts.find(pp=>pp.id===state.selectedId);
    if(p){ ctx.save(); ctx.setLineDash([6,4]); drawPolygon(ctx, p.world, null, '#e5e7eb', 2); ctx.restore(); }
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ===== ヒットテスト =====
function hitTest(x,y){
  for(let i=state.pieces.length-1;i>=0;i--){
    const p = state.pieces[i];
    const world = transform(p.shape, p.offset, p.angle, p.flipped);
    ctx.beginPath(); for(let j=0;j<world.length;j++){ const [px,py]=world[j]; if(j===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);} ctx.closePath();
    if(ctx.isPointInPath(x,y)) return p.id;
  }
  return null;
}

// ===== ポインタ（マウス/タッチ統合） =====
const drag = { active:false, id:null, last:[0,0] };

canvas.addEventListener('pointerdown', (e)=>{
  if(state.step!=='play') return;
  canvas.setPointerCapture(e.pointerId);
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (WORLD_W / rect.width);
  const y = (e.clientY - rect.top)  * (WORLD_H / rect.height);
  const id = hitTest(x,y);
  if(id!=null){
    drag.active=true; drag.id=id; drag.last=[x,y]; state.selectedId=id;
    // 最前面へ
    const idx = state.pieces.findIndex(p=>p.id===id); const [picked]=state.pieces.splice(idx,1); state.pieces.push(picked);
  }
});

canvas.addEventListener('pointermove', (e)=>{
  if(!drag.active) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (WORLD_W / rect.width);
  const y = (e.clientY - rect.top)  * (WORLD_H / rect.height);
  const dx = x - drag.last[0]; const dy = y - drag.last[1];
  drag.last=[x,y];
  const id = drag.id;
  state.pieces = state.pieces.map(p=> p.id===id ? {...p, offset:[p.offset[0]+dx, p.offset[1]+dy]} : p);
});

canvas.addEventListener('pointerup', ()=>{
  if(!drag.active) return; const id=drag.id; drag.active=false; drag.id=null; drag.last=[0,0];
  // スナップ
  const me = state.pieces.find(p=>p.id===id);
  const myPts = transform(me.shape, me.offset, me.angle, me.flipped);
  const targetPts = PUZZLES[state.puzzleIndex].target;
  const others = state.pieces.filter(p=>p.id!==id).flatMap(p=> transform(p.shape, p.offset, p.angle, p.flipped));
  const snaps = [...targetPts, ...others];
  let best=null; let bestD2 = SNAP_DISTANCE*SNAP_DISTANCE;
  for(const mp of myPts){ for(const tp of snaps){ const d2=distanceSq(mp,tp); if(d2<bestD2){ bestD2=d2; best=[tp[0]-mp[0], tp[1]-mp[1]]; } } }
  if(best){ me.offset=[me.offset[0]+best[0], me.offset[1]+best[1]]; }
});

// キーボード（デスクトップ）
window.addEventListener('keydown', (e)=>{
  if(state.step!=='play') return;
  if(state.selectedId==null) return;
  if(e.key==='r' || e.key==='R') rotateSelected();
  if(e.key==='f' || e.key==='F') flipSelected();
});

function rotateSelected(){ if(state.selectedId==null) return; state.pieces = state.pieces.map(p=> p.id===state.selectedId ? {...p, angle:(p.angle+45)%360} : p); }
function flipSelected(){ if(state.selectedId==null) return; state.pieces = state.pieces.map(p=> p.id===state.selectedId ? {...p, flipped:!p.flipped} : p); }

// ===== 判定（ピクセル） =====
function judge(){
  ctxT.clearRect(0,0,WORLD_W,WORLD_H); ctxU.clearRect(0,0,WORLD_W,WORLD_H); ctxX.clearRect(0,0,WORLD_W,WORLD_H);
  // A) target
  ctxT.fillStyle = '#000'; drawPolygon(ctxT, PUZZLES[state.puzzleIndex].target, '#000', null, 0);
  // B) union
  const ts = state.pieces.map(p=> transform(p.shape, p.offset, p.angle, p.flipped));
  ctxU.fillStyle = '#000'; ts.forEach(poly => drawPolygon(ctxU, poly, '#000', null, 0));
  // C) outside = U - T
  ctxX.clearRect(0,0,WORLD_W,WORLD_H); ctxX.drawImage(offUnion,0,0); ctxX.globalCompositeOperation = 'destination-out'; ctxX.drawImage(offTarget,0,0); ctxX.globalCompositeOperation='source-over';
  const outside = alphaCount(ctxX, WORLD_W, WORLD_H);
  // D) gaps = T - U
  ctxX.clearRect(0,0,WORLD_W,WORLD_H); ctxX.drawImage(offTarget,0,0); ctxX.globalCompositeOperation = 'destination-out'; ctxX.drawImage(offUnion,0,0); ctxX.globalCompositeOperation='source-over';
  const gaps = alphaCount(ctxX, WORLD_W, WORLD_H);
  // E) overlaps = sum(piece)-union
  const unionArea = alphaCount(ctxU, WORLD_W, WORLD_H);
  let sum = 0; for(const poly of ts){ ctxX.clearRect(0,0,WORLD_W,WORLD_H); drawPolygon(ctxX, poly, '#000', null, 0); sum += alphaCount(ctxX, WORLD_W, WORLD_H); }
  const overlap = Math.max(0, sum - unionArea);

  const AREA_TOL = 1200; const OUT_TOL = 300;
  if(outside>OUT_TOL) return { ok:false, reason:'枠外にはみ出しています' };
  if(overlap>AREA_TOL) return { ok:false, reason:'ピースが重なっています' };
  if(gaps>AREA_TOL) return { ok:false, reason:'隙間があります' };
  return { ok:true };
}

// ===== タイマー =====
let startAt = 0;
function startTimer(){ stopTimer(); startAt = Date.now(); state.timerId = setInterval(()=>{ state.elapsed = Math.floor((Date.now()-startAt)/1000); updateTimer(); }, 500); }
function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }
function resetTimer(){ stopTimer(); state.elapsed=0; updateTimer(); }
function updateTimer(){ document.getElementById('timer').textContent = fmtTime(state.elapsed); }

// ===== UI =====
const playerInput = document.getElementById('player');
const startBtn = document.getElementById('start');
const rotateBtn = document.getElementById('rotate');
const flipBtn = document.getElementById('flip');
const resetBtn = document.getElementById('reset');
const judgeBtn = document.getElementById('judge');
const saveCsvBtn = document.getElementById('saveCsv');
const sendBtn = document.getElementById('send');
const puzzleTitle = document.getElementById('puzzleTitle');
const puzzleSelect = document.getElementById('puzzleSelect');

PUZZLES.forEach((p, i)=>{
  const opt=document.createElement('option'); opt.value=i; opt.textContent=`${i+1}. ${p.title}`; puzzleSelect.appendChild(opt);
});

puzzleSelect.addEventListener('change', ()=>{
  state.puzzleIndex = Number(puzzleSelect.value);
  puzzleTitle.textContent = PUZZLES[state.puzzleIndex].title;
  resetPieces(); resetTimer();
});

function startSeries(){
  const name = playerInput.value.trim(); if(!name){ alert('名前を入力してください'); return; }
  state.step='play'; state.results=[]; state.puzzleIndex = Number(puzzleSelect.value); puzzleTitle.textContent = PUZZLES[state.puzzleIndex].title; resetPieces(); resetTimer(); startTimer();
}

function onJudge(){
  const result = judge();
  if(!result.ok){ alert('不正解：'+result.reason); return; }
  // clear!
  stopTimer(); state.results.push(state.elapsed);
  if(state.puzzleIndex < PUZZLES.length-1){
    alert(`CLEAR!\n課題: ${PUZZLES[state.puzzleIndex].title}\nタイム: ${state.elapsed}秒`);
    state.puzzleIndex++; puzzleSelect.value=String(state.puzzleIndex); puzzleTitle.textContent=PUZZLES[state.puzzleIndex].title; resetPieces(); resetTimer(); startTimer();
  } else {
    alert(`5問クリア！合計: ${state.results.reduce((a,b)=>a+b,0)} 秒`);
    state.step='finished';
  }
}

async function sendResults(){
  if(state.results.length===0){ alert('まずは問題をクリアしてください。'); return; }
  const payload = {
    token: POST_TOKEN,
    playerName: playerInput.value.trim(),
    puzzleTimes: state.results.slice(),
    totalSec: state.results.reduce((a,b)=>a+b,0),
    userAgent: navigator.userAgent,
    appVersion: APP_VERSION,
    origin: location.origin,
  };
  try{
    const res = await fetch(ENDPOINT_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const json = await res.json();
    if(json.ok) alert('サーバー保存に成功しました！'); else alert('サーバー保存に失敗：'+json.error);
  }catch(err){ alert('通信エラー：'+String(err)); }
}

function exportCSV(){
  const headers = ["名前", ...PUZZLES.map(p=>`${p.title}（秒）`), "合計（秒）"];
  const total = state.results.reduce((a,b)=>a+b,0);
  const row = [playerInput.value.trim(), ...state.results, total];
  const csv = [headers.join(','), row.join(',')].join('\n');
  const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=shift_jis' });
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='result.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Buttons
startBtn.addEventListener('click', startSeries);
rotateBtn.addEventListener('click', rotateSelected);
flipBtn.addEventListener('click', flipSelected);
resetBtn.addEventListener('click', ()=>{ resetPieces(); });
judgeBtn.addEventListener('click', onJudge);
saveCsvBtn.addEventListener('click', exportCSV);
sendBtn.addEventListener('click', sendResults);

// Init
resetPieces();
puzzleTitle.textContent = PUZZLES[state.puzzleIndex].title;
updateTimer();

                          // ② ファイルの末尾に追加
}); // ← ここで DOMContentLoaded を閉じる
