<?php

// Sauvegarde de la partie : le navigateur garde un code secret (jeton), le serveur garde la partie sous le hash de ce code.
// Un code PIN facultatif (4 à 6 chiffres) protège la partie si le code est connu de quelqu'un d'autre : sans le bon PIN, on ne
// peut ni la lire ni l'écraser ; 5 erreurs bloquent la partie 15 minutes. Seule une empreinte du PIN est gardée.
//   GET  save.php?token=…&pin=…               -> la partie ({} si aucune) ; 401 {"error":"pin"} ; 423 {"error":"locked"}
//   POST save.php {token, pin?, state}        -> enregistre la partie (64 Ko au plus)
//   POST save.php {token, pin?, newPin}       -> pose, change ou retire (newPin = "") le code PIN

declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const TRIES = 5;
const LOCK = 900;
$dir = rtrim((string) (getenv('BRAMBLE_DATA_DIR') ?: __DIR__ . '/data'), '/') . '/saves';
$valid = static fn (mixed $t): bool => is_string($t) && preg_match('/^[A-Za-z0-9_-]{24,128}$/', $t) === 1;
$reply = static function (int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_THROW_ON_ERROR);
};
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    $reply(405, ['error' => 'method']);

    return;
}
$data = [];
if ($method === 'POST') {
    $raw = (string) file_get_contents('php://input', false, null, 0, 65537);
    $decoded = strlen($raw) <= 65536 && json_validate($raw) ? json_decode($raw, true) : null;
    $data = is_array($decoded) ? $decoded : [];
}
$token = $method === 'GET' ? ($_GET['token'] ?? null) : ($data['token'] ?? null);
if (!$valid($token)) {
    $reply(400, ['error' => 'token']);

    return;
}
$pin = $method === 'GET' ? ($_GET['pin'] ?? '') : ($data['pin'] ?? '');
$pin = is_string($pin) ? $pin : '';
$base = $dir . '/' . hash('sha256', (string) $token);
if (!is_dir($dir)) {
    @mkdir($dir, 0775, true);
}
$write = static function (string $path, string $json): bool {
    return @file_put_contents($path . '.tmp', $json, LOCK_EX) !== false && @rename($path . '.tmp', $path);
};

// --- vérification du code PIN (si la partie en a un) ---------------------------------------------------------------
$lock = is_file($base . '.pin') ? json_decode((string) file_get_contents($base . '.pin'), true) : null;
$now = time();
if (is_array($lock) && is_string($lock['hash'] ?? null)) {
    if (($lock['until'] ?? 0) > $now) {
        $reply(423, ['error' => 'locked', 'retry' => (int) $lock['until'] - $now]);

        return;
    }
    if ($pin === '') {
        $reply(401, ['error' => 'pin', 'left' => TRIES - (int) ($lock['fails'] ?? 0)]);      // sans PIN : on dit juste qu'il en faut un

        return;
    }
    if (!password_verify($pin, $lock['hash'])) {
        $fails = (int) ($lock['fails'] ?? 0) + 1;
        $lock = ['hash' => $lock['hash'], 'fails' => $fails >= TRIES ? 0 : $fails, 'until' => $fails >= TRIES ? $now + LOCK : 0];
        $write($base . '.pin', json_encode($lock, JSON_THROW_ON_ERROR));
        $reply($fails >= TRIES ? 423 : 401, ['error' => $fails >= TRIES ? 'locked' : 'pin', 'left' => TRIES - $fails]);

        return;
    }
    if (($lock['fails'] ?? 0) !== 0) {
        $write($base . '.pin', json_encode(['hash' => $lock['hash'], 'fails' => 0, 'until' => 0], JSON_THROW_ON_ERROR));
    }
}

if ($method === 'GET') {
    if (!is_file($base . '.json')) {
        echo '{}';                                                    // pas encore de partie : une nouvelle commence

        return;
    }
    readfile($base . '.json');

    return;
}
if (array_key_exists('newPin', $data)) {
    $newPin = $data['newPin'];
    if ($newPin === '') {
        @unlink($base . '.pin');
        $reply(200, ['pin' => false]);

        return;
    }
    if (!is_string($newPin) || preg_match('/^\d{4,6}$/', $newPin) !== 1) {
        $reply(400, ['error' => 'format']);

        return;
    }
    $ok = $write($base . '.pin', json_encode(['hash' => password_hash($newPin, PASSWORD_DEFAULT), 'fails' => 0, 'until' => 0], JSON_THROW_ON_ERROR));
    $reply($ok ? 200 : 500, $ok ? ['pin' => true] : ['error' => 'write']);

    return;
}
$state = $data['state'] ?? null;
if (!is_array($state)) {
    $reply(400, ['error' => 'bad']);

    return;
}
$state['savedAt'] = (int) round(microtime(true) * 1000);
$ok = $write($base . '.json', json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
$reply($ok ? 200 : 500, $ok ? ['savedAt' => $state['savedAt']] : ['error' => 'write']);
