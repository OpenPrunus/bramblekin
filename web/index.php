<?php

declare(strict_types=1);

// URL WebSocket vue par le navigateur (BRAMBLE_WS) ; vide = même hôte, port 8081 (ou /ws derrière HTTPS).
$ws = (string) getenv('BRAMBLE_WS');
?><!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <meta name="theme-color" content="#2f6b3f">
  <meta name="description" content="Bramblekin : une aventure en ligne dans un monde partagé. 150 créatures à attraper, dix villes, huit arènes, duels et échanges entre joueurs.">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>Bramblekin</title>
  <link rel="stylesheet" href="css/style.css">
  <script>window.BRAMBLE_WS = <?= json_encode($ws, JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
  <script src="pwa.js" defer></script>
  <script type="module" src="js/main.js"></script>
</head>
<body>
  <canvas id="world" tabindex="0" aria-label="Bramblekin"></canvas>

  <div id="hud" hidden>
    <div class="hud-left"><span id="hud-zone"></span><span id="hud-online"></span></div>
    <div class="hud-right"><span id="hud-money"></span><button type="button" id="btn-emote" aria-label="Émotions" data-i18n-aria="emotes">☺</button><button type="button" id="btn-menu"></button></div>
  </div>
  <div id="banner" hidden></div>

  <div id="pad" hidden>
    <div class="dpad">
      <button type="button" data-dir="u" aria-label="↑">▲</button>
      <button type="button" data-dir="l" aria-label="←">◀</button>
      <button type="button" data-dir="r" aria-label="→">▶</button>
      <button type="button" data-dir="d" aria-label="↓">▼</button>
    </div>
    <div class="ab"><button type="button" id="btn-b">B</button><button type="button" id="btn-a">A</button></div>
  </div>

  <div id="dialog" hidden><p id="dialog-text"></p><span class="more">▼</span></div>

  <section id="title" class="screen">
    <div class="title-card">
      <h1><span class="logo" aria-hidden="true"></span>Bramblekin</h1>
      <p class="tagline" data-i18n="tagline"></p>
      <form id="title-form">
        <input id="name" maxlength="15" autocomplete="nickname" required minlength="2" data-i18n-ph="nickname" aria-label="Pseudo">
        <button type="submit" id="btn-play" class="primary" data-i18n="play"></button>
      </form>
      <p id="title-msg" hidden></p>
      <div class="row">
        <button type="button" id="btn-restore" data-i18n="restore"></button>
        <button type="button" id="btn-lang"></button>
        <button type="button" id="btn-sound"></button>
      </div>
      <p class="links"><a href="https://games.prunus.dev" data-i18n="allGames"></a> · <a href="https://github.com/OpenPrunus/bramblekin" target="_blank" rel="noopener noreferrer" data-i18n="github"></a></p>
    </div>
  </section>

  <section id="starter" class="screen" hidden>
    <div class="title-card wide">
      <h2 data-i18n="starterTitle"></h2>
      <p data-i18n="starterHint"></p>
      <div class="starters"></div>
    </div>
  </section>

  <section id="battle" hidden></section>

  <section id="sheet" hidden>
    <header><nav id="sheet-tabs"></nav><button type="button" id="sheet-close" aria-label="Fermer" data-i18n-aria="close">✕</button></header>
    <div id="sheet-body"></div>
  </section>

  <div id="modal" hidden><div id="modal-box" class="box"></div></div>
  <div id="toasts" aria-live="polite"></div>
</body>
</html>
