<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>タングラム実験（単一ファイル・埋め込みレイアウト版）</title>
<style>
  :root { color-scheme: light dark; }
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Noto Sans JP,Helvetica,Arial,sans-serif;background:#0b0b0b;color:#eaeaea}
  header{padding:12px 16px;border-bottom:1px solid #2a2a2a;background:#121212;display:flex;align-items:center;gap:10px}
  header h1{font-size:16px;margin:0;font-weight:600}
  main{display:grid;grid-template-columns:320px 1fr;min-height:calc(100vh - 54px)}
  aside{border-right:1px solid #2a2a2a;background:#121212;padding:16px}
  label{display:block;font-size:12px;margin:8px 0 4px;color:#c9c9c9}
  input,select,button{width:100%;padding:10px;border-radius:10px;border:1px solid #2a2a2a;background:#1a1a1a;color:#eaeaea}
  button.primary{background:#2563eb;border-color:#1d4ed8}
  button.row{width:auto}
  .row{display:flex;gap:8px;align-items:center}
  .hint{font-size:12px;color:#9aa0a6}
  .badge{display:inline-flex;padding:2px 8px;border:1px solid #2a2a2a;border-radius:999px;font-size:11px;background:#181818;color:#c9c9c9}
  canvas{display:block;width:100%;height:100%;background:#0f0f0f}
  .panel{padding:12px;border-bottom:1px solid #2a2a2a}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .hidden{display:none!important}
  #stageWrap{position:relative}
  #timerBox{position:absolute;top:12px;right:16px;background:#0b0b0bd0;border:1px solid #2a2a2a;border-radius:10px;padding:8px 10px;font-variant-numeric:tabular-nums}
  #titleBox{position:absolute;top:12px;left:16px;background:#0b0b0bd0;border:1px solid #2a2a2a;border-radius:10px;padding:8px 10px}
  #countScreen{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#000000c0;font-weight:800;font-size:96px}
  #primeScreen{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#000000c0}
  #primeScreen .box{background:#111;border:1px solid #2a2a2a;border-radius:16px;padding:24px;max-width:560px}
  #startScreen{display:block}
  .center{text-align:center}
</style>
</head>
<body>
  <header>
    <h1>タングラム実験（AB + 練習／埋め込みフラッシュ）</h1>
    <span id="adminBadge" class="badge hidden">admin</span>
  </header>
  <main>
    <aside>
      <section id="startScreen" class="panel">
        <label>参加者ID（必須：本番時）</label>
        <input id="playerEntry" placeholder="例：S01" />
        <div class="grid" style="margin-top:8px">
          <label class="row"><input id="patternAEntry" type="radio" name="pattern" checked> <span>パターンA（1-5 control / 6-10 prime）</span></label>
          <label class="row"><input id="patternBEntry" type="radio" name="pattern"> <span>パターンB（1-5 prime / 6-10 control）</span></label>
        </div>
        <label class="row" style="margin-top:8px"><input id="practiceEntry" type="checkbox"> <span>練習モードで開始（説明→通常→説明→フラッシュ→通常）</span></label>
        <button class="primary" style="margin-top:12px" onclick="__startGo()">スタート</button>
        <div class="hint" style="margin-top:8px">URLに <code>?admin=1</code> を付けると管理ボタンが出ます（この端末のlocalStorageへ保存可）。</div>
      </section>

      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <span>現在のパターン</span>
          <div class="row">
            <label class="row"><input id="patternA" type="radio" name="pattern2" checked disabled> A</label>
            <label class="row"><input id="patternB" type="radio" name="pattern2" disabled> B</label>
          </div>
        </div>
        <div class="grid" style="margin-top:8px">
          <button id="saveLayoutBtn" class="row hidden" onclick="__saveAnswer()">この配置を正解として保存</button>
          <span class="hint">※保存はこの端末のブラウザにのみ反映</span>
        </div>
      </section>

      <section class="panel">
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button class="row" onclick="__rotate()">回転(R)</button>
          <button class="row" onclick="__flip()">反転(F)</button>
          <button class="row" onclick="__judge()">判定</button>
        </div>
        <div class="hint" style="margin-top:6px">ドラッグで移動 / R で回転 / F で反転</div>
      </section>

      <section class="panel">
        <div class="hint">練習モード中は「リセット」「戻る」が表示されます</div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
          <button id="practiceReset" class="row hidden" onclick="__practiceReset()">リセット</button>
          <button id="practiceBack"  class="row hidden" onclick="__practiceBack()">スタートへ戻る</button>
        </div>
      </section>
    </aside>

    <section id="stageWrap">
      <div id="titleBox">課題：<span id="puzzleTitle">—</span></div>
      <div id="timerBox">タイム：<span id="timer">00:00</span></div>
      <canvas id="game"></canvas>
      <div id="countScreen"><span id="countdown">3</span></div>
      <div id="primeScreen"><div class="box center"><p>これから後半を開始します。<br>準備ができたら「開始」ボタンを押してください。</p><button class="primary" onclick="__primeGo()">開始</button></div></div>
    </section>
  </main>

<script>
// =========== ここから実装（単一ファイル版） ===========
// 端末・ブラウザに依存せず一瞬の答え表示（フラッシュ）を確実化するため、
// 正解レイアウトをコードに同梱し、requestAnimationFrame 同期＋実測で露光制御します。

/***** あなたが提供した JSON を同梱（タイトル完全一致が必要） *****/
const DEFAULT_LAYOUTS = {
  "アヒル": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          508.5786437626905,
          379.28932188134524
        ],
        "angle": 45,
        "flipped": false
      },
      "1": {
        "offset": [
          679.4873734152916,
          208.64466094067262
        ],
        "angle": 315,
        "flipped": false
      },
      "2": {
        "offset": [
          502.71067811865476,
          294
        ],
        "angle": 45,
        "flipped": false
      },
      "3": {
        "offset": [
          760.5533905932737,
          192.2233047033631
        ],
        "angle": 135,
        "flipped": false
      },
      "4": {
        "offset": [
          710.5533905932738,
          354.3553390593274
        ],
        "angle": 45,
        "flipped": false
      },
      "5": {
        "offset": [
          777.966991411009,
          190.96699141100896
        ],
        "angle": 45,
        "flipped": false
      },
      "6": {
        "offset": [
          793.5,
          197.4669914110089
        ],
        "angle": 315,
        "flipped": false
      }
    }
  },
  "凹み": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          402.71067811865476,
          379.28932188134524
        ],
        "angle": 45,
        "flipped": false
      },
      "1": {
        "offset": [
          785.2893218813452,
          279.28932188134524
        ],
        "angle": 45,
        "flipped": false
      },
      "2": {
        "offset": [
          643.9339828220178,
          329.3553390593274
        ],
        "angle": 315,
        "flipped": false
      },
      "3": {
        "offset": [
          477.71067811865476,
          192.35533905932738
        ],
        "angle": 225,
        "flipped": false
      },
      "4": {
        "offset": [
          710.2893218813452,
          248.2233047033631
        ],
        "angle": 45,
        "flipped": false
      },
      "5": {
        "offset": [
          777.966991411009,
          85.03300858899107
        ],
        "angle": 135,
        "flipped": false
      },
      "6": {
        "offset": [
          422.53300858899104,
          250.56601717798213
        ],
        "angle": 45,
        "flipped": false
      }
    }
  },
  "家": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          508.71067811865476,
          379.4213562373095
        ],
        "angle": 45,
        "flipped": false
      },
      "1": {
        "offset": [
          679.2893218813452,
          208.71067811865476
        ],
        "angle": 315,
        "flipped": false
      },
      "2": {
        "offset": [
          643.9339828220179,
          46.57864376269046
        ],
        "angle": 135,
        "flipped": false
      },
      "3": {
        "offset": [
          477.71067811865476,
          227.64466094067262
        ],
        "angle": 315,
        "flipped": false
      },
      "4": {
        "offset": [
          604.2893218813451,
          177.64466094067262
        ],
        "angle": 315,
        "flipped": false
      },
      "5": {
        "offset": [
          565.9009742330268,
          84.96699141100893
        ],
        "angle": 45,
        "flipped": false
      },
      "6": {
        "offset": [
          687.5,
          197.4669914110089
        ],
        "angle": 225,
        "flipped": true
      }
    }
  },
  "コマ": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          614.5786437626905,
          414.71067811865476
        ],
        "angle": 135,
        "flipped": false
      },
      "1": {
        "offset": [
          573.157287525381,
          314.7106781186548
        ],
        "angle": 315,
        "flipped": false
      },
      "2": {
        "offset": [
          538.0660171779821,
          258.6446609406726
        ],
        "angle": 135,
        "flipped": false
      },
      "3": {
        "offset": [
          583.5126265847083,
          298.2893218813453
        ],
        "angle": 225,
        "flipped": false
      },
      "4": {
        "offset": [
          604.223304703363,
          283.6446609406727
        ],
        "angle": 315,
        "flipped": false
      },
      "5": {
        "offset": [
          618.966991411009,
          84.96699141100893
        ],
        "angle": 45,
        "flipped": false
      },
      "6": {
        "offset": [
          687.5,
          303.53300858899104
        ],
        "angle": 45,
        "flipped": true
      }
    }
  },
  "サカナ": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          494.00000000000006,
          306
        ],
        "angle": 90,
        "flipped": false
      },
      "1": {
        "offset": [
          694,
          206
        ],
        "angle": 0,
        "flipped": false
      },
      "2": {
        "offset": [
          388.06601717798213,
          291.3553390593274
        ],
        "angle": 315,
        "flipped": false
      },
      "3": {
        "offset": [
          583.6446609406727,
          551.7106781186548
        ],
        "angle": 315,
        "flipped": false
      },
      "4": {
        "offset": [
          344,
          406
        ],
        "angle": 90,
        "flipped": false
      },
      "5": {
        "offset": [
          469,
          281
        ],
        "angle": 0,
        "flipped": false
      },
      "6": {
        "offset": [
          469,
          205.99999999999997
        ],
        "angle": 0,
        "flipped": true
      }
    }
  },
  "狐": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          402.5786437626905,
          414.71067811865476
        ],
        "angle": 135,
        "flipped": false
      },
      "1": {
        "offset": [
          714.5786437626905,
          314.71067811865476
        ],
        "angle": 225,
        "flipped": false
      },
      "2": {
        "offset": [
          594,
          394
        ],
        "angle": 270,
        "flipped": false
      },
      "3": {
        "offset": [
          760.3553390593274,
          333.71067811865476
        ],
        "angle": 45,
        "flipped": false
      },
      "4": {
        "offset": [
          831,
          319
        ],
        "angle": 0,
        "flipped": false
      },
      "5": {
        "offset": [
          831,
          319.00000000000006
        ],
        "angle": 0,
        "flipped": false
      },
      "6": {
        "offset": [
          263.3019484660536,
          303.46699141100896
        ],
        "angle": 45,
        "flipped": true
      }
    }
  },
  "猫": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          606,
          293.99999999999994
        ],
        "angle": 180,
        "flipped": false
      },
      "1": {
        "offset": [
          556,
          144
        ],
        "angle": 90,
        "flipped": false
      },
      "2": {
        "offset": [
          456,
          244
        ],
        "angle": 0,
        "flipped": false
      },
      "3": {
        "offset": [
          881,
          218.99999999999997
        ],
        "angle": 90,
        "flipped": false
      },
      "4": {
        "offset": [
          731,
          169
        ],
        "angle": 180,
        "flipped": false
      },
      "5": {
        "offset": [
          831,
          169
        ],
        "angle": 0,
        "flipped": false
      },
      "6": {
        "offset": [
          237.5,
          303.4669914110089
        ],
        "angle": 45,
        "flipped": true
      }
    }
  },
  "ライオン": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          614.5786437626905,
          414.71067811865476
        ],
        "angle": 135,
        "flipped": false
      },
      "1": {
        "offset": [
          856.0000000000001,
          344.00000000000006
        ],
        "angle": 270,
        "flipped": false
      },
      "2": {
        "offset": [
          538.0660171779821,
          152.64466094067265
        ],
        "angle": 135,
        "flipped": false
      },
      "3": {
        "offset": [
          901.7106781186549,
          333.6446609406727
        ],
        "angle": 315,
        "flipped": false
      },
      "4": {
        "offset": [
          533.7106781186548,
          354.3553390593274
        ],
        "angle": 135,
        "flipped": false
      },
      "5": {
        "offset": [
          565.8349570550447,
          190.9669914110089
        ],
        "angle": 135,
        "flipped": false
      },
      "6": {
        "offset": [
          906.0000000000001,
          394.00000000000006
        ],
        "angle": 0,
        "flipped": false
      }
    }
  },
  "ネッシー": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          389.5786437626905,
          339.71067811865476
        ],
        "angle": 135,
        "flipped": false
      },
      "1": {
        "offset": [
          706,
          193.99999999999994
        ],
        "angle": 270,
        "flipped": false
      },
      "2": {
        "offset": [
          806,
          344
        ],
        "angle": 180,
        "flipped": false
      },
      "3": {
        "offset": [
          806,
          294
        ],
        "angle": 90,
        "flipped": false
      },
      "4": {
        "offset": [
          806,
          244
        ],
        "angle": 180,
        "flipped": false
      },
      "5": {
        "offset": [
          884.033008588991,
          297.03300858899104
        ],
        "angle": 45,
        "flipped": false
      },
      "6": {
        "offset": [
          250.3019484660536,
          334.53300858899104
        ],
        "angle": 135,
        "flipped": false
      }
    }
  },
  "魚B": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          616.7106781186548,
          414.57864376269043
        ],
        "angle": 135,
        "flipped": false
      },
      "1": {
        "offset": [
          575.2893218813452,
          208.5126265847084
        ],
        "angle": 315,
        "flipped": false
      },
      "2": {
        "offset": [
          538,
          364.71067811865476
        ],
        "angle": 135,
        "flipped": false
      },
      "3": {
        "offset": [
          585.6446609406727,
          545.6446609406727
        ],
        "angle": 315,
        "flipped": false
      },
      "4": {
        "offset": [
          712.4213562373095,
          283.5126265847083
        ],
        "angle": 315,
        "flipped": false
      },
      "5": {
        "offset": [
          672.033008588991,
          191.03300858899104
        ],
        "angle": 45,
        "flipped": false
      },
      "6": {
        "offset": [
          581.5,
          197.46699141100893
        ],
        "angle": 45,
        "flipped": true
      }
    }
  },
  "練習（三角形）": {
    "v": 1,
    "byId": {
      "0": {
        "offset": [
          606,
          188
        ],
        "angle": 180,
        "flipped": false
      },
      "1": {
        "offset": [
          280,
          620
        ],
        "angle": 0,
        "flipped": false
      },
      "2": {
        "offset": [
          480,
          620
        ],
        "angle": 0,
        "flipped": false
      },
      "3": {
        "offset": [
          680,
          620
        ],
        "angle": 0,
        "flipped": false
      },
      "4": {
        "offset": [
          880,
          620
        ],
        "angle": 0,
        "flipped": false
      },
      "5": {
        "offset": [
          1080,
          620
        ],
        "angle": 0,
        "flipped": false
      },
      "6": {
        "offset": [
          1280,
          620
        ],
        "angle": 0,
        "flipped": false
      }
    }
  }
} ;

