// Tangram AB – 安定化版（キャンバス自動取得/生成・ID互換レイヤー込み）
document.addEventListener('DOMContentLoaded', () => {
  /* ================== 可変設定（GAS） ================== */
  const SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzC5tLGJlqn6U51wXDhrqppkRX-n2s4FkI6RDwFxvKe3yAM5xgFTfDjksYGE2Zl9KU/exec';
  const SHEETS_TOKEN    = 'REPLACE_WITH_YOUR_TOKEN';

  /* ================== 互換レイヤー ================== */
  const $ = id => document.getElementById(id);

  // ボタン
  const startBtn  = $('start')    || $('btnStart');
  const judgeBtn  = $('judge')    || $('btnJudge');

  // キャンバス（無ければ自動生成）
  let   canvas    = $('game')     || $('stage');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'stage';
    ( $('stageWrap') || document.body ).appendChild(canvas);
  }
  // ここで必ず getContext 可能にする
  const ctx = canvas.getContext('2d', { willReadFrequently:true });
  if (!ctx) {
    alert('Canvas の作成に失敗しました。<canvas id="stage"> もしくは <canvas id="game"> が必要です。');
    return;
  }

  // 表示要素
  const titleEl   = $('puzzleTitle') || $('nowLabel');
  const timerEl   = $('timer');

  // 名前・パターン
  const player    = $('player')      || $('playerName');
  const patternA  = $('patternA')    || $('modeA');
  const patternB  = $('patternB')    || $('modeB');

  // モバイル操作
  const rotateBtn = $('rotateMobile')|| $('btnRotate');
  const flipBtn   = $('flipMobile')  || $('btnFlip');

  // 画面（あれば使う）
  const startScreen = $('startScreen');
  const ui          = $('ui');
  const stageWrap   = $('stageWrap');
  const mobileCtrls = $('mobileControls');

  /* ================== 基本パラメタ ================== */
  const WORLD_W = 1500, WORLD_H = 900, SNAP = 25;
  const CANVAS_Y_OFFSET = -60;
  const COUNT_STEP_MS = 700, FLASH_MS = 1000;
  const DILATE_PX = Math.max(4, Math.round(window.devicePixelRatio * 2));
  function rez(){ canvas.width = WORLD_W; canvas.height = WORLD_H; }
  window.addEventListener('resize', rez); rez();

  /* ================== GAS 送信ユーティリティ ================== */
  function deviceCategory(){
    const ua = navigator.userAgent || '';
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'tablet';
    if (/iPhone|Android.+Mobile|Windows Phone|iPod/i.test(ua)) return 'mobile';
    return 'pc';
  }
  function rowSingle(d){
    return {
      token: SHEETS_TOKEN,
      participant_id: d.participant_id,
      pattern: d.pattern,
      block_index: d.block_index,
      condition: d.condition,
      trial_index: d.trial_index,
      puzzle_title: d.puzzle_title,
      time_sec: d.time_sec,
      device_category: deviceCategory(),
      prime_exposure_ms: d.prime_exposure_ms
    };
  }
  function rowPlain(d){
    return {
      participant_id: d.participant_id,
      pattern: d.pattern,
      block_index: d.block_index,
      condition: d.condition,
      trial_index: d.trial_index,
      puzzle_title: d.puzzle_title,
      time_sec: d.time_sec,
      device_category: deviceCategory(),
      prime_exposure_ms: d.prime_exposure_ms
    };
  }
  async function postToSheets(payload){
    try{
      await fetch(SHEETS_ENDPOINT, {
        method:'POST', mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      return true;
    }catch(e){ console.warn('[Sheets] failed', e); return false; }
  }

  /* ================== パズル定義（A/B） ================== */
  const PUZZLES_A = [
    { title: "アヒル", target: [[482,394],[588,288],[800,288],[800,182],[906,182],[1012,182],[906,288],[906,394],[800,500],[588,500]] },
    { title: "凹み",   target: [[482,182],[588,182],[588,394],[800,394],[800,182],[906,182],[906,500],[482,500]] },
    { title: "家",     target: [[694,76],[906,288],[800,288],[800,500],[588,500],[588,288],[482,288]] },
    { title: "コマ",   target: [[482,394],[588,288],[641,288],[641,182],[747,182],[747,288],[800,288],[906,394],[694,606]] },
    { title: "サカナ", target: [[332,356],[544,356],[619,281],[469,281],[544,206],[694,206],[844,356],[694,506],[694,612],[588,612],[694,506],[619,431],[544,506],[394,506],[438,462]] },
  ];
  const PUZZLES_B = [
    { title: "狐",     target: [[270,288],[376,394],[482,394],[694,394],[800,394],[800,288],[906,394],[981,319],[981,469],[906,544],[831,469],[694,606],[694,544],[544,544],[482,606],[482,394],[376,288]] },
    { title: "猫",     target: [[244,288],[350,288],[456,394],[456,244],[756,244],[831,319],[831,169],[906,244],[981,169],[981,319],[906,394],[606,394],[456,394],[350,394]] },
    { title: "ライオン", target: [[482,288],[588,182],[694,288],[694,394],[906,394],[1012,288],[1012,394],[1056,394],[1131,469],[981,469],[1056,544],[756,544],[694,606],[694,500],[588,394],[588,288]] },
    { title: "ネッシー", target: [[257,425],[363,319],[469,319],[681,319],[756,244],[831,319],[906,244],[981,319],[906,394],[1012,394],[1012,500],[906,500],[906,544],[756,394],[606,394],[469,531],[469,319],[363,425]] },
    { title: "魚",    target: [[482,288],[694,288],[588,182],[694,182],[906,394],[696,606],[588,606],[694,500],[482,500],[588,394]] },
  ];

  // 7ピース
  const PIECES = [
    [[0,0],[300,0],[150,150]],
    [[0,0],[0,300],[150,150]],
    [[0,0],[150,150],[0,150]],
    [[0,0],[150,0],[75,75]],
    [[150,0],[150,150],[75,75]],
    [[0,150],[75,225],[150,150],[75,75]],
    [[0,0],[150,0],[225,75],[75,75]],
  ];
  const COLORS = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#9B59B6","#F39C12","#1ABC9C"];

  /* ================== 共通ユーティリティ ================== */
  const deg = d => d*Math.PI/180;
  const centroid = pts => { let sx=0,sy=0; for(const [x,y] of pts){ sx+=x; sy+=y; } return [sx/pts.length, sy/pts.length]; };
  function transform(points,off,ang,flip){
    const [cx,cy]=centroid(points); const a=deg(ang), c=Math.cos(a), s=Math.sin(a);
    return points.map(([x,y])=>{ let dx=x-cx, dy=y-cy; if(flip) dx=-dx; const xr=dx*c-dy*s, yr=dx*s+dy*c; return [xr+cx+off[0], yr+cy+off[1]]; });
  }
  const drawPath = (k,pts)=>{ k.beginPath(); pts.forEach(([x,y],i)=>i?k.lineTo(x,y):k.moveTo(x,y)); k.closePath(); };
  const drawPoly  = (k,pts,fill=null,stroke="#222",lw=2)=>{ if(!pts.length) return; drawPath(k,pts); if(fill){k.fillStyle=fill;k.fill();} if(stroke&&lw){k.strokeStyle=stroke;k.lineWidth=lw;k.stroke();} };
  const roundPts  = poly => poly.map(([x,y])=>[Math.round(x),Math.round(y)]);
  const fmt       = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // オフスクリーン
  const mk = () => { const c=document.createElement('canvas'); c.width=WORLD_W; c.height=WORLD_H; const k=c.getContext('2d',{willReadFrequently:true}); k.imageSmoothingEnabled=false; return [c,k]; };
  const [cT,ctxT]  = mk(), [cU,ctxU]  = mk(), [cUd,ctxUd]=mk(), [tmp,ctxX]=mk();
  const alphaCount = (k,w,h)=>{ const d=k.getImageData(0,0,w,h).data; let c=0; for(let i=3;i<d.length;i+=4){ if(d[i]!==0) c++; } return c; };
  function drawDil(k, pts, px){
    drawPath(k, pts);
    k.fillStyle = '#000';
    k.fill();
    if (px > 0) {
      k.lineWidth = px*2+1; k.lineJoin='round'; k.lineCap='round'; k.miterLimit=2; k.strokeStyle='#000'; k.stroke();
    }
  }

  /* ================== 進行状態 ================== */
  const state = {
    pieces:[], selectedId:null, puzzleIndex:0,
    step:'home', results:[], elapsed:0, timerId:null, frozen:false,
    pattern:'A', lastPrimeExposureMs:0
  };

  function currentSets(){
    if (state.pattern==='B'){
      return { ACTIVE: PUZZLES_B.concat(PUZZLES_A),
               FLASH:  [...new Array(PUZZLES_B.length).fill(false), ...new Array(PUZZLES_A.length).fill(true)] };
    }
    return { ACTIVE: PUZZLES_A.concat(PUZZLES_B),
             FLASH:  [...new Array(PUZZLES_A.length).fill(false), ...new Array(PUZZLES_B.length).fill(true)] };
  }

  function resetPieces(){
    state.pieces = PIECES.map((s,i)=>({
      id:i, shape:s.map(([x,y])=>[x,y]),
      color:COLORS[i%COLORS.length],
      offset:[80+i*200, 620], angle:0, flipped:false
    }));
    state.selectedId = null;
  }

  /* ================== 描画ループ ================== */
  function render(){
    const {ACTIVE}=currentSets();
    ctx.clearRect(0,0,WORLD_W,WORLD_H);
    ctx.save(); ctx.translate(0, CANVAS_Y_OFFSET);
    drawPoly(ctx, ACTIVE[state.puzzleIndex].target, '#2b2b2b', '#444', 2);
    const ts = state.pieces.map(p=>({...p, world:transform(p.shape,p.offset,p.angle,p.flipped)}));
    ts.forEach(p=>{
      ctx.save(); ctx.shadowColor='rgba(0,0,0,.22)'; ctx.shadowBlur=8; ctx.shadowOffsetY=4;
      drawPoly(ctx, p.world, p.color, '#1a1a1a', 2);
      ctx.restore();
    });
    if(state.selectedId!=null){
      const p=ts.find(pp=>pp.id===state.selectedId);
      if(p){ ctx.save(); ctx.setLineDash([6,4]); drawPoly(ctx,p.world,null,'#e5e7eb',2); ctx.restore(); }
    }
    ctx.restore();
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  /* ================== 入力（ドラッグ/回転/反転） ================== */
  function hit(x,y){
    ctx.save(); ctx.translate(0, CANVAS_Y_OFFSET);
    for(let i=state.pieces.length-1;i>=0;i--){
      const p=state.pieces[i], w=transform(p.shape,p.offset,p.angle,p.flipped);
      drawPath(ctx,w);
      if(ctx.isPointInPath(x,y)){ ctx.restore(); return p.id; }
    }
    ctx.restore(); return null;
  }
  const drag={active:false,id:null,last:[0,0]};
  const canvasXY=e=>{ const r=canvas.getBoundingClientRect(), sx=canvas.width/r.width, sy=canvas.height/r.height; return [(e.clientX-r.left)*sx,(e.clientY-r.top)*sy]; };
  canvas.addEventListener('pointerdown',e=>{
    if(state.step!=='play'||state.frozen) return; e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
    const [x,y]=canvasXY(e); const id=hit(x,y); const moveId=id!=null?id:state.selectedId;
    if(moveId!=null){
      drag.active=true; drag.id=moveId; drag.last=[x,y];
      if(id!=null){
        state.selectedId=id;
        const idx=state.pieces.findIndex(p=>p.id===id);
        const [pk]=state.pieces.splice(idx,1); state.pieces.push(pk);
      }
    }
  },{passive:false});
  canvas.addEventListener('pointermove',e=>{
    if(!drag.active||state.frozen) return; e.preventDefault();
    const [x,y]=canvasXY(e); const dx=x-drag.last[0], dy=y-drag.last[1]; drag.last=[x,y];
    const id=drag.id;
    state.pieces = state.pieces.map(p=> p.id===id ? {...p, offset:[p.offset[0]+dx,p.offset[1]+dy]} : p);
  },{passive:false});
  canvas.addEventListener('pointerup',e=>{
    if(!drag.active) return; e.preventDefault();
    const id=drag.id; drag.active=false; drag.id=null; drag.last=[0,0];
    const {ACTIVE}=currentSets();
    const me = state.pieces.find(p=>p.id===id);
    const myPts = transform(me.shape,me.offset,me.angle,me.flipped);
    const targetPts = ACTIVE[state.puzzleIndex].target;
    const others = state.pieces.filter(p=>p.id!==id).flatMap(p=>transform(p.shape,p.offset,p.angle,p.flipped));
    const snaps=[...targetPts,...others]; let best=null,bestD2=SNAP*SNAP;
    for(const mp of myPts){ for(const tp of snaps){ const d2=(mp[0]-tp[0])**2+(mp[1]-tp[1])**2; if(d2<bestD2){ bestD2=d2; best=[tp[0]-mp[0], tp[1]-mp[1]]; } } }
    if(best){ me.offset=[me.offset[0]+best[0], me.offset[1]+best[1]]; }
  },{passive:false});
  canvas.addEventListener('pointercancel',()=>{ drag.active=false; drag.id=null; drag.last=[0,0]; },{passive:false});

  const rotate = ()=>{ if(state.selectedId==null||state.step!=='play'||state.frozen) return;
    state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,angle:(p.angle+45)%360}:p); };
  const flip   = ()=>{ if(state.selectedId==null||state.step!=='play'||state.frozen) return;
    state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,flipped:!p.flipped}:p); };
  rotateBtn?.addEventListener('click',rotate);
  flipBtn  ?.addEventListener('click',flip);
  window.addEventListener('keydown',e=>{
    if(state.step!=='play'||state.selectedId==null||state.frozen) return;
    if(e.key==='r'||e.key==='R') rotate();
    if(e.key==='f'||e.key==='F') flip();
  });

  /* ================== タイマー ================== */
  let startAt=0;
  const upd=()=>{ if(timerEl) timerEl.textContent=fmt(state.elapsed); };
  const stop=()=>{ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } };
  const reset=()=>{ stop(); state.elapsed=0; upd(); };
  const start=()=>{ stop(); startAt=Date.now(); state.timerId=setInterval(()=>{ state.elapsed=Math.floor((Date.now()-startAt)/1000); upd(); },500); };
  const setTitle=()=>{ const {ACTIVE}=currentSets(); titleEl && (titleEl.textContent = ACTIVE[state.puzzleIndex].title); };

  /* ================== カウントダウン & フラッシュ ================== */
  const LKEY='tangramLayouts_v1';
  let memStore={};
  const loadLs=()=>{ try{ return JSON.parse(localStorage.getItem(LKEY)||'{}'); }catch(e){ return {...memStore}; } };
  const saveLs=o =>{ try{ localStorage.setItem(LKEY, JSON.stringify(o)); }catch(e){ memStore={...o}; } };
  const getLayout=t=> (loadLs()[t]||null);
  const setLayout=(t,byId)=>{ const all=loadLs(); all[t]={v:1,byId}; saveLs(all); };

  const wait = ms => new Promise(r=>setTimeout(r,ms));
  async function countdown3(){
    // シンプルなオーバーレイ（存在しない環境でも進行できるよう最小実装）
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);color:#fff;display:flex;align-items:center;justify-content:center;font:bold 20vh system-ui;z-index:9999;';
    document.body.appendChild(overlay);
    overlay.textContent='3'; await wait(COUNT_STEP_MS);
    overlay.textContent='2'; await wait(COUNT_STEP_MS);
    overlay.textContent='1'; await wait(COUNT_STEP_MS);
    overlay.remove();
  }
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  async function flashThen(cb){
    await countdown3();
    const {ACTIVE}=currentSets();
    const rec=getLayout(ACTIVE[state.puzzleIndex].title);
    state.lastPrimeExposureMs = 0;
    if(!rec || !rec.byId){ cb?.(); return; }
    state.frozen=true;
    const backup=state.pieces.map(p=>({...p, offset:[...p.offset]}));
    const byId=rec.byId;
    state.pieces=state.pieces.map(p=> byId[String(p.id)] ? {
      ...p, offset:[...byId[String(p.id)].offset], angle: byId[String(p.id)].angle, flipped: !!byId[String(p.id)].flipped
    } : p);
    await nextFrame(); const t0=performance.now();
    await wait(FLASH_MS);
    state.pieces=backup;
    await nextFrame(); const t1=performance.now();
    state.lastPrimeExposureMs = Math.round(t1 - t0);
    state.frozen=false;
    cb?.();
  }

  /* ================== 保存（管理者用） ================== */
  const ADMIN = location.search.includes('admin=1');
  const saveBtn = $('saveLayoutBtn');
  if(ADMIN && saveBtn){
    saveBtn.classList.remove('hidden');
    saveBtn.addEventListener('click', ()=>{
      const {ACTIVE}=currentSets();
      const t=ACTIVE[state.puzzleIndex].title; const byId={};
      state.pieces.forEach(p=>{ byId[String(p.id)]={ offset:[...p.offset], angle:p.angle, flipped:!!p.flipped }; });
      setLayout(t,byId);
      alert(`「${t}」の正解レイアウトを保存しました！`);
    });
  }

  /* ================== 判定 ================== */
  function judge(){
    const {ACTIVE}=currentSets();
    const tgt = roundPts(ACTIVE[state.puzzleIndex].target);
    const polys = state.pieces.map(p=> roundPts(transform(p.shape,p.offset,p.angle,p.flipped)) );

    ctxT.clearRect(0,0,WORLD_W,WORLD_H);
    ctxU.clearRect(0,0,WORLD_W,WORLD_H);
    ctxUd.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);

    [ctxT, ctxU, ctxUd].forEach(k=>{ k.save(); k.translate(0, CANVAS_Y_OFFSET); });

    const px = DILATE_PX;
    const tolTarget = Math.max(3, px);
    const tolPiece  = Math.max(3, px);

    drawDil(ctxT, tgt, tolTarget);
    polys.forEach(pl=>drawDil(ctxU,  pl, 0));
    polys.forEach(pl=>drawDil(ctxUd, pl, tolPiece));

    [ctxT, ctxU, ctxUd].forEach(k=>k.restore());

    const targetArea = alphaCount(ctxT, WORLD_W, WORLD_H);
    const AREA_TOL   = Math.max(5000, Math.round(targetArea * 0.0035));
    const OUT_TOL    = Math.round(AREA_TOL * 0.5);

    // 外にはみ出し
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.drawImage(cU,0,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(cT,0,0);
    ctxX.globalCompositeOperation='source-over';
    const outside = alphaCount(ctxX,WORLD_W,WORLD_H);

    // 隙間
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.drawImage(cT,0,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(cUd,0,0);
    ctxX.globalCompositeOperation='source-over';
    const gaps = alphaCount(ctxX,WORLD_W,WORLD_H);

    // 重なり
    const unionArea = alphaCount(ctxU,WORLD_W,WORLD_H);
    let sum=0;
    for(const pl of polys){
      const plOff = pl.map(([x,y])=>[x, y + CANVAS_Y_OFFSET]);
      ctxX.clearRect(0,0,WORLD_W,WORLD_H);
      drawDil(ctxX, plOff, 0);
      sum += alphaCount(ctxX,WORLD_W,WORLD_H);
    }
    const overlap = Math.max(0, sum - unionArea);

    if(outside>OUT_TOL) return {ok:false,reason:'枠外に出ています。'};
    if(overlap>AREA_TOL) return {ok:false,reason:'ピースが重なっています。'};
    if(gaps>AREA_TOL)    return {ok:false,reason:'隙間があります。'};
    return {ok:true};
  }

  /* ================== 進行制御 ================== */
  function setTitle(){ const {ACTIVE}=currentSets(); titleEl && (titleEl.textContent = ACTIVE[state.puzzleIndex].title); }
  function firstHalf(){ state.step='play'; state.results=[]; state.puzzleIndex=0; setTitle(); resetPieces(); reset(); start(); }
  function secondHalf(){ state.step='play'; state.puzzleIndex=5; setTitle(); resetPieces(); reset(); flashThen(()=>start()); }
  function isNextPrime(){ const {FLASH}=currentSets(); return FLASH[state.puzzleIndex]; }

  function onJudge(){
    const {ACTIVE, FLASH}=currentSets();
    const r=judge(); if(!r.ok){ alert('不正解：'+r.reason); return; }
    stop();

    const isPrime = !!FLASH[state.puzzleIndex];
    const record = {
      puzzleIndex: state.puzzleIndex + 1,
      puzzleTitle: ACTIVE[state.puzzleIndex].title,
      condition: isPrime ? 'prime' : 'control',
      blockIndex: state.puzzleIndex < 5 ? 1 : 2,
      timeSec: state.elapsed,
      primeExposureMs: isPrime ? (state.lastPrimeExposureMs || 0) : 0
    };
    state.results.push(record);

    // 即送信
    postToSheets(rowSingle({
      participant_id: (player?.value||'').trim(),
      pattern: state.pattern,
      block_index: record.blockIndex,
      condition: record.condition,
      trial_index: ((state.puzzleIndex % 5) + 1),
      puzzle_title: record.puzzleTitle,
      time_sec: record.timeSec,
      prime_exposure_ms: record.primeExposureMs
    }));

    alert(`CLEAR!\n課題: ${record.puzzleTitle}\nタイム: ${record.timeSec}秒`);

    if(state.puzzleIndex===4){
      // ブロック切り替え画面が無い構成でも続行できるよう、そのまま secondHalf
      secondHalf(); return;
    }
    const last = currentSets().ACTIVE.length - 1;
    if(state.puzzleIndex < last){
      state.puzzleIndex++; setTitle(); resetPieces(); reset();
      (isNextPrime() ? flashThen : (cb=>cb&&cb()))(()=>start());
    }else{
      // 10問終了: 合計まとめ送信
      const total = state.results.reduce((a,b)=>a + (b.timeSec||0), 0);
      const rows = state.results.map(r => rowPlain({
        participant_id:(player?.value||'').trim(),
        pattern: state.pattern,
        block_index: r.blockIndex,
        condition: r.condition,
        trial_index: ((r.puzzleIndex-1) % 5) + 1,
        puzzle_title: r.puzzleTitle,
        time_sec: r.timeSec,
        prime_exposure_ms: r.primeExposureMs
      }));
      rows.push(rowPlain({
        participant_id:(player?.value||'').trim(),
        pattern: state.pattern,
        block_index: 'all',
        condition: 'summary',
        trial_index: 0,
        puzzle_title: 'TOTAL',
        time_sec: total,
        prime_exposure_ms: ''
      }));
      postToSheets({ token:SHEETS_TOKEN, rows });
      alert(`10問クリア！合計: ${total} 秒`);
      state.step='finished';
    }
  }

  /* ================== ボタン配線 ================== */
  if (startBtn){
    startBtn.addEventListener('click', () => {
      const nm = (player?.value || '').trim();
      if (!nm){ alert('お名前を入力してください'); player?.focus(); return; }
      state.pattern = (patternB && patternB.checked) ? 'B' : 'A';
      startScreen?.classList.add('hidden');
      ui?.classList.remove('hidden');
      stageWrap?.classList.remove('hidden');
      mobileCtrls?.classList.remove('hidden');
      firstHalf();
    });
  }
  if (judgeBtn){
    judgeBtn.addEventListener('click', onJudge);
  }

  // モバイル操作
  rotateBtn?.addEventListener('click', rotate);
  flipBtn  ?.addEventListener('click', flip);

  // 初期表示
  timerEl && (timerEl.textContent='00:00');
  setTitle();
});
