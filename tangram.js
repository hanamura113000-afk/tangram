// Tangram A (HTML5 Canvas) – AA耐性付き & ショートカット表記対応
// - 判定時に頂点を整数へ丸めてAAノイズを低減
// - 判定トレランス調整（誤検知を防ぐ）
// - オフスクリーンで imageSmoothingEnabled=false
// - DPRスケール無し / canvasXYで座標正規化
// - pointerはpreventDefault + passive:false
// - UI要素が無くても落ちない（null安全）
// - #timerが無くてもOK

document.addEventListener('DOMContentLoaded', () => {
  // ====== 送信先（必要なら設定） ======
  const ENDPOINT_URL = 'PUT_APPS_SCRIPT_WEB_APP_URL_HERE';
  const POST_TOKEN   = 'PUT_RANDOM_TOKEN_HERE';
  const APP_VERSION  = 'tangramA-html5-1.0.1';

  // ====== 定数 ======
  const WORLD_W = 1500;
  const WORLD_H = 900;
  const SNAP_DISTANCE = 25;

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
    { title: "アヒル", target: [[482,394],[588,288],[800,288],[800,182],[906,182],[1012,182],[906,288],[906,394],[800,500],[588,500]] },
    { title: "凹み",   target: [[482,182],[588,182],[588,394],[800,394],[800,182],[906,182],[906,500],[482,500]] },
    { title: "家",     target: [[694,76],[906,288],[800,288],[800,500],[588,500],[588,288],[482,288]] },
    { title: "コマ",   target: [[482,394],[588,288],[641,288],[641,182],[747,182],[747,288],[800,288],[906,394],[694,606]] },
    { title: "サカナ", target: [[332,356],[544,356],[619,281],[469,281],[544,206],[694,206],[844,356],[694,506],[694,612],[588,612],[694,506],[619,431],[544,506],[394,506],[438,462]] },
  ];

  // ====== ユーティリティ ======
  const $id = (id) => document.getElementById(id);
  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const deg2rad = (d) => d * Math.PI / 180;
  const roundPts = (poly) => poly.map(([x,y]) => [Math.round(x), Math.round(y)]); // ← 追加（AA対策）
  function centroid(pts){ let sx=0, sy=0; for(const [x,y] of pts){ sx+=x; sy+=y; } return [sx/pts.length, sy/pts.length]; }
  function transform(points, offset, angle, flipped){
    const [cx,cy]=centroid(points); const a=deg2rad(angle); const c=Math.cos(a), s=Math.sin(a);
    return points.map(([x,y])=>{
      let dx=x-cx, dy=y-cy; if(flipped) dx=-dx;
      const xr=dx*c-dy*s, yr=dx*s+dy*c;
      return [xr+cx+offset[0], yr+cy+offset[1]];
    });
  }
  function distanceSq(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx + dy*dy; }
  function drawPolygon(ctx, pts, fillStyle=null, strokeStyle="#222", lineWidth=2){
    if(!pts.length) return;
    ctx.beginPath();
    for(let i=0;i<pts.length;i++){ const [x,y]=pts[i]; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.closePath();
    if(fillStyle){ ctx.fillStyle=fillStyle; ctx.fill(); }
    if(strokeStyle && lineWidth){ ctx.strokeStyle=strokeStyle; ctx.lineWidth=lineWidth; ctx.stroke(); }
  }
  function alphaCount(ctx, w, h){ const data=ctx.getImageData(0,0,w,h).data; let c=0; for(let i=3;i<data.length;i+=4){ if(data[i]!==0) c++; } return c; }

  // ====== ステート ======
  const state = {
    pieces: [],
    selectedId: null,
    puzzleIndex: 0,
    step: 'home',
    results: [],
    elapsed: 0,
    timerId: null,
  };

  function resetPieces(){
    state.pieces = TANGRAM_PIECES.map((shape,i)=>({
      id:i, shape:shape.map(([x,y])=>[x,y]),
      color:COLORS[i%COLORS.length],
      offset:[80 + i*200, 680],
      angle:0, flipped:false,
    }));
    state.selectedId = null;
  }

  // ====== Canvas ======
  const canvas = $id('game');
  if (!canvas) { alert('canvas#game が見つかりません。index.html を確認してください。'); return; }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.style.touchAction = 'none'; // モバイルでスクロールよりドラッグ優先

  // オフスクリーン（判定用）
  const offT = document.createElement('canvas'); offT.width = WORLD_W; offT.height = WORLD_H; const ctxT = offT.getContext('2d', { willReadFrequently:true });
  const offU = document.createElement('canvas'); offU.width = WORLD_W; offU.height = WORLD_H; const ctxU = offU.getContext('2d', { willReadFrequently:true });
  const tmp  = document.createElement('canvas'); tmp.width  = WORLD_W; tmp.height  = WORLD_H; const ctxX = tmp.getContext('2d',  { willReadFrequently:true });
  // ベクタ塗りには直接効きませんが、画像合成の補間を抑えるために設定
  ctxT.imageSmoothingEnabled = false;
  ctxU.imageSmoothingEnabled = false;
  ctxX.imageSmoothingEnabled = false;

  // DPRスケール無し（論理解像度=描画解像度）
  function resizeCanvas(){
    canvas.width  = WORLD_W;
    canvas.height = WORLD_H;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ====== 描画ループ ======
  function render(){
    ctx.clearRect(0,0,WORLD_W,WORLD_H);
    // target
    drawPolygon(ctx, PUZZLES[state.puzzleIndex].target, '#2b2b2b', '#444', 2);
    // pieces
    const ts = state.pieces.map(p=>({...p, world: transform(p.shape,p.offset,p.angle,p.flipped)}));
    ts.forEach(p=>{
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.22)';
      ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
      drawPolygon(ctx, p.world, p.color, '#1a1a1a', 2);
      ctx.restore();
    });
    // selection
    if(state.selectedId!=null){
      const p = ts.find(pp=>pp.id===state.selectedId);
      if(p){ ctx.save(); ctx.setLineDash([6,4]); drawPolygon(ctx,p.world,null,'#e5e7eb',2); ctx.restore(); }
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // ====== ヒットテスト ======
  function hitTest(x,y){
    for(let i=state.pieces.length-1;i>=0;i--){
      const p = state.pieces[i];
      const world = transform(p.shape,p.offset,p.angle,p.flipped);
      ctx.beginPath();
      world.forEach(([px,py],j)=> j?ctx.lineTo(px,py):ctx.moveTo(px,py));
      ctx.closePath();
      if (ctx.isPointInPath(x,y)) return p.id;
    }
    return null;
  }

  // ====== Pointer（ドラッグ） ======
  const drag = { active:false, id:null, last:[0,0] };

  // CSSピクセル → キャンバス座標へ正規化
  function canvasXY(e){
    const r  = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    const x = (e.clientX - r.left) * sx;
    const y = (e.clientY - r.top)  * sy;
    return [x,y];
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (state.step !== 'play') return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const [x,y] = canvasXY(e);
    const id = hitTest(x,y);
    if (id != null) {
      drag.active = true; drag.id = id; drag.last = [x,y];
      state.selectedId = id;
      // bring to front
      const idx = state.pieces.findIndex(p=>p.id===id);
      const [picked] = state.pieces.splice(idx,1);
      state.pieces.push(picked);
    }
  }, { passive:false });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    e.preventDefault();
    const [x,y] = canvasXY(e);
    const dx = x - drag.last[0], dy = y - drag.last[1];
    drag.last = [x,y];
    const id = drag.id;
    state.pieces = state.pieces.map(p => p.id===id ? {...p, offset:[p.offset[0]+dx, p.offset[1]+dy]} : p);
  }, { passive:false });

  canvas.addEventListener('pointerup', (e) => {
    if (!drag.active) return;
    e.preventDefault();
    const id = drag.id;
    drag.active=false; drag.id=null; drag.last=[0,0];

    // snap
    const me = state.pieces.find(p=>p.id===id);
    const myPts = transform(me.shape, me.offset, me.angle, me.flipped);
    const targetPts = PUZZLES[state.puzzleIndex].target;
    const others = state.pieces.filter(p=>p.id!==id).flatMap(p=> transform(p.shape,p.offset,p.angle,p.flipped));
    const snaps = [...targetPts, ...others];
    let best=null, bestD2 = SNAP_DISTANCE*SNAP_DISTANCE;
    for(const mp of myPts){
      for(const tp of snaps){
        const d2 = distanceSq(mp,tp);
        if(d2<bestD2){ bestD2=d2; best=[tp[0]-mp[0], tp[1]-mp[1]]; }
      }
    }
    if(best){ me.offset=[me.offset[0]+best[0], me.offset[1]+best[1]]; }
  }, { passive:false });

  canvas.addEventListener('pointercancel', () => {
    drag.active=false; drag.id=null; drag.last=[0,0];
  }, { passive:false });

  // ====== 回転・反転（キーボード） ======
  function rotateSelected(){
    if(state.selectedId==null) return;
    state.pieces = state.pieces.map(p => p.id===state.selectedId ? {...p, angle:(p.angle+45)%360} : p);
  }
  function flipSelected(){
    if(state.selectedId==null) return;
    state.pieces = state.pieces.map(p => p.id===state.selectedId ? {...p, flipped:!p.flipped} : p);
  }
  window.addEventListener('keydown', (e)=>{
    if(state.step!=='play' || state.selectedId==null) return;
    if(e.key==='r' || e.key==='R') rotateSelected();
    if(e.key==='f' || e.key==='F') flipSelected();
  });

  // ====== 判定（AA耐性） ======
  function judge(){
    ctxT.clearRect(0,0,WORLD_W,WORLD_H);
    ctxU.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);

    // target（頂点を整数へ丸める）
    const tgtRounded = roundPts(PUZZLES[state.puzzleIndex].target);
    ctxT.fillStyle='#000';
    drawPolygon(ctxT, tgtRounded, '#000', null, 0);

    // union of pieces（各ピースも整数グリッドへ）
    const polys = state.pieces.map(p=> roundPts(transform(p.shape,p.offset,p.angle,p.flipped)));
    ctxU.fillStyle='#000';
    polys.forEach(poly => drawPolygon(ctxU, poly, '#000', null, 0));

    // outside = U - T
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.drawImage(offU,0,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(offT,0,0);
    ctxX.globalCompositeOperation='source-over';
    const outside = alphaCount(ctxX, WORLD_W, WORLD_H);

    // gaps = T - U
    ctxX.clearRect(0,0,WORLD_W,WORLD_H);
    ctxX.drawImage(offT,0,0);
    ctxX.globalCompositeOperation='destination-out';
    ctxX.drawImage(offU,0,0);
    ctxX.globalCompositeOperation='source-over';
    const gaps = alphaCount(ctxX, WORLD_W, WORLD_H);

    // overlaps = sum(piece) - union
    const unionArea = alphaCount(ctxU, WORLD_W, WORLD_H);
    let sum = 0;
    for(const poly of polys){
      ctxX.clearRect(0,0,WORLD_W,WORLD_H);
      drawPolygon(ctxX, poly, '#000', null, 0);
      sum += alphaCount(ctxX, WORLD_W, WORLD_H);
    }
    const overlap = Math.max(0, sum - unionArea);

    // ★トレランス（AAノイズ吸収のため少し広め）
    const OUT_TOL  = 1500;  // はみ出し許容
    const AREA_TOL = 3000;  // 隙間/重なり許容

    if (outside > OUT_TOL) return { ok:false, reason:'枠外に出ています。' };
    if (overlap > AREA_TOL) return { ok:false, reason:'ピースが重なっています。' };
    if (gaps    > AREA_TOL) return { ok:false, reason:'隙間があります。' };
    return { ok:true };
  }

  // ====== タイマー（#timer が無くてもOK） ======
  const timerEl = $id('timer');
  let startAt = 0;
  function updateTimer(){ if (timerEl) timerEl.textContent = fmtTime(state.elapsed); }
  function stopTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }
  function resetTimer(){ stopTimer(); state.elapsed = 0; updateTimer(); }
  function startTimer(){
    stopTimer(); startAt = Date.now();
    state.timerId = setInterval(()=>{ state.elapsed = Math.floor((Date.now()-startAt)/1000); updateTimer(); }, 500);
  }

  // ====== UI（存在しない要素はスキップ） ======
  const playerInput  = $id('player');
  const puzzleSelect = $id('puzzleSelect');
  const puzzleTitle  = $id('puzzleTitle');

  function setPuzzleTitle(){ if(puzzleTitle) puzzleTitle.textContent = PUZZLES[state.puzzleIndex].title; }

  if (puzzleSelect) {
    puzzleSelect.innerHTML = '';
    PUZZLES.forEach((p,i)=>{
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `${i+1}. ${p.title}`;
      puzzleSelect.appendChild(opt);
    });
    puzzleSelect.addEventListener('change', () => {
      state.puzzleIndex = Number(puzzleSelect.value);
      setPuzzleTitle(); resetPieces(); resetTimer();
    });
  } else {
    state.puzzleIndex = 0;
  }

  const bind = (id, ev, fn) => { const el=$id(id); if(el) el.addEventListener(ev, fn, { passive:false }); };
  bind('start','click', startSeries);
  bind('judge','click', onJudge);
  bind('rotate','click', rotateSelected);
  bind('flip','click',   flipSelected);
  bind('reset','click',  () => resetPieces());
  bind('saveCsv','click', exportCSV);
  bind('send','click',   sendResults);

  // ====== ゲーム進行 ======
  function startSeries(){
    if(!playerInput || !playerInput.value.trim()){
      alert('名前を入力してください'); return;
    }
    state.step='play';
    state.results=[];
    if (puzzleSelect) state.puzzleIndex = Number(puzzleSelect.value);
    setPuzzleTitle();
    resetPieces(); resetTimer(); startTimer();
  }

  function onJudge(){
    const r = judge();
    if(!r.ok){ alert('不正解：' + r.reason); return; }
    stopTimer(); state.results.push(state.elapsed);

    if(state.puzzleIndex < PUZZLES.length-1){
      alert(`CLEAR!\n課題: ${PUZZLES[state.puzzleIndex].title}\nタイム: ${state.elapsed}秒`);
      state.puzzleIndex++;
      if (puzzleSelect) puzzleSelect.value = String(state.puzzleIndex);
      setPuzzleTitle(); resetPieces(); resetTimer(); startTimer();
    } else {
      alert(`5問クリア！合計: ${state.results.reduce((a,b)=>a+b,0)} 秒`);
      state.step='finished';
    }
  }

  async function sendResults(){
    if(state.results.length===0){ alert('まずは問題をクリアしてください。'); return; }
    const payload = {
      token: POST_TOKEN,
      playerName: playerInput ? playerInput.value.trim() : '',
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
    const row = [playerInput ? playerInput.value.trim() : '', ...state.results, total];
    const csv = [headers.join(','), row.join('\n').replace(/\n/g, ' ')].join('\n'); // シンプルCSV
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=shift_jis' });
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='result.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ====== 初期化 ======
  resetPieces();
  setPuzzleTitle();
  updateTimer();

  // ====== 画面にショートカット表記を出す（HTMLに無くても自動追加） ======
  (function addShortcutHint(){
    const host = $id('ui') || document.body;
    const hint = document.createElement('div');
    hint.textContent = 'ショートカット：回転 R / 反転 F';
    hint.style.cssText = 'margin:8px 0; font-size:12px; opacity:.8;';
    host.appendChild(hint);
  })();
});
