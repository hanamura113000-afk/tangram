/* ======================================================
 *  tangram.js  —— 練習機能なし（A/Bのみ）
 *  依存する要素ID:
 *   playerName, modeA, modeB, btnStart, btnJudge,
 *   nowLabel, timer, stage, btnRotate, btnFlip
 * =====================================================*/

/* ====== スプレッドシート送信設定 ====== */
const SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzC5tLGJlqn6U51wXDhrqppkRX-n2s4FkI6RDwFxvKe3yAM5xgFTfDjksYGE2Zl9KU/exec';     // 例: https://script.google.com/macros/s/XXXXX/exec
const SHEETS_TOKEN    = 'REPLACE_WITH_YOUR_TOKEN';

/* ====== 画面要素 ====== */
const $name   = document.getElementById('playerName');
const $modeA  = document.getElementById('modeA');
const $modeB  = document.getElementById('modeB');
const $start  = document.getElementById('btnStart');
const $judge  = document.getElementById('btnJudge');
const $now    = document.getElementById('nowLabel');
const $timer  = document.getElementById('timer');
const $btnR   = document.getElementById('btnRotate');
const $btnF   = document.getElementById('btnFlip');

const canvas  = document.getElementById('stage');
const ctx     = canvas.getContext('2d', { willReadFrequently:true });