// タイトルの表記揺れを補正（必要に応じて追加）
const TITLE_ALIAS = {
  "魚": "魚B"
};
function normalizeTitle(t){ return TITLE_ALIAS[t] || t; }

// 目標形（ターゲット輪郭）：A(1-5) / B(6-10)
const WORLD_W=1500, WORLD_H=900, SNAP=25, CANVAS_Y_OFFSET=-60;
const COUNT_STEP_MS=700, FLASH_MS=100; // ★露光目標ms（ここを変えれば全端末に適用）
const DILATE_PX = Math.max(4, Math.round(window.devicePixelRatio * 2));

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
  { title: "魚",     target: [[482,288],[694,288],[588,182],[694,182],[906,394],[696,606],[588,606],[694,500],[482,500],[588,394]] },
];

// 練習（三角形）
const PRACTICE_PUZZLE = { title:'練習（三角形）', target:[[606,288],[756,138],[906,288]] };

// ピース形状（7つ）
const PIECES=[
  [[0,0],[300,0],[150,150]],
  [[0,0],[0,300],[150,150]],
  [[0,0],[150,150],[0,150]],
  [[0,0],[150,0],[75,75]],
  [[150,0],[150,150],[75,75]],
  [[0,150],[75,225],[150,150],[75,75]],
  [[0,0],[150,0],[225,75],[75,75]],
];
const COLORS=["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#9B59B6","#F39C12","#1ABC9C"];

