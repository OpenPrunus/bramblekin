<?php

declare(strict_types=1);

namespace Bramble\Battle;

use Bramble\Creature\Kin;

/** Un camp du combat : son équipe, la créature au front et ses modificateurs de statistiques (remis à zéro au changement). */
final class Fighter
{
    /**
     * @var array<string, int>
     */
    public array $stages = ['atk' => 0, 'def' => 0, 'spd' => 0];
    public int $active = 0;

    /**
     * @param list<Kin> $team
     */
    public function __construct(public array $team, public readonly bool $ai, public readonly string $name = '', public readonly int $trainerSprite = 0)
    {
        foreach ($team as $i => $kin) {
            if (!$kin->fainted()) {
                $this->active = $i;
                break;
            }
        }
    }

    public function kin(): Kin
    {
        return $this->team[$this->active];
    }

    public function alive(): int
    {
        return count(array_filter($this->team, static fn (Kin $k): bool => !$k->fainted()));
    }

    public function firstAlive(): ?int
    {
        foreach ($this->team as $i => $kin) {
            if (!$kin->fainted()) {
                return $i;
            }
        }

        return null;
    }

    public function canSwitchTo(int $index): bool
    {
        return isset($this->team[$index]) && $index !== $this->active && !$this->team[$index]->fainted();
    }

    public function bring(int $index): void
    {
        $this->active = $index;
        $this->stages = ['atk' => 0, 'def' => 0, 'spd' => 0];
    }

    public function multiplier(string $stat): float
    {
        $s = $this->stages[$stat] ?? 0;

        return $s >= 0 ? (2 + $s) / 2 : 2 / (2 - $s);
    }
}
