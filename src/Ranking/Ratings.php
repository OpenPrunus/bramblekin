<?php

declare(strict_types=1);

namespace Bramble\Ranking;

use Arcade\Support\AtomicFile;

/** Classement Elo des duels classés, dans un fichier JSON écrit par le serveur de jeu et lu par le site (sans les hash). */
final class Ratings
{
    /**
     * @var array<string, array{name: string, rating: int, played: int, wins: int, losses: int}>
     */
    private array $players = [];

    public function __construct(private readonly string $file)
    {
        $data = AtomicFile::readJson($file);
        foreach (is_array($data) && is_array($data['players'] ?? null) ? $data['players'] : [] as $id => $row) {
            if (is_string($id) && is_array($row) && is_string($row['name'] ?? null) && is_int($row['rating'] ?? null)) {
                $this->players[$id] = [
                    'name' => $row['name'], 'rating' => $row['rating'], 'played' => (int) ($row['played'] ?? 0),
                    'wins' => (int) ($row['wins'] ?? 0), 'losses' => (int) ($row['losses'] ?? 0),
                ];
            }
        }
    }

    public function ratingOf(string $id): int
    {
        return $this->players[$id]['rating'] ?? Elo::START;
    }

    /**
     * Enregistre un duel classé ; renvoie les variations [gagnant, perdant].
     * @return array{0: int, 1: int}
     */
    public function record(string $winner, string $winnerName, string $loser, string $loserName): array
    {
        $w = $this->players[$winner] ?? ['name' => $winnerName, 'rating' => Elo::START, 'played' => 0, 'wins' => 0, 'losses' => 0];
        $l = $this->players[$loser] ?? ['name' => $loserName, 'rating' => Elo::START, 'played' => 0, 'wins' => 0, 'losses' => 0];
        $dw = Elo::delta($w['rating'], $l['rating'], true, $w['played']);
        $dl = Elo::delta($l['rating'], $w['rating'], false, $l['played']);
        $w = ['name' => $winnerName, 'rating' => $w['rating'] + $dw, 'played' => $w['played'] + 1, 'wins' => $w['wins'] + 1, 'losses' => $w['losses']];
        $l = ['name' => $loserName, 'rating' => $l['rating'] + $dl, 'played' => $l['played'] + 1, 'wins' => $l['wins'], 'losses' => $l['losses'] + 1];
        $this->players[$winner] = $w;
        $this->players[$loser] = $l;
        $this->save();

        return [$dw, $dl];
    }

    public function save(): bool
    {
        return AtomicFile::write($this->file, json_encode(['players' => $this->players], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    /**
     * @return list<array{rank: int, name: string, rating: int, played: int, wins: int, losses: int}>
     */
    public function top(int $limit = 20): array
    {
        $rows = array_values($this->players);
        usort($rows, static fn (array $a, array $b): int => [$b['rating'], $a['played']] <=> [$a['rating'], $b['played']]);
        $out = [];
        foreach (array_slice($rows, 0, $limit) as $i => $row) {
            $out[] = ['rank' => $i + 1, ...$row];
        }

        return $out;
    }
}
