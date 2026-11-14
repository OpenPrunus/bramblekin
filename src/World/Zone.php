<?php

declare(strict_types=1);

namespace Bramble\World;

/** Une carte : ses cases, ses passages, ses personnages et ses rencontres sauvages. */
final class Zone
{
    /**
     * @var array<string, Warp> clé "x,y"
     */
    private array $warpIndex = [];

    /**
     * @param array{fr: string, en: string} $name
     * @param list<string> $rows
     * @param list<Warp> $warps
     * @param list<Npc> $npcs
     * @param list<array{0: int, 1: int, 2: int, 3: int}> $encounters espèce, niveau min, niveau max, poids
     */
    public function __construct(
        public readonly string $id,
        public readonly array $name,
        public readonly string $kind,
        public readonly int $index,
        public readonly array $rows,
        public readonly array $warps,
        public readonly array $npcs,
        public readonly array $encounters = [],
        public readonly int $theme = 0,
    ) {
        foreach ($warps as $warp) {
            $this->warpIndex["{$warp->x},{$warp->y}"] = $warp;
        }
    }

    public function width(): int
    {
        return strlen($this->rows[0] ?? '');
    }

    public function height(): int
    {
        return count($this->rows);
    }

    public function tile(int $x, int $y): string
    {
        if ($y < 0 || $y >= $this->height() || $x < 0 || $x >= $this->width()) {
            return '';
        }

        return $this->rows[$y][$x];
    }

    public function warpAt(int $x, int $y): ?Warp
    {
        return $this->warpIndex["$x,$y"] ?? null;
    }

    public function npc(string $id): ?Npc
    {
        foreach ($this->npcs as $npc) {
            if ($npc->id === $id) {
                return $npc;
            }
        }

        return null;
    }

    /**
     * Une case libre pour ce joueur (les personnages visibles bloquent le passage).
     * @param callable(Npc): bool $visible
     */
    public function free(int $x, int $y, callable $visible): bool
    {
        if (!Tile::walkable($this->tile($x, $y))) {
            return false;
        }
        foreach ($this->npcs as $npc) {
            if ($npc->x === $x && $npc->y === $y && $visible($npc)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param callable(Npc): bool $visible
     * @param callable(Npc): bool $beaten
     * @return array<string, mixed>
     */
    public function toClient(callable $visible, callable $beaten): array
    {
        $npcs = [];
        foreach ($this->npcs as $npc) {
            if ($visible($npc)) {
                $npcs[] = $npc->toClient($beaten($npc));
            }
        }

        return [
            'id' => $this->id, 'name' => $this->name, 'kind' => $this->kind, 'index' => $this->index, 'theme' => $this->theme,
            'rows' => $this->rows, 'npcs' => $npcs,
            'warps' => array_map(static fn (Warp $w): array => [$w->x, $w->y], $this->warps),
            'wild' => array_values(array_unique(array_map(static fn (array $e): int => $e[0], $this->encounters))),
        ];
    }
}