// Sheets送信設定（必要な場合のみ使用）
const SHEETS_ENDPOINT = 'REPLACE_WITH_YOUR_GAS_URL';
const SHEETS_TOKEN    = 'REPLACE_WITH_YOUR_TOKEN';
function getDeviceCategory(){
  const ua = navigator.userAgent||'';
  if(/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'tablet';
  if(/iPhone|Android.+Mobile|Windows Phone|iPod/i.test(ua)) return 'mobile';
  return 'pc';
}
function buildRow(d){
  return {
    token:SHEETS_TOKEN,
    participant_id:d.participant_id,
    pattern:d.pattern,
    block_index:d.block_index,
    condition:d.condition,
    trial_index:d.trial_index,
    puzzle_title:d.puzzle_title,
    time_sec:d.time_sec,
    device_category:getDeviceCategory(),
    prime_exposure_ms:d.prime_exposure_ms
  };
}
async function postToSheets(payload){
  if(!SHEETS_ENDPOINT||SHEETS_ENDPOINT.includes('REPLACE')) return false; // 無効化
  try{
    await fetch(SHEETS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},mode:'no-cors',body:JSON.stringify(payload)});
    return true;
  }catch(_){return false;}
}

// DOM
const $=id=>document.getElementById(id);
const startScreen=$('startScreen');
const playerEntry=$('playerEntry');
const patternAEntry=$('patternAEntry');
const patternBEntry=$('patternBEntry');
const practiceEntry=$('practiceEntry');
const patternA=$('patternA');
const patternB=$('patternB');
const saveBtn=$('saveLayoutBtn');
const adminBadge=$('adminBadge');
const titleEl=$('puzzleTitle');
const timerEl=$('timer');
const countScreen=$('countScreen');
const countdownEl=$('countdown');
const primeScreen=$('primeScreen');
const stageWrap=$('stageWrap');
const canvas=$('game');
const ctx=canvas.getContext('2d',{willReadFrequently:true});

