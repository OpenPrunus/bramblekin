<?php

// Sauvegarde de la partie : le navigateur garde un code secret (jeton), le serveur garde la partie sous le hash de ce code.
//   GET  save.php?token=…            -> la partie enregistrée ({} si aucune)
//   POST save.php {token, state}     -> enregistre la partie (64 Ko au plus)

declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dir = rtrim((string) (getenv('BRAMBLE_DATA_DIR') ?: __DIR__ . '/data'), '/') . '/saves';
$valid = static fn (mixed $t): bool => is_string($t) && preg_match('/^[A-Za-z0-9_-]{24,128}$/', $t) === 1;
$file = static fn (string $t): string => $dir . '/' . hash('sha256', $t) . '.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $token = $_GET['token'] ?? null;
    if (!$valid($token)) {
        http_response_code(400);
        echo '{"error":"token"}';

        return;
    }
    $path = $file((string) $token);
    if (!is_file($path)) {
        echo '{}';                                                    // pas encore de partie : une nouvelle commence

        return;
    }
    readfile($path);

    return;
}
if ($method !== 'POST') {
    http_response_code(405);
    echo '{"error":"method"}';

    return;
}
$raw = (string) file_get_contents('php://input', false, null, 0, 65537);
$data = strlen($raw) <= 65536 && json_validate($raw) ? json_decode($raw, true) : null;
if (!is_array($data) || !$valid($data['token'] ?? null) || !is_array($data['state'] ?? null)) {
    http_response_code(400);
    echo '{"error":"bad"}';

    return;
}
$state = $data['state'];
$state['savedAt'] = (int) round(microtime(true) * 1000);
if (!is_dir($dir)) {
    @mkdir($dir, 0775, true);
}
$path = $file((string) $data['token']);
$tmp = $path . '.tmp';
$ok = @file_put_contents($tmp, json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), LOCK_EX) !== false && @rename($tmp, $path);
http_response_code($ok ? 200 : 500);
echo $ok ? json_encode(['savedAt' => $state['savedAt']], JSON_THROW_ON_ERROR) : '{"error":"write"}';
