/* ====== 設定 ====== */
// スプレッドシート送信先
const SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzC5tLGJlqn6U51wXDhrqppkRX-n2s4FkI6RDwFxvKe3yAM5xgFTfDjksYGE2Zl9KU/exec';
const SHEETS_TOKEN    = 'REPLACE_WITH_YOUR_TOKEN';

// 画面
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// UI
const $name  = document.getElementById('playerName');
const $modeA = document.getElementById('modeA');
const $modeB = document.getElementById('modeB');
const $modeP = document.getElementById('modePractice');
const $start = document.getElementById('btnStart');
const $judge = document.getElementById('btnJudge');
const $now   = document.getElementById('nowLabel');
const $timer = document.getElementById('timer');
const $btnR  = document.getElementById('btnRotate');
const $btnF  = document.getElementById('btnFlip');
const $practiceNav = document.getElementById('practiceNav');
const $btnPracticeReset = document.getElementById('btnPracticeReset');
const $btnBackHome = document.getElementById('btnBackHome');

// ゲーム状態
let state = {
  mode: 'A',                // 'A' | 'B' | 'practice'
  recording: true,          // 練習では false
  running: false,
  trialInBlock: 0,          // 1..5
  blockIndex: 1,            // 1:通常/2:プライム
  pattern: 'A',
  isPrime: false,
  startAt: 0,
  timerId: 0,
  currentPuzzleTitle: '—',
};

// 既存の課題データ（例）
const PUZZLES_A = [
  { title:'アヒル',    target:[/* …既存の頂点配列… */] },
  { title:'凹み',      target:[/* … */] },
  { title:'家',        target:[/* … */] },
  { title:'コマ',      target:[/* … */] },
  { title:'サカナ',    target:[/* … */] },
];
// 練習のターゲット（適当な小さめ形状）
const PRACTICE_TARGET = [{x:600,y:260},{x:740,y:260},{x:740,y:380},{x:600,y:380}];

// 7ピース定義（既存のままでOK）
const PIECES = [
  /* 大① */  [[0,0],[300,0],[150,150]],
  /* 大② */  [[0,0],[0,300],[150,150]],
  /* 中  */  [[0,0],[150,150],[0,150]],
  /* 小① */  [[0,0],[150,0],[75,75]],
  /* 小② */  [[150,0],[150,150],[75,75]],
  /* 正方 */  [[0,150],[75,225],[150,150],[75,75]],
  /* 平行 */  [[0,0],[150,0],[225,75],[75,75]],
];
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#9b59b6','#f39c12','#1abc9c'];

let pieces = [];    // 画面上のピース
let selected = null;

/* ====== 初期UI ====== */
$start.addEventListener('click', () => {
  if (!$name.value && !$modeP.checked) {
    alert('名前を入力してください'); return;
  }
  if ($modeP.checked) {
    enterPractice();
  } else {
    enterMain();
  }
});
$judge.addEventListener('click', judgeCurrent);
$btnR.addEventListener('click', () => rotateSelected());
$btnF.addEventListener('click', () => flipSelected());
document.addEventListener('keydown', (e)=>{
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 'f' || e.key === 'F') flipSelected();
});
$btnPracticeReset.addEventListener('click', resetPracticeBoard);
$btnBackHome.addEventListener('click', showStartScreen);

/* ====== メインモード ====== */
function enterMain(){
  state.mode = $modeA.checked ? 'A' : 'B';
  state.pattern = state.mode;
  state.recording = true;
  state.blockIndex = 1;
  state.trialInBlock = 0;
  $practiceNav.style.display = 'none';
  $judge.disabled = false;
  nextTrial();
}

function nextTrial(){
  state.running = true;
  state.trialInBlock++;
  if (state.trialInBlock>5){
    if (state.blockIndex===1){
      // プライミングありへ遷移（既存のカウントダウン画面を表示）
      state.blockIndex = 2;
      state.isPrime = true;
      state.trialInBlock = 1;
      // ここで既存のカウントダウン→一瞬表示→回答画面 へ
      // （既存実装をそのまま使用）
    }else{
      // 終了
      state.running=false;
      $now.textContent = '現在：—';
      return;
    }
  }
  const p = PUZZLES_A[state.trialInBlock-1];
  state.currentPuzzleTitle = p.title;
  $now.textContent = `現在：${p.title}`;
  buildBoard(p.target);
  startTimer();
}

function judgeCurrent(){
  if (!state.running) return;
  stopTimer();
  const elapsedSec = Math.round((performance.now()-state.startAt)/1000);
  // ---- 記録（練習以外のみ） ----
  if (state.recording) {
    postToSheets({
      token: SHEETS_TOKEN,
      participant_id: $name.value || '',
      pattern: state.pattern,
      block_index: state.blockIndex,
      condition: state.isPrime ? 'prime' : 'control',
      trial_index: state.trialInBlock,
      puzzle_title: state.currentPuzzleTitle,
      time_sec: elapsedSec,
      device_category: isMobile() ? 'mobile' : 'pc',
      prime_exposure_ms: state.isPrime ? primeExposureMs() : 0
    });
  }
  nextTrial();
}

