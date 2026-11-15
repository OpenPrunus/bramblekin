<?php

// Chat : un canal général et des messages privés entre joueurs.
//   POST chat.php {token, name, text, to?}   -> envoie (to = identifiant public du destinataire pour un message privé)
//   GET  chat.php?token=…&since=n            -> messages plus récents que n : le général, et les privés qui me concernent
// Messages de 200 caractères au plus, un toutes les 2 secondes par joueur ; on garde les 300 derniers (data/chat.json).
// Les pseudos sont réservés (data/names.json) : 409 {"error":"name_taken"} si le pseudo appartient à un autre joueur.

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

const KEEP = 300;
const GAP = 2;
$dir = rtrim((string) (getenv('BRAMBLE_DATA_DIR') ?: __DIR__ . '/data'), '/');
$validToken = static fn (mixed $t): bool => is_string($t) && preg_match('/^[A-Za-z0-9_-]{24,128}$/', $t) === 1;
$public = static fn (string $t): string => substr(hash('sha256', 'public:' . $t), 0, 12);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    http_response_code(405);
    echo '{"error":"method"}';

    return;
}
$data = null;
if ($method === 'POST') {
    $raw = (string) file_get_contents('php://input', false, null, 0, 4097);
    $data = strlen($raw) <= 4096 && json_validate($raw) ? json_decode($raw, true) : null;
}
$token = $method === 'POST' ? (is_array($data) ? ($data['token'] ?? null) : null) : ($_GET['token'] ?? null);
if (!$validToken($token)) {
    http_response_code(400);
    echo '{"error":"token"}';

    return;
}
$me = $public((string) $token);
$fh = @fopen($dir . '/chat.json', 'c+');
if ($fh === false) {
    http_response_code(500);
    echo '{"error":"storage"}';

    return;
}
flock($fh, $method === 'POST' ? LOCK_EX : LOCK_SH);
$store = json_decode((string) stream_get_contents($fh), true);
$store = is_array($store) ? $store : [];
$messages = is_array($store['messages'] ?? null) ? $store['messages'] : [];
$last = is_array($store['last'] ?? null) ? $store['last'] : [];
$next = is_int($store['next'] ?? null) ? $store['next'] : 1;
$now = time();

if ($method === 'POST') {
    $text = is_array($data) && is_string($data['text'] ?? null) ? $data['text'] : '';
    $text = mb_substr(trim((string) preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text)), 0, 200);
    $nameRaw = is_array($data) && is_string($data['name'] ?? null) ? $data['name'] : '';
    $name = mb_substr(trim((string) preg_replace('/[^\p{L}\p{N} _\-.]/u', '', $nameRaw)), 0, 15);
    $to = is_array($data) && is_string($data['to'] ?? null) && preg_match('/^[a-f0-9]{12}$/', $data['to']) === 1 ? $data['to'] : null;
    $error = match (true) {
        $text === '' => 'empty',
        mb_strlen($name) < 2 => 'name',
        $to === $me => 'self',
        ($last[$me] ?? 0) > $now - GAP => 'slow',
        !(new Nicknames($dir . '/names.json'))->claim($name, $me, $now) => 'name_taken',
        default => null,
    };
    if ($error === null) {
        $messages[] = ['id' => $next++, 'at' => $now, 'from' => $me, 'name' => $name, 'to' => $to, 'text' => $text];
        $messages = array_slice($messages, -KEEP);
        $last[$me] = $now;
        $last = array_filter($last, static fn (mixed $t): bool => is_int($t) && $t > $now - 60);
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode(['next' => $next, 'messages' => $messages, 'last' => $last], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    if ($error !== null) {
        http_response_code(match ($error) {
            'slow' => 429, 'name_taken' => 409, default => 400
        });
        echo json_encode(['error' => $error], JSON_THROW_ON_ERROR);

        return;
    }
    echo json_encode(['ok' => true, 'id' => $next - 1], JSON_THROW_ON_ERROR);

    return;
}
flock($fh, LOCK_UN);
fclose($fh);
$since = is_numeric($_GET['since'] ?? null) ? (int) $_GET['since'] : 0;
$mine = [];
foreach ($messages as $m) {
    if (!is_array($m) || ($m['id'] ?? 0) <= $since) {
        continue;
    }
    $to = $m['to'] ?? null;
    if ($to === null || $to === $me || ($m['from'] ?? '') === $me) {
        $mine[] = $m;
    }
}
echo json_encode(['me' => $me, 'messages' => array_slice($mine, -150)], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
