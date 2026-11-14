<?php

declare(strict_types=1);

namespace Bramble\Game;

use Bramble\Battle\Action;
use Bramble\Battle\Battle;
use Bramble\World\Npc;

/**
 * Un combat en cours côté serveur : contre le jeu (un seul joueur, camp 0) ou duel entre deux joueurs (camps 0 et 1).
 */
final class Fight
{
    /**
     * @var array<int, Action|null> action choisie par camp pour le tour (duel)
     */
    public array $chosen = [0 => null, 1 => null];
    public int $deadline = 0;
    public bool $ranked = false;
    public ?string $why = null;

    /**
     * @param array{0: Client, 1: ?Client} $players
     */
    public function __construct(public readonly Battle $battle, public readonly array $players, public readonly ?Npc $npc = null)
    {
    }

    public function isDuel(): bool
    {
        return $this->players[1] !== null;
    }

    public function sideOf(Client $c): int
    {
        return $this->players[0] === $c ? 0 : 1;
    }

    public function opponent(Client $c): ?Client
    {
        return $this->players[0] === $c ? $this->players[1] : $this->players[0];
    }
}