// admin 表示
const ADMIN=location.search.includes('admin=1');
if(ADMIN){ saveBtn.classList.remove('hidden'); adminBadge.classList.remove('hidden'); }

// LocalStorage（任意。無くても DEFAULT があるため動く）
const LKEY='tangramLayouts_v1';
let memStore={};
function loadLs(){ try{return JSON.parse(localStorage.getItem(LKEY)||'{}');}catch(_){return {...memStore};} }
function saveLs(o){ try{localStorage.setItem(LKEY,JSON.stringify(o));}catch(_){memStore={...o};} }
function setLayout(t,byId){ const all=loadLs(); all[t]={v:1,byId}; saveLs(all); }
function getLayout(raw){ const t=normalizeTitle(raw); const def=DEFAULT_LAYOUTS?.[t]; if(def&&def.byId) return def; const ls=loadLs(); return ls[t]||null; }

// 状態
const state={
  mode:'ab', // 'ab' or 'practice'
  practiceStage:0,
  pieces:[], selectedId:null, puzzleIndex:0,
  step:'home', results:[], elapsed:0, timerId:null, frozen:false,
  pattern:'A', lastPrimeExposureMs:0,
  blockFlash:false
};

// Canvas 初期化
function rez(){ canvas.width=WORLD_W; canvas.height=WORLD_H; }
window.addEventListener('resize',rez); rez();
const deg=d=>d*Math.PI/180;
const centroid=pts=>{let sx=0,sy=0;for(const [x,y] of pts){sx+=x;sy+=y}return[sx/pts.length,sy/pts.length]};
function transform(points,off,ang,flip){ const[cx,cy]=centroid(points); const a=deg(ang),c=Math.cos(a),s=Math.sin(a);
  return points.map(([x,y])=>{let dx=x-cx,dy=y-cy;if(flip)dx=-dx;const xr=dx*c-dy*s,yr=dx*s+dy*c;return[xr+cx+off[0],yr+cy+off[1]]}) }
