<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <title>Bramblekin</title>
  <meta name="theme-color" content="#2f6b3f">
  <meta name="description" content="Bramblekin : une aventure de capture de créatures en 3D, dix villes, huit arènes.">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <script src="pwa.js" defer></script>
  <style>
    [hidden] { display: none !important; }      /* une fenêtre masquée le reste, quel que soit son style */
    html, body { margin: 0; height: 100%; overflow: hidden; background: #9fd3f5; font: 600 14px system-ui, sans-serif; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .hud { position: fixed; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; gap: 8px; pointer-events: none; }
    .pill { background: rgba(255,255,255,.88); backdrop-filter: blur(8px); border-radius: 999px; padding: 6px 14px; box-shadow: 0 3px 12px rgba(0,0,0,.18); color: #2b2a3a; }
    .hud .back { pointer-events: auto; text-decoration: none; margin-right: auto; margin-left: 8px; }
    .hud .savebtn { pointer-events: auto; border: none; cursor: pointer; font-size: 16px; margin-left: 8px; }
    #save-panel { position: fixed; inset: 0; background: rgba(20,20,40,.45); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 20; padding: 16px; }
    #save-panel .box { background: #fff; border-radius: 22px; padding: 20px; width: min(460px, 100%); box-shadow: 0 10px 30px rgba(0,0,0,.3); color: #2b2a3a; }
    #save-panel h3 { margin: 0 0 8px; }
    #save-panel code { display: block; word-break: break-all; background: #f1f3f8; border-radius: 12px; padding: 10px; margin: 8px 0; user-select: all; }
    #save-panel input { width: 100%; box-sizing: border-box; border: 1px solid #e2e5ee; border-radius: 12px; padding: 10px; font: inherit; margin: 6px 0; }
    #save-panel .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    #save-panel button { border: none; border-radius: 999px; padding: 10px 16px; min-height: 44px; font-weight: 700; background: #f1f3f8; cursor: pointer; }
    #save-panel button.primary { background: linear-gradient(180deg, #2fc38a, #1f9d6b); color: #fff; }
    #save-state { color: #1f9d6b; font-weight: 700; min-height: 1.2em; }
    .pad { position: fixed; left: 14px; bottom: 14px; display: grid; grid-template: repeat(3, 54px) / repeat(3, 54px); }
    .pad button { border: none; border-radius: 16px; background: rgba(255,255,255,.85); box-shadow: 0 3px 10px rgba(0,0,0,.2); font-size: 20px; touch-action: none; }
    .pad [data-d="u"] { grid-area: 1 / 2; } .pad [data-d="l"] { grid-area: 2 / 1; } .pad [data-d="r"] { grid-area: 2 / 3; } .pad [data-d="d"] { grid-area: 3 / 2; }
    .zones { position: fixed; right: 12px; bottom: 14px; display: flex; flex-wrap: wrap; gap: 6px; max-width: 60vw; justify-content: flex-end; }
    #banner { position: fixed; top: 56px; left: 50%; transform: translateX(-50%); background: rgba(255,255,255,.92); border-radius: 999px; padding: 10px 28px; font-size: 20px; font-weight: 800; color: #2b2a3a; box-shadow: 0 6px 20px rgba(0,0,0,.2); opacity: 0; pointer-events: none; }
    #banner.show { animation: band 2.4s ease forwards; }
    @keyframes band { 0% { opacity: 0; transform: translate(-50%, -12px); } 12%, 80% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; } }
    #fade { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; transition: opacity .25s; }
    #fade.on { opacity: 1; }
    #duel { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(560px, calc(100% - 24px)); background: rgba(255,255,255,.96); border-radius: 22px; padding: 16px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.3); color: #2b2a3a; cursor: pointer; }
    #duel .vs { font-size: 26px; font-weight: 900; color: #ff3b4e; }
    #duel .who { font-size: 18px; font-weight: 800; }
    #duel small { color: #6b6e80; }
    #say { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(620px, calc(100% - 24px)); background: rgba(255,255,255,.96); border-radius: 22px; padding: 16px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.3); color: #2b2a3a; cursor: pointer; z-index: 5; }
    #say p { margin: 0; font-size: 16px; }
    #btn-a { position: fixed; left: 196px; bottom: 30px; width: 64px; height: 64px; border-radius: 50%; border: none; background: linear-gradient(180deg, #ff6f8a, #ff4d6d); color: #fff; font-size: 22px; font-weight: 800; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
    #battle { position: fixed; inset: 0; pointer-events: none; z-index: 6; }
    #battle > * { pointer-events: auto; }
    .hpb { position: absolute; background: rgba(255,255,255,.9); border-radius: 16px; padding: 8px 14px; width: min(46%, 300px); box-shadow: 0 6px 20px rgba(0,0,0,.2); color: #2b2a3a; }
    .hpb .lv { float: right; }
    .hpb .bar { height: 9px; background: #e3e6ee; border-radius: 999px; overflow: hidden; margin-top: 4px; }
    .hpb .bar i { display: block; height: 100%; width: 100%; border-radius: 999px; }
    .hpb .num { text-align: right; font-size: 12px; }
    #b-foe { top: 60px; right: 4%; } #b-mine { bottom: 250px; left: 4%; }
    #b-ui { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(720px, calc(100% - 20px)); display: grid; gap: 8px; }
    #b-msg { background: rgba(255,255,255,.96); border-radius: 18px; padding: 12px 16px; font-size: 16px; color: #2b2a3a; box-shadow: 0 6px 20px rgba(0,0,0,.2); min-height: 22px; }
    #b-menu { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    #b-menu button { border: none; border-left: 8px solid var(--tc, #888); border-radius: 16px; padding: 8px 14px; min-height: 52px; text-align: left; background: #fff; box-shadow: 0 3px 10px rgba(0,0,0,.18); display: flex; flex-direction: column; font-weight: 700; }
    #b-menu small { font-weight: 500; color: #6b6e80; }
    #b-menu .run { grid-column: 1 / -1; align-items: center; border-left: none; background: #dfe7ff; }
    body.in-battle .pad, body.in-battle .zones, body.in-battle #btn-a { display: none; }
    @media (max-width: 600px) { .zones { display: none; } #b-mine { bottom: 280px; } }
    .zones button { border: none; border-radius: 999px; padding: 8px 12px; background: rgba(255,255,255,.88); box-shadow: 0 3px 10px rgba(0,0,0,.18); font-weight: 700; }
  </style>
</head>
<body>
  <div class="hud"><span class="pill" id="zone"></span><a class="pill back" href="https://games.prunus.dev">← Tous les jeux</a><button class="pill savebtn" id="btn-save" title="Sauvegarde" aria-label="Sauvegarde">💾</button><span class="pill" id="perf">Bramblekin</span></div>
  <div id="banner"></div>
  <div id="fade"></div>
  <div id="duel" hidden><div class="vs">⚔ Combat !</div><div class="who"></div><div>« Hé, toi ! Nos regards se sont croisés : combat ! »</div><small class="team"></small><br><small>(Touche ou appuie sur une touche : le combat commence.)</small></div>
  <div id="say" hidden><p></p></div>
  <div id="save-panel" hidden><div class="box">
    <h3>💾 Sauvegarde</h3>
    <p>Ta partie est sauvegardée automatiquement (position, équipe, sac, dresseurs battus, objets ramassés).</p>
    <p id="save-state"></p>
    <p><small>Ton code de sauvegarde, pour reprendre sur un autre appareil (garde-le pour toi) :</small></p>
    <code id="save-code"></code>
    <div class="row"><button id="save-copy">Copier le code</button><button id="save-now" class="primary">Sauvegarder maintenant</button></div>
    <p><small>Reprendre une partie avec un code :</small></p>
    <input id="save-input" autocomplete="off" spellcheck="false" maxlength="128" placeholder="Colle ton code ici">
    <div class="row"><button id="save-restore">Reprendre cette partie</button><button id="save-close">Fermer</button></div>
  </div></div>
  <div id="battle" hidden>
    <div class="hpb" id="b-foe"><b></b><span class="lv"></span><div class="bar"><i></i></div></div>
    <div class="hpb" id="b-mine"><b></b><span class="lv"></span><div class="bar"><i></i></div><div class="num"></div></div>
    <div id="b-ui"><div id="b-msg"></div><div id="b-menu"></div></div>
  </div>
  <button id="btn-a">A</button>
  <div class="pad"><button data-d="u">▲</button><button data-d="l">◀</button><button data-d="r">▶</button><button data-d="d">▼</button></div>
  <div class="zones">
    <button data-go="t1:15:13">Bourg-Ronce</button><button data-go="r2:11:40">Route 2 (dresseurs)</button><button data-go="c1:5:5">Centre de soin</button>
    <button data-go="hb1:5:5">Labo</button><button data-go="t7:15:13">Givrelune</button><button data-go="r5:11:40">Route 5</button><button data-go="g3:6:12">Arène</button>
  </div>
  <script type="importmap">{ "imports": { "three": "./vendor/three.module.js" } }</script>
  <script type="module" src="game.js"></script>
</body>
</html>