/* ====== 練習モード ====== */
function enterPractice(){
  state.mode = 'practice';
  state.recording = false;     // ←★ 送らない
  state.running = true;
  state.trialInBlock = 1;
  state.blockIndex = 0;
  state.isPrime = false;
  $now.textContent = '現在：練習';
  $practiceNav.style.display = 'flex';   // ←★ ナビ表示
  $judge.disabled = false;               // 練習でも判定ボタンは使える（=クリア扱い）
  buildBoard(PRACTICE_TARGET);
  startTimer();
}
function resetPracticeBoard(){
  buildBoard(PRACTICE_TARGET);
  startTimer();
}
function showStartScreen(){
  // 画面を初期状態へ（キャンバス消去＆UI戻し）
  stopTimer();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  $now.textContent = '現在：—';
  $timer.textContent = '00:00';
  $practiceNav.style.display = 'none';
  pieces = []; selected = null;
}

/* ====== ボード描画・ピース ====== */
function buildBoard(targetPoly){
  // キャンバス初期化
  ctx.clearRect(0,0,canvas.width,canvas.height);
  pieces = []; selected = null;

  // 目標の枠（薄い灰色）
  drawPolygon(targetPoly, '#cccccc', true);

  // ピースを下段に並べる
  const baseY = canvas.height - 110;
  PIECES.forEach((shape, i)=>{
    const offsetX = 80 + i*160;
    pieces.push(new Piece(shape, COLORS[i%COLORS.length], offsetX, baseY));
  });

  drawAll();
}

class Piece{
  constructor(shape, color, ox, oy){
    this.shape = shape.map(p=>[...p]);
    this.color = color;
    this.ox = ox; this.oy = oy;
    this.a = 0; this.flip=false;
  }
  get poly(){
    const cx = this.shape.reduce((s,p)=>s+p[0],0)/this.shape.length;
    const cy = this.shape.reduce((s,p)=>s+p[1],0)/this.shape.length;
    const rad = this.a*Math.PI/180, ca=Math.cos(rad), sa=Math.sin(rad);
    return this.shape.map(([x,y])=>{
      x-=cx; y-=cy;
      if (this.flip) x=-x;
      const xr = x*ca - y*sa, yr = x*sa + y*ca;
      return {x:xr+cx+this.ox, y:yr+cy+this.oy};
    });
  }
}
function drawPolygon(poly, fill, dashed){
  ctx.save();
  if (dashed) ctx.setLineDash([6,4]);
  ctx.beginPath();
  poly.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();
  ctx.fillStyle = fill===true ? '#cccccc' : fill;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  if (fill) ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function drawAll(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // 目標の枠は薄く（必要なら保持して再描画）
  // ここでは簡略化のため省略。必要なら targetPoly を保持して描く。
  pieces.forEach(p=>{
    const poly = p.poly;
    ctx.beginPath();
    poly.forEach((pt,i)=> i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
  });
}

/* ====== 操作（ドラッグ・回転・反転） ====== */
let drag = null;
canvas.addEventListener('pointerdown', e=>{
  const pt = pointer(e);
  // 上にあるピースからヒット
  for (let i=pieces.length-1;i>=0;i--){
    if (pointInPolygon(pt, pieces[i].poly)){
      selected = pieces[i];
      pieces.push(pieces.splice(i,1)[0]); // 最前面へ
      drag = {x:pt.x, y:pt.y};
      break;
    }
  }
});
canvas.addEventListener('pointermove', e=>{
  if (!drag || !selected) return;
  const pt = pointer(e);
  selected.ox += pt.x - drag.x;
  selected.oy += pt.y - drag.y;
  drag = pt;
  drawAll();
});
canvas.addEventListener('pointerup', ()=> drag=null);

function rotateSelected(){ if (selected){ selected.a=(selected.a+45)%360; drawAll(); } }
function flipSelected(){ if (selected){ selected.flip=!selected.flip; drawAll(); } }

function pointer(e){
  const r = canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)*canvas.width/r.width, y:(e.clientY-r.top)*canvas.height/r.height};
}
function pointInPolygon(pt, poly){
  // 射線法
  let c=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    if (((a.y>pt.y)!==(b.y>pt.y)) && (pt.x < (b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)) c=!c;
  }
  return c;
}

/* ====== タイマー ====== */
function startTimer(){
  stopTimer();
  state.startAt = performance.now();
  tick();
}
function tick(){
  const sec = Math.floor((performance.now()-state.startAt)/1000);
  $timer.textContent = `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
  state.timerId = requestAnimationFrame(tick);
}
function stopTimer(){
  if (state.timerId){ cancelAnimationFrame(state.timerId); state.timerId=0; }
  $timer.textContent = '00:00';
}

/* ====== 送信（練習では呼ばれない） ====== */
function postToSheets(payload){
  try{
    fetch(SHEETS_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      mode:'no-cors',
      body:JSON.stringify(payload)
    });
  }catch(_){}
}
function isMobile(){ return /iPhone|Android.+Mobile/.test(navigator.userAgent); }
function primeExposureMs(){ return 600; } // あなたの実装値に合わせてOK

function resizeCanvas(){
  const w = canvas.clientWidth || window.innerWidth-24;
  const h = canvas.clientHeight || Math.max(480, Math.round(window.innerHeight*0.7));
  canvas.width = w; canvas.height = h;
  drawAll();
}