const drawPath=(k,pts)=>{k.beginPath();pts.forEach(([x,y],i)=>i?k.lineTo(x,y):k.moveTo(x,y));k.closePath();}
const drawPoly=(k,pts,fill=null,stroke="#222",lw=2)=>{if(!pts.length)return;drawPath(k,pts);if(fill){k.fillStyle=fill;k.fill();}if(stroke&&lw){k.strokeStyle=stroke;k.lineWidth=lw;k.stroke();}}
const roundPts=poly=>poly.map(([x,y])=>[Math.round(x),Math.round(y)]);
const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

// 補助キャンバス
function mk(){const c=document.createElement('canvas');c.width=WORLD_W; c.height=WORLD_H; const k=c.getContext('2d',{willReadFrequently:true});k.imageSmoothingEnabled=false;return[c,k];}
const [cT,ctxT]=mk(),[cU,ctxU]=mk(),[cUd,ctxUd]=mk(),[tmp,ctxX]=mk();
const alphaCount=(k,w,h)=>{const d=k.getImageData(0,0,w,h).data;let c=0;for(let i=3;i<d.length;i+=4){if(d[i]!==0)c++;}return c;}
function drawDil(k,pts,px){ drawPath(k,pts); k.fillStyle='#000'; k.fill(); if(px>0){ k.lineWidth=px*2+1; k.lineJoin='round'; k.lineCap='round'; k.miterLimit=2; k.strokeStyle='#000'; k.stroke(); } }

// セット
function currentSets(){
  if(state.mode==='practice') return { ACTIVE:[PRACTICE_PUZZLE], FLASH:[false] };
  if(state.pattern==='B'){
    return { ACTIVE: PUZZLES_B.concat(PUZZLES_A), FLASH:[...new Array(PUZZLES_B.length).fill(false), ...new Array(PUZZLES_A.length).fill(true)] };
  } else {
    return { ACTIVE: PUZZLES_A.concat(PUZZLES_B), FLASH:[...new Array(PUZZLES_A.length).fill(false), ...new Array(PUZZLES_B.length).fill(true)] };
  }
}

// ピース初期化
function resetPieces(){
  state.pieces=PIECES.map((s,i)=>({ id:i, shape:s.map(([x,y])=>[x,y]), color:COLORS[i%COLORS.length], offset:[80+i*200, 620], angle:0, flipped:false }));
  state.selectedId=null;
}
const copyPieces=arr=>arr.map(p=>({id:p.id,shape:p.shape.map(([x,y])=>[x,y]),color:p.color,offset:[...p.offset],angle:p.angle,flipped:p.flipped}));

