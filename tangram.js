// Tangram – Pattern A(通常5 + フラッシュ5) 完全版
// - DPRなし / 座標正規化 / ドラッグ安定（pointer + preventDefault）
// - 判定：整数化 + 3pxバッファ（AA耐性）
// - スマホ縦：回転/反転ボタン、キャンバス拡大
// - パターンA：TangramA_1の5問 + TangramB_2の5問（後半は開始時に正解シルエットを一瞬表示）

document.addEventListener('DOMContentLoaded', () => {
  // ====== 送信先（必要なら設定） ======
  const ENDPOINT_URL = 'PUT_APPS_SCRIPT_WEB_APP_URL_HERE';
  const POST_TOKEN   = 'PUT_RANDOM_TOKEN_HERE';
  const APP_VERSION  = 'tangramAB-1.1.0';

  const WORLD_W=1500, WORLD_H=900, SNAP_DISTANCE=25;

  // ---- Tangram A_1（既存5問）----
  const PUZZLES_A = [
    { title: "アヒル", target: [[482,394],[588,288],[800,288],[800,182],[906,182],[1012,182],[906,288],[906,394],[800,500],[588,500]] },
    { title: "凹み",   target: [[482,182],[588,182],[588,394],[800,394],[800,182],[906,182],[906,500],[482,500]] },
    { title: "家",     target: [[694,76],[906,288],[800,288],[800,500],[588,500],[588,288],[482,288]] },
    { title: "コマ",   target: [[482,394],[588,288],[641,288],[641,182],[747,182],[747,288],[800,288],[906,394],[694,606]] },
    { title: "サカナ", target: [[332,356],[544,356],[619,281],[469,281],[544,206],[694,206],[844,356],[694,506],[694,612],[588,612],[694,506],[619,431],[544,506],[394,506],[438,462]] },
  ];

  // ---- Tangram B_2（追加5問）----
  const PUZZLES_B2 = [
    { title: "狐",     target: [[270,288],[376,394],[482,394],[694,394],[800,394],[800,288],[906,394],[981,319],[981,469],[906,544],[831,469],[694,606],[694,544],[544,544],[482,606],[482,394],[376,288]] },
    { title: "猫",     target: [[244,288],[350,288],[456,394],[456,244],[756,244],[831,319],[831,169],[906,244],[981,169],[981,319],[906,394],[606,394],[456,394],[350,394]] },
    { title: "ライオン", target: [[482,288],[588,182],[694,288],[694,394],[906,394],[1012,288],[1012,394],[1056,394],[1131,469],[981,469],[1056,544],[756,544],[694,606],[694,500],[588,394],[588,288]] },
    { title: "ネッシー", target: [[257,425],[363,319],[469,319],[681,319],[756,244],[831,319],[906,244],[981,319],[906,394],[1012,394],[1012,500],[906,500],[906,544],[756,394],[606,394],[469,531],[469,319],[363,425]] },
    { title: "魚B",    target: [[482,288],[694,288],[588,182],[694,182],[906,394],[696,606],[588,606],[694,500],[482,500],[588,394]] },
  ];

  // ---- Pieces ----
  const TANGRAM_PIECES = [
    [[0,0],[300,0],[150,150]],
    [[0,0],[0,300],[150,150]],
    [[0,0],[150,150],[0,150]],
    [[0,0],[150,0],[75,75]],
    [[150,0],[150,150],[75,75]],
    [[0,150],[75,225],[150,150],[75,75]],
    [[0,0],[150,0],[225,75],[75,75]],
  ];
  const COLORS=["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#9B59B6","#F39C12","#1ABC9C"];

  // ---- Utils ----
  const $id = id => document.getElementById(id);
  const fmtTime = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const deg = d => d*Math.PI/180;
  const roundPts = poly => poly.map(([x,y])=>[Math.round(x),Math.round(y)]);
  function centroid(pts){let sx=0,sy=0;for(const [x,y] of pts){sx+=x;sy+=y}return [sx/pts.length,sy/pts.length]}
  function transform(points, offset, angle, flipped){
    const [cx,cy]=centroid(points); const a=deg(angle); const c=Math.cos(a), s=Math.sin(a);
    return points.map(([x,y])=>{ let dx=x-cx,dy=y-cy; if(flipped) dx=-dx; const xr=dx*c-dy*s, yr=dx*s+dy*c; return [xr+cx+offset[0], yr+cy+offset[1]];});
  }
  function distanceSq(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; }
  function drawPath(ctx, pts){ ctx.beginPath(); pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); }
  function drawPolygon(ctx, pts, fill=null, stroke="#222", lw=2){ if(!pts.length) return; drawPath(ctx, pts); if(fill){ctx.fillStyle=fill; ctx.fill();} if(stroke&&lw){ctx.strokeStyle=stroke; ctx.lineWidth=lw; ctx.stroke();} }
  function alphaCount(ctx,w,h){ const d=ctx.getImageData(0,0,w,h).data; let c=0; for(let i=3;i<d.length;i+=4){ if(d[i]!==0) c++; } return c; }

  // ---- State ----
  const state={
    pieces:[], selectedId:null, puzzleIndex:0, step:'home',
    results:[], elapsed:0, timerId:null,
    pattern:'A',
    flashUntil:0
  };

  // 進行用（今回Aのみ）
  let ACTIVE_PUZZLES = PUZZLES_A.slice();
  let FLASH_FLAGS    = new Array(PUZZLES_A.length).fill(false);
  const FLASH_MS     = 700;

  function configurePatternA(){
    ACTIVE_PUZZLES = PUZZLES_A.concat(PUZZLES_B2); // 10面
    FLASH_FLAGS = [
      ...new Array(PUZZLES_A.length).fill(false), // 前半：フラッシュなし
      ...new Array(PUZZLES_B2.length).fill(true)  // 後半：フラッシュあり
    ];
    // puzzleSelect はアクティブ問題に合わせて作り直す（デバッグ用途）
    if (puzzleSelect) {
      puzzleSelect.innerHTML = '';
      ACTIVE_PUZZLES.forEach((p,i)=>{
        const o=document.createElement('option');
        o.value=i; o.textContent=`${i+1}. ${p.title}`;
        puzzleSelect.appendChild(o);
      });
    }
  }

  // ---- Pieces reset ----
  function resetPieces(){
    state.pieces = TANGRAM_PIECES.map((shape,i)=>({
      id:i, shape:shape.map(([x,y])=>[x,y]),
      color:COLORS[i%COLORS.length],
      offset:[80+i*200,680],
      angle:0, flipped:false,
    }));
    state.selectedId=null;
  }

  // ---- Canvas ----
  const canvas=$id('game'); if(!canvas){ alert('canvas #game が見つかりません'); return; }
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  canvas.style.touchAction='none';

  // Offscreens（判定用）
  const offT=document.createElement('canvas'); offT.width=WORLD_W; offT.height=WORLD_H; const ctxT=offT.getContext('2d',{willReadFrequently:true});
  const offU=document.createElement('canvas'); offU.width=WORLD_W; offU.height=WORLD_H; const ctxU=offU.getContext('2d',{willReadFrequently:true});
  const offUd=document.createElement('canvas'); offUd.width=WORLD_W; offUd.height=WORLD_H; const ctxUd=offUd.getContext('2d',{willReadFrequently:true});
  const tmp=document.createElement('canvas'); tmp.width=WORLD_W; tmp.height=WORLD_H; const ctxX=tmp.getContext('2d',{willReadFrequently:true});
  [ctxT,ctxU,ctxUd,ctxX].forEach(c=>c.imageSmoothingEnabled=false);

  function resizeCanvas(){ canvas.width=WORLD_W; canvas.height=WORLD_H; }
  window.addEventListener('resize',resizeCanvas); resizeCanvas();

  // ---- Render Loop ----
  function render(){
    ctx.clearRect(0,0,WORLD_W,WORLD_H);

    // ターゲット
    const tgt = ACTIVE_PUZZLES[state.puzzleIndex].target;
    drawPolygon(ctx, tgt, '#2b2b2b', '#444', 2);

    // フラッシュ表示（正解シルエットを一瞬重ねる）
    if (state.flashUntil && Date.now() < state.flashUntil) {
      ctx.save();
      drawPolygon(ctx, tgt, 'rgba(255,255,255,0.25)', '#ff4444', 6);
      ctx.restore();
    }

    // ピース
    const ts=state.pieces.map(p=>({...p,world:transform(p.shape,p.offset,p.angle,p.flipped)}));
    ts.forEach(p=>{ ctx.save(); ctx.shadowColor='rgba(0,0,0,.22)'; ctx.shadowBlur=8; ctx.shadowOffsetY=4; drawPolygon(ctx,p.world,p.color,'#1a1a1a',2); ctx.restore(); });
    if(state.selectedId!=null){ const p=ts.find(pp=>pp.id===state.selectedId); if(p){ ctx.save(); ctx.setLineDash([6,4]); drawPolygon(ctx,p.world,null,'#e5e7eb',2); ctx.restore(); } }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // ---- Hit Test ----
  function hitTest(x,y){
    for(let i=state.pieces.length-1;i>=0;i--){
      const p=state.pieces[i], world=transform(p.shape,p.offset,p.angle,p.flipped);
      drawPath(ctx,world); if(ctx.isPointInPath(x,y)) return p.id;
    }
    return null;
  }

  // ---- Pointer Drag ----
  const drag={active:false,id:null,last:[0,0]};
  function canvasXY(e){ const r=canvas.getBoundingClientRect(); const sx=canvas.width/r.width, sy=canvas.height/r.height; return [(e.clientX-r.left)*sx,(e.clientY-r.top)*sy]; }
  canvas.addEventListener('pointerdown',e=>{
    if(state.step!=='play') return; e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const [x,y]=canvasXY(e); const id=hitTest(x,y);
    if(id!=null){ drag.active=true; drag.id=id; drag.last=[x,y]; state.selectedId=id; const idx=state.pieces.findIndex(p=>p.id===id); const [pk]=state.pieces.splice(idx,1); state.pieces.push(pk); }
  },{passive:false});
  canvas.addEventListener('pointermove',e=>{
    if(!drag.active) return; e.preventDefault();
    const [x,y]=canvasXY(e); const dx=x-drag.last[0], dy=y-drag.last[1]; drag.last=[x,y];
    const id=drag.id; state.pieces=state.pieces.map(p=>p.id===id?{...p,offset:[p.offset[0]+dx,p.offset[1]+dy]}:p);
  },{passive:false});
  canvas.addEventListener('pointerup',e=>{
    if(!drag.active) return; e.preventDefault();
    const id=drag.id; drag.active=false; drag.id=null; drag.last=[0,0];
    const me=state.pieces.find(p=>p.id===id); const myPts=transform(me.shape,me.offset,me.angle,me.flipped);
    const targetPts=ACTIVE_PUZZLES[state.puzzleIndex].target;
    const others=state.pieces.filter(p=>p.id!==id).flatMap(p=>transform(p.shape,p.offset,p.angle,p.flipped));
    const snaps=[...targetPts,...others]; let best=null, bestD2=SNAP_DISTANCE*SNAP_DISTANCE;
    for(const mp of myPts){ for(const tp of snaps){ const d2=distanceSq(mp,tp); if(d2<bestD2){bestD2=d2; best=[tp[0]-mp[0],tp[1]-mp[1]];} } }
    if(best){ me.offset=[me.offset[0]+best[0], me.offset[1]+best[1]]; }
  },{passive:false});
  canvas.addEventListener('pointercancel',()=>{ drag.active=false; drag.id=null; drag.last=[0,0]; },{passive:false});

  // ---- Rotate / Flip ----
  function rotateSelected(){ if(state.selectedId==null) return; state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,angle:(p.angle+45)%360}:p); }
  function flipSelected(){ if(state.selectedId==null) return; state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,flipped:!p.flipped}:p); }
  window.addEventListener('keydown',(e)=>{ if(state.step!=='play'||state.selectedId==null) return; if(e.key==='r'||e.key==='R') rotateSelected(); if(e.key==='f'||e.key==='F') flipSelected(); });

  // ---- Judge（AA耐性：整数化 + 3px拡張）----
  function drawDilated(ctx, pts, dilatePx){
    drawPath(ctx, pts); ctx.fillStyle='#000'; ctx.fill();
    if(dilatePx>0){ ctx.lineWidth=dilatePx*2; ctx.lineJoin='miter'; ctx.miterLimit=8; ctx.strokeStyle='#000'; ctx.stroke(); }
  }
  function judge(){
    const tol=3; // pxバッファ
    const tgt = roundPts(ACTIVE_PUZZLES[state.puzzleIndex].target);
    const polys = state.pieces.map(p=> roundPts(transform(p.shape,p.offset,p.angle,p.flipped)));

    ctxT.clearRect(0,0,WORLD_W,WORLD_H);
    ctxU.clearRect(0,0,WORLD_W,WORLD_H);
    ctxUd.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);

    drawDilated(ctxT, tgt, tol);                 // T_expanded
    polys.forEach(poly => drawDilated(ctxU,  poly, 0));   // U
    polys.forEach(poly => drawDilated(ctxUd, poly, tol)); // U_expanded

    // outside = U - T_expanded
    ctxX.drawImage(offU,0,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(offT,0,0);
    ctxX.globalCompositeOperation='source-over';
    const outside = alphaCount(ctxX,WORLD_W,WORLD_H);

    // gaps = T - U_expanded
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);
    drawDilated(ctxX, tgt, 0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(offUd,0,0);
    ctxX.globalCompositeOperation='source-over';
    const gaps = alphaCount(ctxX,WORLD_W,WORLD_H);

    // overlaps = sum(piece) - union(U)
    const unionArea = alphaCount(ctxU,WORLD_W,WORLD_H);
    let sum=0; for(const poly of polys){ ctxX.clearRect(0,0,WORLD_W,WORLD_H); drawDilated(ctxX, poly, 0); sum+=alphaCount(ctxX,WORLD_W,WORLD_H); }
    const overlap = Math.max(0, sum - unionArea);

    const OUT_TOL=2000, AREA_TOL=4000;
    if(outside>OUT_TOL) return {ok:false,reason:'枠外に出ています。'};
    if(overlap>AREA_TOL) return {ok:false,reason:'ピースが重なっています。'};
    if(gaps>AREA_TOL)    return {ok:false,reason:'隙間があります。'};
    return {ok:true};
  }

  // ---- Timer ----
  const timerEl=$id('timer'); let startAt=0;
  function updateTimer(){ if(timerEl) timerEl.textContent=fmtTime(state.elapsed); }
  function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }
  function resetTimer(){ stopTimer(); state.elapsed=0; updateTimer(); }
  function startTimer(){ stopTimer(); startAt=Date.now(); state.timerId=setInterval(()=>{ state.elapsed=Math.floor((Date.now()-startAt)/1000); updateTimer(); },500); }

  // ---- UI ----
  const playerInput=$id('player'), puzzleSelect=$id('puzzleSelect'), puzzleTitle=$id('puzzleTitle');
  function setPuzzleTitle(){ if(puzzleTitle) puzzleTitle.textContent=ACTIVE_PUZZLES[state.puzzleIndex].title; }

  const bind=(id,ev,fn)=>{ const el=$id(id); if(el) el.addEventListener(ev,fn,{passive:false}); };
  bind('start','click', startSeries);
  bind('judge','click', onJudge);
  bind('rotate','click', rotateSelected);
  bind('flip','click',   flipSelected);
  bind('rotateMobile','click', rotateSelected);
  bind('flipMobile',  'click',  flipSelected);

  // パズル開始時に“答え”を一瞬表示
  function flashIfNeeded(){
    if (!FLASH_FLAGS[state.puzzleIndex]) return;
    const until = Date.now() + FLASH_MS;
    state.flashUntil = until;
    setTimeout(()=>{ if(state.flashUntil===until) state.flashUntil=0; }, FLASH_MS + 30);
  }

  function startSeries(){
    if(!playerInput || !playerInput.value.trim()){ alert('名前を入力してください'); return; }

    // パターン選択（Aのみ実装）
    const patA = document.getElementById('patternA');
    state.pattern = (patA && patA.checked) ? 'A' : 'A';
    configurePatternA();

    state.step='play';
    state.results=[];
    state.puzzleIndex=0;
    if (puzzleSelect) puzzleSelect.value='0';
    setPuzzleTitle(); resetPieces(); resetTimer(); startTimer();
    flashIfNeeded();
  }

  function onJudge(){
    const r=judge(); if(!r.ok){ alert('不正解：'+r.reason); return; }
    stopTimer();

    // 記録：必要に応じて sendResults() でスプシへ（今はローカルのみ）
    state.results.push({
      puzzleIndex: state.puzzleIndex + 1,
      flashed: !!FLASH_FLAGS[state.puzzleIndex],
      timeSec: state.elapsed
    });

    if(state.puzzleIndex<ACTIVE_PUZZLES.length-1){
      alert(`CLEAR!\n課題: ${ACTIVE_PUZZLES[state.puzzleIndex].title}\nタイム: ${state.elapsed}秒`);
      state.puzzleIndex++;
      if (puzzleSelect) puzzleSelect.value=String(state.puzzleIndex);
      setPuzzleTitle(); resetPieces(); resetTimer(); startTimer();
      flashIfNeeded();
    }else{
      const total=state.results.reduce((a,b)=>a+b.timeSec,0);
      alert(`10問クリア！合計: ${total} 秒`);
      state.step='finished';
    }
  }

  // ---- init ----
  // Aを標準で構成してUIを整える（開始前にセレクトへ反映）
  const puzzleSelect = $id('puzzleSelect'); // 再取得しておく
  configurePatternA();
  setPuzzleTitle();
  resetPieces();
  updateTimer();

  // ショートカット表記（PC向け）
  (function addShortcutHint(){
    const host=$id('ui')||document.body;
    const hint=document.createElement('div');
    hint.textContent='ショートカット：回転 R / 反転 F';
    hint.style.cssText='margin:4px 0;font-size:12px;color:#374151;opacity:.8;';
    host.appendChild(hint);
  })();
});
