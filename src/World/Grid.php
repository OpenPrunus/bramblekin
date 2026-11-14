<?php

declare(strict_types=1);

namespace Bramble\World;

/** Grille de cases modifiable, utilisée pendant la génération d'une carte. */
final class Grid
{
    /**
     * @var array<int, array<int, string>>
     */
    public array $cells = [];

    public function __construct(public readonly int $w, public readonly int $h, string $fill)
    {
        for ($y = 0; $y < $h; $y++) {
            $this->cells[] = array_fill(0, $w, $fill);
        }
    }

    public function get(int $x, int $y): string
    {
        return $this->cells[$y][$x] ?? '';
    }

    public function set(int $x, int $y, string $tile): void
    {
        if ($x >= 0 && $y >= 0 && $x < $this->w && $y < $this->h) {
            $this->cells[$y][$x] = $tile;
        }
    }

    public function rect(int $x, int $y, int $w, int $h, string $tile): void
    {
        for ($j = $y; $j < $y + $h; $j++) {
            for ($i = $x; $i < $x + $w; $i++) {
                $this->set($i, $j, $tile);
            }
        }
    }

    /**
     * @return list<string>
     */
    public function rows(): array
    {
        return array_values(array_map(static fn (array $r): string => implode('', $r), $this->cells));
    }

    /**
     * Cases atteignables à pied depuis (x, y), sans traverser les cases bloquées.
     *
     * @param list<string> $rows
     * @param array<string, true> $blocked
     * @return array<string, true>
     */
    public static function reachable(array $rows, int $x, int $y, array $blocked = []): array
    {
        $seen = ["$x,$y" => true];
        $queue = [[$x, $y]];
        while ($queue !== []) {
            [$cx, $cy] = array_shift($queue);
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $cx + $dx;
                $ny = $cy + $dy;
                $key = "$nx,$ny";
                if ($nx < 0 || $ny < 0 || isset($seen[$key]) || isset($blocked[$key]) || !Tile::walkable(substr($rows[$ny] ?? '', $nx, 1))) {
                    continue;
                }
                $seen[$key] = true;
                $queue[] = [$nx, $ny];
            }
        }

        return $seen;
    }
}