// レンダリング
function render(){
  const {ACTIVE}=currentSets();
  ctx.clearRect(0,0,WORLD_W,WORLD_H);
  ctx.save(); ctx.translate(0,CANVAS_Y_OFFSET);
  drawPoly(ctx, ACTIVE[state.puzzleIndex]?.target||[], '#202020', '#444', 2);
  const ts=state.pieces.map(p=>({...p,world:transform(p.shape,p.offset,p.angle,p.flipped)}));
  ts.forEach(p=>{ ctx.save(); ctx.shadowColor='rgba(0,0,0,.22)'; ctx.shadowBlur=8; ctx.shadowOffsetY=4; drawPoly(ctx,p.world,p.color,'#1a1a1a',2); ctx.restore(); });
  if(state.selectedId!=null){ const p=ts.find(pp=>pp.id===state.selectedId); if(p){ ctx.save(); ctx.setLineDash([6,4]); drawPoly(ctx,p.world,null,'#e5e7eb',2); ctx.restore(); } }
  ctx.restore();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// ヒットテスト
function hit(x,y){
  ctx.save(); ctx.translate(0,CANVAS_Y_OFFSET);
  for(let i=state.pieces.length-1;i>=0;i--){
    const p=state.pieces[i],w=transform(p.shape,p.offset,p.angle,p.flipped);
    drawPath(ctx,w); if(ctx.isPointInPath(x,y)){ ctx.restore(); return p.id; }
  }
  ctx.restore(); return null;
}
const drag={active:false,id:null,last:[0,0]};
function canvasXY(e){ const r=canvas.getBoundingClientRect(),sx=canvas.width/r.width,sy=canvas.height/r.height; return[(e.clientX-r.left)*sx,(e.clientY-r.top)*sy]; }
canvas.addEventListener('pointerdown',e=>{
  if(state.step!=='play'||state.frozen) return; e.preventDefault(); canvas.setPointerCapture(e.pointerId);
  const [x,y]=canvasXY(e); const id=hit(x,y); const moveId=id!=null?id:state.selectedId;
  if(moveId!=null){ drag.active=true; drag.id=moveId; drag.last=[x,y]; if(id!=null){ state.selectedId=id; const idx=state.pieces.findIndex(p=>p.id===id); const [pk]=state.pieces.splice(idx,1); state.pieces.push(pk);} }
},{passive:false});
canvas.addEventListener('pointermove',e=>{
  if(!drag.active||state.frozen) return; e.preventDefault(); const [x,y]=canvasXY(e); const dx=x-drag.last[0],dy=y-drag.last[1]; drag.last=[x,y];
  const id=drag.id; state.pieces=state.pieces.map(p=>p.id===id?{...p,offset:[p.offset[0]+dx,p.offset[1]+dy]}:p);
},{passive:false});
canvas.addEventListener('pointerup',e=>{
  if(!drag.active) return; e.preventDefault(); const id=drag.id; drag.active=false; drag.id=null; drag.last=[0,0];
  const {ACTIVE}=currentSets(); const me=state.pieces.find(p=>p.id===id);
  const myPts=transform(me.shape,me.offset,me.angle,me.flipped);
  const targetPts=ACTIVE[state.puzzleIndex].target;
  const others=state.pieces.filter(p=>p.id!==id).flatMap(p=>transform(p.shape,p.offset,p.angle,p.flipped));
  const snaps=[...targetPts,...others]; let best=null,bestD2=SNAP*SNAP;
  for(const mp of myPts){ for(const tp of snaps){ const d2=(mp[0]-tp[0])**2+(mp[1]-tp[1])**2; if(d2<bestD2){ bestD2=d2; best=[tp[0]-mp[0], tp[1]-mp[1]]; } } }
  if(best){ me.offset=[me.offset[0]+best[0], me.offset[1]+best[1]]; }
},{passive:false});
canvas.addEventListener('pointercancel',()=>{ drag.active=false; drag.id=null; drag.last=[0,0]; },{passive:false});

function __rotate(){ if(state.selectedId==null||state.step!=='play'||state.frozen) return; state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,angle:(p.angle+45)%360}:p); }
function __flip(){ if(state.selectedId==null||state.step!=='play'||state.frozen) return; state.pieces=state.pieces.map(p=>p.id===state.selectedId?{...p,flipped:!p.flipped}:p); }
window.__rotate=__rotate; window.__flip=__flip;

// タイマー
let startAt=0; function upd(){ if(timerEl) timerEl.textContent=fmt(state.elapsed); }
function stop(){ if(state.timerId){ clearInterval(state.timerId); state.timerId=null; } }
function resetTimer(){ stop(); state.elapsed=0; upd(); }
function startTimer(){ stop(); startAt=Date.now(); state.timerId=setInterval(()=>{ state.elapsed=Math.floor((Date.now()-startAt)/1000); upd(); },500); }
function setTitle(){ const {ACTIVE}=currentSets(); titleEl.textContent=ACTIVE[state.puzzleIndex]?.title||'—'; }

// 画面切替
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
function show(el){ el.classList.remove('hidden'); el.style.display='flex'; }
function hide(el){ el.classList.add('hidden'); el.style.display=''; }
function hideAllScreens(){ [startScreen,countScreen,primeScreen].forEach(hide); }

async function countdown3(){ show(countScreen); countdownEl.textContent='3'; await wait(COUNT_STEP_MS); countdownEl.textContent='2'; await wait(COUNT_STEP_MS); countdownEl.textContent='1'; await wait(COUNT_STEP_MS); hide(countScreen); }

// rAF + 実測のフラッシュ
function now(){ return performance.now(); }
function nextFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }

