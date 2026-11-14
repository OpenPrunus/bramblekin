<?php

// API du classement des duels (le serveur de jeu écrit ratings.json, ce script le lit).
//   GET -> top 20 : [{rank, name, rating, played, wins, losses}]

declare(strict_types=1);

use Bramble\Api\Board;

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

foreach ([(string) getenv('BRAMBLE_AUTOLOAD'), __DIR__ . '/../vendor/autoload.php', __DIR__ . '/vendor/autoload.php'] as $autoload) {
    if ($autoload !== '' && is_file($autoload)) {
        require $autoload;
        break;
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo '{"error":"method"}';

    return;
}
$dataDir = rtrim((string) (getenv('BRAMBLE_DATA_DIR') ?: __DIR__ . '/data'), '/');
echo json_encode((new Board($dataDir . '/ratings.json'))->top(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
