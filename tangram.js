// Tangram – 正解レイアウトを一瞬だけ表示（画像不使用） + 管理者保存 + スマホどこでもドラッグ
// モバイルで 3,2,1 とフラッシュが見えない問題を修正（強制リフロー & 表示待機/凍結）

document.addEventListener('DOMContentLoaded', () => {
  const APP_VERSION  = 'tangramAB-2.2.0';
  const WORLD_W=1500, WORLD_H=900, SNAP_DISTANCE=25;

  // ---- パズル定義（省略なくそのまま） ----
  const PUZZLES_A = [
    { title: "アヒル", target: [[482,394],[588,288],[800,288],[800,182],[906,182],[1012,182],[906,288],[906,394],[800,500],[588,500]] },
    { title: "凹み",   target: [[482,182],[588,182],[588,394],[800,394],[800,182],[906,182],[906,500],[482,500]] },
    { title: "家",     target: [[694,76],[906,288],[800,288],[800,500],[588,500],[588,288],[482,288]] },
    { title: "コマ",   target: [[482,394],[588,288],[641,288],[641,182],[747,182],[747,288],[800,288],[906,394],[694,606]] },
    { title: "サカナ", target: [[332,356],[544,356],[619,281],[469,281],[544,206],[694,206],[844,356],[694,506],[694,612],[588,612],[694,506],[619,431],[544,506],[394,506],[438,462]] },
  ];
  const PUZZLES_B2 = [
    { title: "狐",     target: [[270,288],[376,394],[482,394],[694,394],[800,394],[800,288],[906,394],[981,319],[981,469],[906,544],[831,469],[694,606],[694,544],[544,544],[482,606],[482,394],[376,288]] },
    { title: "猫",     target: [[244,288],[350,288],[456,394],[456,244],[756,244],[831,319],[831,169],[906,244],[981,169],[981,319],[906,394],[606,394],[456,394],[350,394]] },
    { title: "ライオン", target: [[482,288],[588,182],[694,288],[694,394],[906,394],[1012,288],[1012,394],[1056,394],[1131,469],[981,469],[1056,544],[756,544],[694,606],[694,500],[588,394],[588,288]] },
    { title: "ネッシー", target: [[257,425],[363,319],[469,319],[681,319],[756,244],[831,319],[906,244],[981,319],[906,394],[1012,394],[1012,500],[906,500],[906,544],[756,394],[606,394],[469,531],[469,319],[363,425]] },
    { title: "魚B",    target: [[482,288],[694,288],[588,182],[694,182],[906,394],[696,606],[588,606],[694,500],[482,500],[588,394]] },
  ];
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

  const FLASH_FLAGS = [...new Array(PUZZLES_A.length).fill(false), ...new Array(PUZZLES_B2.length).fill(true)];
  const COUNT_STEP_MS = 700;  // 3→2→1
  const FLASH_MS      = 1000; // 正解の見せ時間

  // ---- DOM ----
  const $id = id => document.getElementById(id);
  const startScreen=$id('startScreen'), playerEntry=$id('playerEntry'), patternAEntry=$id('patternAEntry'), startGo=$id('startGo');
  const primeScreen=$id('primeScreen'), primeGo=$id('primeGo');
  const countScreen=$id('countScreen'), countdownEl=$id('countdown');
  const uiToolbar=$id('ui'), stageWrap=$id('stageWrap'), mobileCtrls=$id('mobileControls');
  const playerInput=$id('player'), patternA=$id('patternA'), patternB=$id('patternB'), puzzleTitle=$id('puzzleTitle'), timerEl=$id('timer');
  const saveLayoutBtn=$id('saveLayoutBtn'), adminBadge=$id('adminBadge');
  const ADMIN_MODE = location.search.includes('admin=1');
  if(ADMIN_MODE){ saveLayoutBtn.classList.remove('hidden'); adminBadge.classList.remove('hidden'); }

  // ---- 状態 ----
  const state={ pieces:[], selectedId:null, puzzleIndex:0, step:'home', results:[], elapsed:0, timerId:null, frozen:false };
  const ACTIVE_PUZZLES = PUZZLES_A.concat(PUZZLES_B2);

  // ---- レイアウト保存（IDキー）----
  const LKEY='tangramLayouts_v1';
  const loadLayouts=()=>{ try{ return JSON.parse(localStorage.getItem(LKEY)||'{}'); }catch(_){ return {}; } };
  const saveLayouts=obj=>localStorage.setItem(LKEY, JSON.stringify(obj));
  const getLayout=title=>(loadLayouts()[title]||null);
  function setLayout(title, byId){ const all=loadLayouts(); all[title]={v:1,byId}; saveLayouts(all); }

  // ---- Utils ----
  const fmtTime=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const deg=d=>d*Math.PI/180;
  function centroid(pts){let sx=0,sy=0;for(const [x,y] of pts){sx+=x;sy+=y}return [sx/pts.length,sy/pts.length]}
  function transform(points, offset, angle, flipped){ const [cx,cy]=centroid(points); const a=deg(angle), c=Math.cos(a), s=Math.sin(a);
    return points.map(([x,y])=>{let dx=x-cx,dy=y-cy; if(flipped) dx=-dx; const xr=dx*c-dy*s, yr=dx*s+dy*c; return [xr+cx+offset[0], yr+cy+offset[1]];});}
  function distanceSq(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; }
  function drawPath(ctx,pts){ ctx.beginPath(); pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y)); ctx.closePath(); }
  function drawPolygon(ctx,pts,fill=null,stroke="#222",lw=2){ if(!pts.length) return; drawPath(ctx,pts); if(fill){ctx.fillStyle=fill; ctx.fill();} if(stroke&&lw){ctx.strokeStyle=stroke; ctx.lineWidth=lw; ctx.stroke();} }
  const roundPts=poly=>poly.map(([x,y])=>[Math.round(x),Math.round(y)]);

  // ---- Canvas ----
  const canvas=$id('game'); if(!canvas){ alert('canvas #game が見つかりません'); return; }
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  canvas.style.touchAction='none';
  function resizeCanvas(){ canvas.width=WORLD_W; canvas.height=WORLD_H; }
  window.addEventListener('resize',resizeCanvas); resizeCanvas();

  // 判定オフスクリーン
  const offT=document.createElement('canvas'); offT.width=WORLD_W; offT.height=WORLD_H; const ctxT=offT.getContext('2d',{willReadFrequently:true});
  const offU=document.createElement('canvas'); offU.width=WORLD_W; offU.height=WORLD_H; const ctxU=offU.getContext('2d',{willReadFrequently:true});
  const offUd=document.createElement('canvas'); offUd.width=WORLD_W; offUd.height=WORLD_H; const ctxUd=offUd.getContext('2d',{willReadFrequently:true});
  const tmp=document.createElement('canvas'); tmp.width=WORLD_W; tmp.height=WORLD_H; const ctxX=tmp.getContext('2d',{willReadFrequently:true});
  ;[ctxT,ctxU,ctxUd,ctxX].forEach(c=>c.imageSmoothingEnabled=false);
  function alphaCount(ctx,w,h){ const d=ctx.getImageData(0,0,w,h).data; let c=0; for(let i=3;i<d.length;i+=4){ if(d[i]!==0) c++; } return c; }
  function drawDilated(ctx,pts,d){ drawPath(ctx,pts); ctx.fillStyle='#000'; ctx.fill(); if(d>0){ ctx.lineWidth=d*2; ctx.lineJoin='miter'; ctx.miterLimit=8; ctx.strokeStyle='#000'; ctx.stroke(); } }

  // ---- Pieces ----
  function resetPieces(){
    state.pieces=TANGRAM_PIECES.map((shape,i)=>({ id:i, shape:shape.map(([x,y])=>[x,y]), color:COLORS[i%COLORS.length],
      offset:[80+i*200,680], angle:0, flipped:false })); state.selectedId=null;
  }
  const copyPieces=arr=>arr.map(p=>({id:p.id,shape:p.shape.map(([x,y])=>[x,y]),color:p.color,offset:[...p.offset],angle:p.angle,flipped:p.flipped}));

  // ---- Render ----
  function render(){
    ctx.clearRect(0,0,WORLD_W,WORLD_H);
    const cur=ACTIVE_PUZZLES[state.puzzleIndex];
    drawPolygon(ctx,cur.target,'#2b2b2b','#444',2);
    const ts=state.pieces.map(p=>({...p,world:transform(p.shape,p.offset,p.angle,p.flipped)}));
    ts.forEach(p=>{ ctx.save(); ctx.shadowColor='rgba(0,0,0,.22)'; ctx.shadowBlur=8; ctx.shadowOffsetY=4; drawPolygon(ctx,p.world,p.color,'#1a1a1a',2); ctx.restore(); });
    if(state.selectedId!=null){ const p=ts.find(pp=>pp.id===state.selectedId); if(p){ ctx.save(); ctx.setLineDash([6,4]); drawPolygon(ctx,p.world,null,'#e5e7eb',2); ctx.restore(); } }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // ---- Input (どこでもドラッグ) ----
  function hitTest(x,y){
    for(let i=state.pieces.length-1;i>=0;i--){
      const p=state.pieces[i], world=transform(p.shape,p.offset,p.angle,p.flipped);
      drawPath(ctx,world); if(ctx.isPointInPath(x,y)) return p.id;
    } return null;
  }
  const drag={active:false,id:null,last:[0,0]};
  function canvasXY(e){ const r=canvas.getBoundingClientRect(); const sx=canvas.width/r.width, sy=canvas.height/r.height; return [(e.clientX-r.left)*sx,(e.clientY-r.top)*sy]; }

  canvas.addEventListener('pointerdown',e=>{
    if(state.step!=='play'||state.frozen) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const [x,y]=canvasXY(e); const id=hitTest(x,y); let moveId=id!=null?id:state.selectedId;
    if(moveId!=null){ drag.active=true; drag.id=moveId; drag.last=[x,y];
      if(id!=null){ state.selectedId=id; const idx=state.pieces.findIndex(p=>p.id===id); const [pk]=state.pieces.splice(idx,1); state.pieces.push(pk); }
    }
  },{passive:false});
  canvas.addEventListener('pointermove',e=>{
    if(!drag.active||state.frozen) return; e.preventDefault();
    const [x,y]=canvasXY(e); const dx=x-drag.last[0], dy=y-drag.last[1]; drag.last=[x,y];
    const id=drag.id; state.pieces=state.pieces.map(p=>p.id===id?{...p,offset:[p.offset[0]+dx,p.offset[1]+dy]}:p);
  },{passive:false});
  canvas.addEventListener('pointerup',e=>{
    if(!drag.active) return; e.preventDefault();
    const id=drag.id; drag.active=false; drag.id=null; drag.last=[0,0];
    const me=state.pieces.find(p=>p.id===id);
    const myPts=transform(me.shape,me.offset,me.angle,me.flipped);
    const targetPts=ACTIVE_PUZZLES[state.puzzleIndex].target;
    const others=state.pieces.filter(p=>p.id!==id).flatMap(p=>transform(p.shape,p.offset,p.angle,p.flipped));
    const snaps=[...targetPts,...others]; let best=null, bestD2=SNAP_DISTANCE*SNAP_DISTANCE;
    for(const mp of myPts){ for(const tp of snaps){ const d2=distanceSq(mp,tp); if(d2<bestD2){bestD2=d2; best=[tp[0]-mp[0],tp[1]-mp[1]];} } }
    if(best){ me.offset=[me.offset[0]+best[0], me.offset[1]+best[1]]; }
  },{passive:false});
  canvas.addEventListener('pointercancel',()=>{ drag.active=false; drag.id=null; drag.last=[0,0]; },{passive:false});

  function rotateSelected(){ if(state.selectedId==null||state.step!=='play'||state.frozen) return; state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,angle:(p.angle+45)%360}:p); }
  function flipSelected(){ if(state.selectedId==null||state.step!=='play'||state.frozen) return; state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,flipped:!p.flipped}:p); }
  $id('rotateMobile')?.addEventListener('click', rotateSelected);
  $id('flipMobile')?.addEventListener('click',  flipSelected);
  window.addEventListener('keydown',(e)=>{ if(state.step!=='play'||state.selectedId==null||state.frozen) return; if(e.key==='r'||e.key==='R') rotateSelected(); if(e.key==='f'||e.key==='F') flipSelected(); });

  // ---- Timer ----
  let startAt=0; function updateTimer(){ if(timerEl) timerEl.textContent=fmtTime(state.elapsed); }
  function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }
  function resetTimer(){ stopTimer(); state.elapsed=0; updateTimer(); }
  function startTimer(){ stopTimer(); startAt=Date.now(); state.timerId=setInterval(()=>{ state.elapsed=Math.floor((Date.now()-startAt)/1000); updateTimer(); },500); }
  function setPuzzleTitle(){ if(puzzleTitle) puzzleTitle.textContent=ACTIVE_PUZZLES[state.puzzleIndex].title; }

  // ---- カウントダウン（強制リフロー & 表示待機） ----
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function showOverlay(el){
    el.classList.remove('hidden');
    el.style.display='flex';          // 明示
    void el.offsetWidth;              // ★強制リフロー（iOS対策）
    await wait(50);                   // ★描画完了待ち
  }
  function hideOverlay(el){
    el.classList.add('hidden');
    el.style.display='';              // もとに戻す
  }
  async function countdown3(){
    await showOverlay(countScreen);
    countdownEl.textContent='3'; await wait(COUNT_STEP_MS);
    countdownEl.textContent='2'; await wait(COUNT_STEP_MS);
    countdownEl.textContent='1'; await wait(COUNT_STEP_MS);
    hideOverlay(countScreen);
  }

  // ---- フラッシュ（IDキーで復元） ----
  function copyPieces(arr){ return arr.map(p=>({id:p.id,shape:p.shape.map(([x,y])=>[x,y]),color:p.color,offset:[...p.offset],angle:p.angle,flipped:p.flipped})); }
  async function flashSolutionThen(cb){
    const title=ACTIVE_PUZZLES[state.puzzleIndex].title;
    const layoutObj=getLayout(title);
    if(!layoutObj||!layoutObj.byId){ cb?.(); return; }

    state.frozen=true;
    await countdown3();               // 3,2,1 を確実に見せる
    const backup=copyPieces(state.pieces);

    const byId=layoutObj.byId;
    state.pieces=state.pieces.map(p=>{
      const rec=byId[String(p.id)];
      return rec?{...p,offset:[rec.offset[0],rec.offset[1]],angle:rec.angle,flipped:!!rec.flipped}:p;
    });

    await wait(FLASH_MS);             // 正解を1秒見せる
    state.pieces=backup;
    state.frozen=false;
    cb?.();
  }

  // ---- 管理者保存（Alt+S） ----
  function saveCurrentAsAnswer(){
    const title=ACTIVE_PUZZLES[state.puzzleIndex].title;
    const byId={}; state.pieces.forEach(p=>{ byId[String(p.id)]={offset:[...p.offset],angle:p.angle,flipped:!!p.flipped}; });
    setLayout(title,byId);
    alert(`「${title}」の正解レイアウトを保存しました！（ID対応）`);
  }
  if(ADMIN_MODE){
    saveLayoutBtn.addEventListener('click',saveCurrentAsAnswer);
    window.addEventListener('keydown',(e)=>{ if(e.altKey&&(e.key==='s'||e.key==='S')) saveCurrentAsAnswer(); });
  }

  // ---- 判定（省略なし） ----
  function judge(){
    const tol=3;
    const tgt=roundPts(ACTIVE_PUZZLES[state.puzzleIndex].target);
    const polys=state.pieces.map(p=>roundPts(transform(p.shape,p.offset,p.angle,p.flipped)));

    ctxT.clearRect(0,0,WORLD_W,WORLD_H);
    ctxU.clearRect(0,0,WORLD_W,WORLD_H);
    ctxUd.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);

    drawDilated(ctxT,tgt,tol);
    polys.forEach(poly=>drawDilated(ctxU,poly,0));
    polys.forEach(poly=>drawDilated(ctxUd,poly,tol));

    ctxX.drawImage(offU,0,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(offT,0,0);
    ctxX.globalCompositeOperation='source-over';
    const outside=alphaCount(ctxX,WORLD_W,WORLD_H);

    ctxX.clearRect(0,0,WORLD_W,WORLD_H);
    drawDilated(ctxX,tgt,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(offUd,0,0);
    ctxX.globalCompositeOperation='source-over';
    const gaps=alphaCount(ctxX,WORLD_W,WORLD_H);

    const unionArea=alphaCount(ctxU,WORLD_W,WORLD_H);
    let sum=0; for(const poly of polys){ ctxX.clearRect(0,0,WORLD_W,WORLD_H); drawDilated(ctxX,poly,0); sum+=alphaCount(ctxX,WORLD_W,WORLD_H); }
    const overlap=Math.max(0,sum-unionArea);

    const OUT_TOL=2000, AREA_TOL=4000;
    if(outside>OUT_TOL) return {ok:false,reason:'枠外に出ています。'};
    if(overlap>AREA_TOL) return {ok:false,reason:'ピースが重なっています。'};
    if(gaps>AREA_TOL)    return {ok:false,reason:'隙間があります。'};
    return {ok:true};
  }

  // ---- 進行 ----
  $id('start')?.addEventListener('click',()=>{ if(state.step==='home') startFirstHalf(); });
  $id('judge')?.addEventListener('click',onJudge);

  function startFirstHalf(){ state.step='play'; state.results=[]; state.puzzleIndex=0; setPuzzleTitle(); resetPieces(); resetTimer(); startTimer(); }
  function startSecondHalf(){ state.step='play'; state.puzzleIndex=5; setPuzzleTitle(); resetPieces(); resetTimer(); flashSolutionThen(()=>{ startTimer(); }); }
  function onJudge(){
    const r=judge(); if(!r.ok){ alert('不正解：'+r.reason); return; }
    stopTimer();
    state.results.push({ puzzleIndex: state.puzzleIndex+1, flashed: !!FLASH_FLAGS[state.puzzleIndex], timeSec: state.elapsed });

    if(state.puzzleIndex===4){
      alert(`CLEAR!\n課題: ${ACTIVE_PUZZLES[state.puzzleIndex].title}\nタイム: ${state.elapsed}秒`);
      state.step='prime'; primeScreen.classList.remove('hidden'); return;
    }
    if(state.puzzleIndex<ACTIVE_PUZZLES.length-1){
      alert(`CLEAR!\n課題: ${ACTIVE_PUZZLES[state.puzzleIndex].title}\nタイム: ${state.elapsed}秒`);
      state.puzzleIndex++; setPuzzleTitle(); resetPieces(); resetTimer();
      if(FLASH_FLAGS[state.puzzleIndex]) flashSolutionThen(()=>{ startTimer(); }); else startTimer();
    }else{
      const total=state.results.reduce((a,b)=>a+b.timeSec,0);
      alert(`10問クリア！合計: ${total} 秒`); state.step='finished';
    }
  }

  // ---- 開始画面（IME/オートフィル対応）----
  function updateStartEnabled(){ const ok=playerEntry && playerEntry.value.trim().length>0; if(startGo) startGo.disabled=!ok; }
  ['input','change','keyup','compositionend','blur'].forEach(ev=>{ playerEntry?.addEventListener(ev,updateStartEnabled); });
  updateStartEnabled();

  startGo?.addEventListener('click',(e)=>{
    const name=(playerEntry?.value||'').trim();
    if(!name){ e.preventDefault(); playerEntry?.focus(); return; }
    playerInput.value=name;
    if(patternAEntry?.checked) patternA.checked=true;

    startScreen.classList.add('hidden');
    uiToolbar.classList.remove('hidden'); stageWrap.classList.remove('hidden'); mobileCtrls.classList.remove('hidden');
    startFirstHalf();
  });
  primeGo.addEventListener('click',()=>{ primeScreen.classList.add('hidden'); startSecondHalf(); });

  // ---- 初期 ----
  uiToolbar.classList.add('hidden'); stageWrap.classList.add('hidden'); mobileCtrls.classList.add('hidden');
  if(timerEl) timerEl.textContent='00:00'; setPuzzleTitle(); resetPieces();
});
