<?php

/**
 * Serveur du monde partagé de Bramblekin : WebSocket (RFC 6455) en PHP pur.
 *
 * Le serveur fait foi pour tout : sauvegardes (un fichier par joueur), déplacements, rencontres, combats, duels et échanges.
 * Il relaie aussi, en temps réel, les positions des joueurs du monde 3D (src/Game/Relay.php), dont la partie reste dans le navigateur.
 * Variables d'environnement : WS_PORT (8081), WS_ALLOWED_ORIGINS (liste séparée par des virgules, vide = tout),
 * BRAMBLE_DATA_DIR (sauvegardes et classement), TRUSTED_PROXIES, BRAMBLE_MAX_CONN_PER_IP, BRAMBLE_ENCOUNTER_RATE,
 * BRAMBLE_TURN_SECONDS, BRAMBLE_INVITE_TTL. Le code est dans src/ (namespace Bramble\).
 */

declare(strict_types=1);

use Arcade\Network\TrustedProxies;
use Arcade\Server\SocketServer;
use Arcade\Support\Env;
use Arcade\Support\StdoutLogger;
use Arcade\Support\SystemClock;
use Arcade\WebSocket\Handshake;
use Bramble\Api\Nicknames;
use Bramble\Game\Config;
use Bramble\Game\Relay;
use Bramble\Game\GameHub;
use Bramble\Player\ProfileStore;
use Bramble\Ranking\Ratings;
use Bramble\World\World;

set_time_limit(0);
ini_set('memory_limit', '512M');
require __DIR__ . '/bootstrap.php';

$port = (int) Env::string('WS_PORT', '8081');
$origins = array_values(array_filter(array_map('trim', explode(',', Env::string('WS_ALLOWED_ORIGINS')))));
$dataDir = rtrim(Env::string('BRAMBLE_DATA_DIR', dirname(__DIR__) . '/web/data'), '/');
if (!is_dir("$dataDir/players")) {
    @mkdir("$dataDir/players", 0775, true);
}

World::zones();                                                       // le monde est généré une fois, au démarrage
$hub = new GameHub(
    new ProfileStore("$dataDir/players"),
    new Ratings("$dataDir/ratings.json"),
    Config::fromEnvironment(),
    new SystemClock(),
    new StdoutLogger(),
    relay: new Relay(new Nicknames("$dataDir/names.json")),        // positions du monde 3D, relayées en temps réel
);
try {
    $proxies = TrustedProxies::fromString(Env::string('TRUSTED_PROXIES'));
    $perIp = (int) Env::number('BRAMBLE_MAX_CONN_PER_IP', 10, true);
    $server = SocketServer::listen($port, $hub, new Handshake($origins), 0.1, 500, $proxies, $perIp);
} catch (RuntimeException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

fwrite(STDOUT, 'World: ' . count(World::zones()) . " maps; saves in $dataDir/players"
    . (is_writable("$dataDir/players") ? '' : ' (WARNING: directory not writable, progress will not be saved)') . "\n");
fwrite(STDOUT, "Bramblekin WS listening on :$port\n");

$server->run();
