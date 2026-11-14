<?php

declare(strict_types=1);

namespace Bramble\World;

use Bramble\Content\Item;

/**
 * Un personnage ou un objet posé sur la carte. Genres : nurse, shop, pc, trainer, leader, champion, guard, sign, talk, prof, item.
 * `team` : [espèce, niveau] des dresseurs ; `badge` : numéro du badge remis (chefs d'arène) ; `need` : badges exigés (gardes).
 */
final readonly class Npc
{
    /**
     * @param list<array{0: int, 1: int}> $team
     */
    public function __construct(
        public string $id,
        public string $kind,
        public int $x,
        public int $y,
        public string $dir = 'd',
        public int $sprite = 0,
        public string $text = '',
        public array $team = [],
        public int $reward = 0,
        public int $badge = 0,
        public int $need = 0,
        public ?Item $item = null,
        public string $cls = '',
        public string $name = '',
    ) {
    }

    public function isTrainer(): bool
    {
        return in_array($this->kind, ['trainer', 'leader', 'champion'], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function toClient(bool $beaten): array
    {
        return array_filter([
            'id' => $this->id, 'kind' => $this->kind, 'x' => $this->x, 'y' => $this->y, 'd' => $this->dir, 'sprite' => $this->sprite,
            'text' => $this->text, 'cls' => $this->cls, 'name' => $this->name, 'beaten' => $beaten, 'badge' => $this->badge,
            'size' => count($this->team), 'item' => $this->item?->value,
        ], static fn (mixed $v): bool => $v !== '' && $v !== null && $v !== false && $v !== 0);
    }
}
