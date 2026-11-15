<?php

// Joueurs en ligne : chaque navigateur ouvert sur le jeu se signale toutes les 25 secondes ; on compte ceux vus depuis 70 s.
//   POST online.php {token, name?}   -> se signale, renvoie {"online": n, "players": [{id, name}], "me": id, "nameTaken": bool}
//   GET  online.php                  -> {"online": n}
// On ne garde que l'identifiant public dérivé du code (jamais le code ni le hash qui nomme la sauvegarde), le pseudo et
// l'heure du dernier signal, dans data/online.json.

declare(strict_types=1);

use Bramble\Api\Nicknames;

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

foreach ([(string) getenv('BRAMBLE_AUTOLOAD'), __DIR__ . '/../vendor/autoload.php', __DIR__ . '/vendor/autoload.php'] as $autoload) {
    if ($autoload !== '' && is_file($autoload)) {
        require $autoload;
        break;
    }
}

const WINDOW = 70;
$dir = rtrim((string) (getenv('BRAMBLE_DATA_DIR') ?: __DIR__ . '/data'), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo '{"error":"method"}';

    return;
}
$me = null;
$name = '';
if ($method === 'POST') {
    $raw = (string) file_get_contents('php://input', false, null, 0, 1025);
    $data = strlen($raw) <= 1024 && json_validate($raw) ? json_decode($raw, true) : null;
    $token = is_array($data) ? ($data['token'] ?? null) : null;
    if (!is_string($token) || preg_match('/^[A-Za-z0-9_-]{24,128}$/', $token) !== 1) {
        http_response_code(400);
        echo '{"error":"token"}';

        return;
    }
    $me = substr(hash('sha256', 'public:' . $token), 0, 12);
    $raw = is_string($data['name'] ?? null) ? $data['name'] : '';
    $name = mb_substr(trim((string) preg_replace('/[^\p{L}\p{N} _\-.]/u', '', $raw)), 0, 15);
}
$now = time();
// pseudo réservé : s'il appartient à quelqu'un d'autre, on se signale sans pseudo et on prévient le navigateur
$nameTaken = $me !== null && $name !== '' && !(new Nicknames($dir . '/names.json'))->claim($name, $me, $now);
if ($nameTaken) {
    $name = '';
}
$fh = @fopen($dir . '/online.json', 'c+');
if ($fh === false) {
    echo '{"online":0}';

    return;
}
flock($fh, $me !== null ? LOCK_EX : LOCK_SH);
$seen = json_decode((string) stream_get_contents($fh), true);
$seen = is_array($seen) ? array_filter($seen, static fn (mixed $p): bool => is_array($p) && is_int($p['t'] ?? null) && $p['t'] > $now - WINDOW) : [];
if ($me !== null) {
    $seen[$me] = ['t' => $now, 'name' => $name];
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($seen, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    fflush($fh);
}
flock($fh, LOCK_UN);
fclose($fh);
$out = ['online' => count($seen)];
if ($me !== null) {
    $out['me'] = $me;
    $out['nameTaken'] = $nameTaken;
    $out['players'] = [];
    foreach ($seen as $id => $p) {
        if (($p['name'] ?? '') !== '') {
            $out['players'][] = ['id' => (string) $id, 'name' => $p['name']];
        }
    }
}
echo json_encode($out, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