document.addEventListener('visibilitychange',()=>{ state.blockFlash=document.hidden; });

async function flashThen(cb){
  await countdown3();
  if(state.blockFlash){ cb?.(); return; }
  const {ACTIVE}=currentSets();
  const rec=getLayout(ACTIVE[state.puzzleIndex].title);
  state.lastPrimeExposureMs=0;
  if(!rec||!rec.byId){ cb?.(); return; }
  state.frozen=true;
  const backup=copyPieces(state.pieces);
  const byId=rec.byId;
  state.pieces=state.pieces.map(p=> byId[String(p.id)] ? {...p, offset:[...byId[String(p.id)].offset], angle:byId[String(p.id)].angle, flipped:!!byId[String(p.id)].flipped } : p);
  await nextFrame(); await nextFrame();
  const t0=now();
  while(now()-t0 < FLASH_MS){ await nextFrame(); }
  state.pieces=backup; await nextFrame();
  state.lastPrimeExposureMs=Math.round(now()-t0);
  state.frozen=false;
  cb?.();
}

// 判定
function judge(){
  const {ACTIVE}=currentSets();
  const tgt=roundPts(ACTIVE[state.puzzleIndex].target);
  const polys=state.pieces.map(p=> roundPts(transform(p.shape,p.offset,p.angle,p.flipped)) );
  [ctxT,ctxU,ctxUd,ctxX].forEach(k=>k.clearRect(0,0,WORLD_W,WORLD_H));
  ;[ctxT,ctxU,ctxUd].forEach(k=>{ k.save(); k.translate(0, CANVAS_Y_OFFSET); });
  const px=DILATE_PX; const tolTarget=Math.max(3,px); const tolPiece=Math.max(3,px);
  drawDil(ctxT,tgt,tolTarget);
  polys.forEach(pl=>drawDil(ctxU,pl,0));
  polys.forEach(pl=>drawDil(ctxUd,pl,tolPiece));
  ;[ctxT,ctxU,ctxUd].forEach(k=>k.restore());
  const targetArea=alphaCount(ctxT,WORLD_W,WORLD_H);
  const isPractice=(state.mode==='practice');
  const dpr = (window.devicePixelRatio||1);
  const AREA_TOL_COEF=isPractice?0.012:0.0035;
  const EDGE_PAD_PX=isPractice?22*dpr:12*dpr;
  const AREA_TOL=Math.max(5000, Math.round(targetArea*AREA_TOL_COEF));
  // outside
  ctxX.clearRect(0,0,WORLD_W,WORLD_H);
  ctxX.drawImage(cU,0,0);
  ctxX.globalCompositeOperation='destination-out';
  ctxX.save(); ctxX.translate(0,CANVAS_Y_OFFSET); drawDil(ctxX,tgt,Math.max(tolTarget,EDGE_PAD_PX)); ctxX.restore();
  ctxX.globalCompositeOperation='source-over';
  const outside=alphaCount(ctxX,WORLD_W,WORLD_H);
  // gaps
  ctxX.clearRect(0,0,WORLD_W,WORLD_H);
  ctxX.drawImage(cT,0,0);
  ctxX.globalCompositeOperation='destination-out';
  ctxX.drawImage(cUd,0,0);
  ctxX.globalCompositeOperation='source-over';
  const gaps=alphaCount(ctxX,WORLD_W,WORLD_H);
  // overlap
  const unionArea=alphaCount(ctxU,WORLD_W,WORLD_H);
  let sum=0; for(const pl of polys){ const plOff=pl.map(([x,y])=>[x,y+CANVAS_Y_OFFSET]); ctxX.clearRect(0,0,WORLD_W,WORLD_H); drawDil(ctxX,plOff,0); sum+=alphaCount(ctxX,WORLD_W,WORLD_H); }
  const overlap=Math.max(0,sum-unionArea);
  if(!isPractice){ const OUT_TOL_ABS=Math.max(20000,Math.round(AREA_TOL*1.25)); const OUT_TOL_RATE=0.004; const outsideRate=outside/Math.max(1,targetArea); if(outside>OUT_TOL_ABS && outsideRate>OUT_TOL_RATE){ return {ok:false,reason:'枠外に出ています。'}; } }
  if(overlap>AREA_TOL) return {ok:false,reason:'ピースが重なっています。'};
  if(gaps>AREA_TOL)    return {ok:false,reason:'隙間があります。'};
  return {ok:true};
}

// 進行
function firstHalf(){ state.step='play'; state.results=[]; state.puzzleIndex=0; setTitle(); resetPieces(); resetTimer(); startTimer(); }
function secondHalf(){ state.step='play'; state.puzzleIndex=5; setTitle(); resetPieces(); resetTimer(); flashThen(()=>startTimer()); }

