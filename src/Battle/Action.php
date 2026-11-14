<?php

declare(strict_types=1);

namespace Bramble\Battle;

use Bramble\Content\Item;

/** Le choix d'un camp pour un tour. `index` : attaque (move), membre de l'équipe (switch, item). */
final readonly class Action
{
    public function __construct(public string $kind, public int $index = 0, public ?Item $item = null)
    {
    }

    public static function move(int $index): self
    {
        return new self('move', $index);
    }

    public static function switch(int $index): self
    {
        return new self('switch', $index);
    }

    public static function item(Item $item, int $target = 0): self
    {
        return new self('item', $target, $item);
    }

    public static function catch(Item $orb): self
    {
        return new self('catch', 0, $orb);
    }

    public static function run(): self
    {
        return new self('run');
    }

    /**
     * @param array<mixed> $msg message du client : {k, i, item}
     */
    public static function fromMessage(array $msg): ?self
    {
        $kind = $msg['k'] ?? null;
        $index = is_int($msg['i'] ?? null) ? $msg['i'] : 0;
        $item = is_string($msg['item'] ?? null) ? Item::tryFrom($msg['item']) : null;

        return match ($kind) {
            'move' => self::move($index),
            'switch' => self::switch($index),
            'item' => $item !== null ? self::item($item, $index) : null,
            'catch' => $item !== null ? self::catch($item) : null,
            'run' => self::run(),
            default => null,
        };
    }
}