/* ====== レイアウト ====== */
function resizeCanvas(){
  const W = canvas.clientWidth || window.innerWidth - 24;
  const H = Math.max(520, Math.round(window.innerHeight * 0.7));
  canvas.width  = W;
  canvas.height = H;
  if (state.running) drawAll();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ====== ゲーム状態 ====== */
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#9b59b6','#f39c12','#14b8a6'];

const state = {
  running:false,
  pattern:'A',            // A | B
  blockIndex:1,           // 1:通常 2:プライム
  isPrime:false,
  trial:0,                // 1..5
  startAt:0,
  raf:0,
  currentTitle:'—',
  targetPoly:null,
  flashMs:600,            // プライムの表示時間
};

let pieces = [];          // 画面上のピース
let selected = null;
let drag = null;

/* ====== パズル定義（ターゲット輪郭） ======
 * 画面中央に収まるよう 0..400 程度の座標を後でスケールします
 */
const TARGETS = {
  'アヒル':  [{x:0,y:160},{x:160,y:160},{x:160,y:80},{x:220,y:80},{x:280,y:20},{x:340,y:80},{x:220,y:80},{x:220,y:160},{x:340,y:160},{x:340,y:260},{x:0,y:260}],
  '凹み':    [{x:0,y:0},{x:320,y:0},{x:320,y:240},{x:200,y:240},{x:200,y:120},{x:120,y:120},{x:120,y:240},{x:0,y:240}],
  '家':      [{x:0,y:200},{x:0,y:360},{x:320,y:360},{x:320,y:200},{x:200,y:80},{x:120,y:80}],
  'コマ':    [{x:0,y:160},{x:120,y:40},{x:240,y:160},{x:120,y:280}],
  'サカナ':  [{x:0,y:160},{x:140,y:80},{x:280,y:160},{x:140,y:240}],
};

/* 7ピース（相対座標）。描画時に移動/回転/反転します */
const PIECE_SHAPES = [
  [[0,0],[150,0],[75,75]],       // 大三角1
  [[0,0],[0,150],[75,75]],       // 大三角2
  [[0,0],[75,75],[0,75]],        // 中三角
  [[0,0],[75,0],[37.5,37.5]],    // 小三角1
  [[75,0],[75,75],[37.5,37.5]],  // 小三角2
  [[0,75],[37.5,112.5],[75,75],[37.5,37.5]], // 正方形
  [[0,0],[120,0],[180,60],[60,60]],          // 平行四辺形
];

/* ====== 便利関数 ====== */
function polyPath(poly){
  ctx.beginPath();
  poly.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();
}
function drawPolygon(poly, fill, stroke='#222', dashed=false){
  ctx.save();
  if (dashed) ctx.setLineDash([8,6]);
  polyPath(poly);
  if (fill) { ctx.fillStyle = fill===true ? '#e5e7eb' : fill; ctx.fill(); }
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
  ctx.restore();
}
function centroid(raw){
  let sx=0, sy=0;
  raw.forEach(p=>{ sx+=p[0]; sy+=p[1]; });
  return [sx/raw.length, sy/raw.length];
}
function transform(shape, tx, ty, rotDeg=0, flip=false){
  const [cx,cy] = centroid(shape);
  const rad = rotDeg*Math.PI/180, ca=Math.cos(rad), sa=Math.sin(rad);
  return shape.map(([x,y])=>{
    x -= cx; y -= cy;
    if (flip) x = -x;
    const xr = x*ca - y*sa, yr = x*sa + y*ca;
    return { x: xr + cx + tx, y: yr + cy + ty };
  });
}
function pointInPoly(pt, poly){
  // 射線法
  let c=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    if (((a.y>pt.y)!==(b.y>pt.y)) && (pt.x < (b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)) c=!c;
  }
  return c;
}
function polyArea(poly){
  let s=0; for (let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    s += a.x*b.y - a.y*b.x;
  }
  return Math.abs(s)/2;
}

/* ====== ピースクラス ====== */
class Piece{
  constructor(shape, color, x, y){
    this.shape = shape.map(p=>[...p]);
    this.color = color;
    this.tx = x; this.ty = y;
    this.rot = 0; this.flip = false;
  }
  get poly(){ return transform(this.shape, this.tx, this.ty, this.rot, this.flip); }
}

/* ====== ターゲットをキャンバス中央へスケール ====== */
function placeTarget(name){
  const raw = TARGETS[name];
  // 原点&スケール
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  raw.forEach(p=>{ minx=Math.min(minx,p.x); miny=Math.min(miny,p.y); maxx=Math.max(maxx,p.x); maxy=Math.max(maxy,p.y); });
  const w=maxx-minx, h=maxy-miny;
  const scale = Math.min((canvas.width*0.5)/w, (canvas.height*0.35)/h);
  const ox = (canvas.width - w*scale)/2 - minx*scale;
  const oy = (canvas.height*0.45 - h*scale)/2 - miny*scale;
  state.targetPoly = raw.map(p=>({x:p.x*scale+ox, y:p.y*scale+oy}));
}

/* ====== 盤面生成 ====== */
function buildBoard(title){
  placeTarget(title);

  // ピースを下段に整列
  pieces = [];
  const baseY = canvas.height - 120;
  PIECE_SHAPES.forEach((sh, i)=>{
    const x = 80 + i*140;
    pieces.push(new Piece(sh, COLORS[i%COLORS.length], x, baseY));
  });

  drawAll();
}

/* ====== 描画 ====== */
function drawAll(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // 目標シルエット
  drawPolygon(state.targetPoly, '#2b2b2b');

  // ピース
  pieces.forEach(p=>{
    const poly = p.poly;
    drawPolygon(poly, p.color);
  });
}

/* ====== 入力（ドラッグ／回転／反転） ====== */
canvas.addEventListener('pointerdown', e=>{
  const pt = pointerPos(e);
  for (let i=pieces.length-1;i>=0;i--){
    if (pointInPoly(pt, pieces[i].poly)){
      selected = pieces[i];
      pieces.push(pieces.splice(i,1)[0]);  // 最前面へ
      drag = pt;
      break;
    }
  }
});
canvas.addEventListener('pointermove', e=>{
  if (!drag || !selected) return;
  const pt = pointerPos(e);
  selected.tx += pt.x - drag.x;
  selected.ty += pt.y - drag.y;
  drag = pt;
  drawAll();
});
canvas.addEventListener('pointerup', ()=>{ drag=null; });
$btnR.addEventListener('click', ()=>{ if (selected){ selected.rot=(selected.rot+45)%360; drawAll(); } });
$btnF.addEventListener('click', ()=>{ if (selected){ selected.flip=!selected.flip; drawAll(); } });
document.addEventListener('keydown', (e)=>{
  if (e.key==='r' || e.key==='R'){ if (selected){ selected.rot=(selected.rot+45)%360; drawAll(); } }
  if (e.key==='f' || e.key==='F'){ if (selected){ selected.flip=!selected.flip; drawAll(); } }
});
function pointerPos(e){
  const r = canvas.getBoundingClientRect();
  return { x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height };
}

/* ====== タイマー ====== */
function startTimer(){
  stopTimer();
  state.startAt = performance.now();
  tick();
}
function tick(){
  const sec = Math.floor((performance.now() - state.startAt)/1000);
  $timer.textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  state.raf = requestAnimationFrame(tick);
}
function stopTimer(){
  if (state.raf){ cancelAnimationFrame(state.raf); state.raf=0; }
  $timer.textContent = '00:00';
}

/* ====== 判定 ======
 *  目標多角形の内側に、ピースの面積の何割が入っているかで判定（ざっくり）
 */
function judge(){
  // 目標外に大きくはみ出していないか（シルエット面積比）
  const targetArea = polyArea(state.targetPoly);
  let insideArea = 0;
  pieces.forEach(p=>{
    // 簡易：頂点が目標内に入っているものだけ面積加算（近似）
    const poly = p.poly;
    if (poly.every(pt=>pointInPoly(pt, state.targetPoly))){
      insideArea += polyArea(poly);
    }
  });
  const ratio = insideArea / targetArea;

  if (ratio > 0.88){ // しきい値（緩め）
    return true;
  }
  alert('まだ隙間があります（微調整してね）');
  return false;
}

/* ====== 進行管理 ====== */
const ORDER_A = ['アヒル','凹み','家','コマ','サカナ'];
const ORDER_B = ['コマ','家','サカナ','凹み','アヒル'];

function startExperiment(){
  state.pattern   = $modeB.checked ? 'B' : 'A';
  state.blockIndex= 1;
  state.isPrime   = false;
  state.trial     = 0;
  state.running   = true;
  nextTrial();
}

function nextTrial(){
  // ブロック切替
  if (state.trial>=5){
    if (state.blockIndex===1){
      // ブロック2（プライム）へ
      state.blockIndex=2;
      state.isPrime = true;
      state.trial = 0;
      showPrimeCountdown(() => { state.trial=0; proceed(); });
      return;
    }else{
      finishAll();
      return;
    }
  }
  proceed();
}

function proceed(){
  state.trial++;
  const title = (state.pattern==='A'? ORDER_A : ORDER_B)[state.trial-1];
  state.currentTitle = title;
  $now.textContent = `現在：${title}`;
  buildBoard(title);
  startTimer();
}

function finishAll(){
  stopTimer();
  state.running=false;
  $now.textContent = '現在：—';
  alert('終了しました。ご協力ありがとうございました！');
}

/* ====== プライム（3,2,1→解答のヒントを一瞬表示） ====== */
function showPrimeCountdown(done){
  // 3,2,1 を画面中央に出してから、ターゲットを少し濃く（ゴースト解）で flashMs 表示
  overlayText('3', 500, ()=>overlayText('2',500,()=>overlayText('1',500,()=>{
    flashSolution(done);
  })));
}
function overlayText(text, ms, cb){
  const t0 = performance.now();
  function f(){
    const p = Math.min(1,(performance.now()-t0)/ms);
    drawAll();
    ctx.save();
    ctx.globalAlpha = 0.85*(1-p*0.2);
    ctx.fillStyle = '#111';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.min(canvas.width,canvas.height)*0.2}px system-ui`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text, canvas.width/2, canvas.height/2);
    ctx.restore();
    if (p<1) requestAnimationFrame(f); else cb&&cb();
  }
  f();
}
function flashSolution(cb){
  // 解の代わりに、目標シルエットをハイライトして flashMs 表示（確実に描けてラグがない）
  const t0 = performance.now();
  function f(){
    const p = (performance.now()-t0)/state.flashMs;
    drawAll();
    ctx.save();
    ctx.globalAlpha = 0.75;
    drawPolygon(state.targetPoly, '#22c55e', '#22c55e'); // 緑で一瞬
    ctx.restore();
    if (p<1) requestAnimationFrame(f); else cb&&cb();
  }
  f();
}

/* ====== 送信 ====== */
function postRow(payload){
  try{
    fetch(SHEETS_ENDPOINT,{
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
  }catch(_){}
}

/* ====== イベント接続 ====== */
$start.addEventListener('click', ()=>{
  const nm = ($name.value||'').trim();
  if (!nm){ alert('名前を入力してください'); return; }
  startExperiment();
});

$judge.addEventListener('click', ()=>{
  if (!state.running) return;
  stopTimer();
  const sec = Math.round((performance.now()-state.startAt)/1000);
  const ok = judge();
  // 成功時のみ記録して次へ
  if (ok){
    postRow({
      token:SHEETS_TOKEN,
      participant_id:$name.value||'',
      pattern:state.pattern,
      block_index:state.blockIndex,
      condition:state.isPrime?'prime':'control',
      trial_index:state.trial,
      puzzle_title:state.currentTitle,
      time_sec:sec,
      device_category:/iPhone|Android.+Mobile/.test(navigator.userAgent)?'mobile':'pc',
      prime_exposure_ms:state.isPrime?state.flashMs:0
    });
    nextTrial();
  }else{
    // 失敗ならタイマー再開して続行
    startTimer();
  }
});

/* ====== 初期表示 ====== */
$now.textContent = '現在：—';
$timer.textContent = '00:00';
drawAll();