function __startGo(){
  const name=(playerEntry?.value||'').trim();
  const practice=practiceEntry?.checked;
  if(practice){
    state.mode='practice'; state.practiceStage=1; state.step='play'; state.results=[]; state.puzzleIndex=0; setTitle(); resetPieces(); resetTimer(); startTimer(); hide(startScreen); return;
  }
  if(!name){ alert('お名前（participant_id）を入力してください'); playerEntry?.focus(); return; }
  state.mode='ab'; state.practiceStage=0; state.step='play'; state.results=[];
  state.pattern=(patternBEntry?.checked)?'B':'A'; if(state.pattern==='B'){ patternB.checked=true; } else { patternA.checked=true; }
  hide(startScreen); firstHalf();
}
window.__startGo=__startGo;

function __primeGo(){ hide(primeScreen); secondHalf(); }
window.__primeGo=__primeGo;

function __judge(){
  const {ACTIVE,FLASH}=currentSets();
  const r=judge(); if(!r.ok){ alert('不正解：'+r.reason); return; }
  stop();
  // 練習
  if(state.mode==='practice'){
    alert(`CLEAR!\n課題: ${ACTIVE[state.puzzleIndex].title}\nタイム: ${state.elapsed}秒`);
    if(state.practiceStage===1){ state.practiceStage=2; resetPieces(); resetTimer(); hide(startScreen); flashThen(()=>startTimer()); return; }
    // 練習完了
    state.mode='ab'; state.practiceStage=0; state.step='home'; state.pieces=[]; state.selectedId=null; titleEl.textContent='—'; timerEl.textContent='00:00'; show(startScreen); return;
  }
  // 本番
  const isPrime=!!FLASH[state.puzzleIndex];
  const record={ puzzleIndex:state.puzzleIndex+1, puzzleTitle:ACTIVE[state.puzzleIndex].title, condition:isPrime?'prime':'control', blockIndex:state.puzzleIndex<5?1:2, timeSec:state.elapsed, primeExposureMs:isPrime?(state.lastPrimeExposureMs||0):0 };
  state.results.push(record);
  // 1行送信（任意）
  postToSheets({ rows:[buildRow({ participant_id:(playerEntry.value||'').trim(), pattern:state.pattern, block_index:record.blockIndex, condition:record.condition, trial_index:((state.puzzleIndex%5)+1), puzzle_title:record.puzzleTitle, time_sec:record.timeSec, prime_exposure_ms:record.primeExposureMs })] });
  alert(`CLEAR!\n課題: ${record.puzzleTitle}\nタイム: ${record.timeSec}秒`);
  if(state.puzzleIndex===4){ show(primeScreen); return; }
  if(state.puzzleIndex < (currentSets().ACTIVE.length-1)){
    state.puzzleIndex++; setTitle(); resetPieces(); resetTimer();
    const nextIsPrime=FLASH[state.puzzleIndex];
    (nextIsPrime ? flashThen : (cb=>cb&&cb()))(()=>startTimer());
  }else{
    const total=state.results.reduce((a,b)=>a+(b.timeSec||0),0);
    alert(`10問クリア！合計: ${total} 秒`);
    // サマリ送信（任意）
    postToSheets({ rows:[...state.results.map(r=>buildRow({ participant_id:(playerEntry.value||'').trim(), pattern:state.pattern, block_index:r.blockIndex, condition:r.condition, trial_index:((r.puzzleIndex-1)%5)+1, puzzle_title:r.puzzleTitle, time_sec:r.timeSec, prime_exposure_ms:r.primeExposureMs })), buildRow({ participant_id:(playerEntry.value||'').trim(), pattern:state.pattern, block_index:'all', condition:'summary', trial_index:0, puzzle_title:'TOTAL', time_sec:total, prime_exposure_ms:'' })] });
    state.step='finished';
  }
}
window.__judge=__judge;

function __saveAnswer(){
  const {ACTIVE}=currentSets(); const t=ACTIVE[state.puzzleIndex].title; const byId={};
  state.pieces.forEach(p=>{ byId[String(p.id)]={ offset:[...p.offset], angle:p.angle, flipped:!!p.flipped }; });
  setLayout(t,byId); alert(`「${t}」の正解レイアウトを保存しました！（この端末のブラウザに保存）`);
}
window.__saveAnswer=__saveAnswer;

function __practiceReset(){ if(state.mode!=='practice') return; resetPieces(); resetTimer(); startTimer(); }
function __practiceBack(){ if(state.mode!=='practice') return; stop(); show(startScreen); titleEl.textContent='—'; timerEl.textContent='00:00'; state.step='home'; state.pieces=[]; state.selectedId=null; state.mode='ab'; state.practiceStage=0; }
window.__practiceReset=__practiceReset; window.__practiceBack=__practiceBack;

// 初期
(function init(){ timerEl.textContent='00:00'; const {ACTIVE}=currentSets(); titleEl.textContent=ACTIVE[0]?.title||'—'; })();
// =========== 実装ここまで ===========
</script>

</body>
</html>
