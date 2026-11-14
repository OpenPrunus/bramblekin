<?php

declare(strict_types=1);

namespace Bramble\Api;

use Bramble\Ranking\Ratings;

/** Le classement public des duels (meilleurs joueurs), lu dans le fichier écrit par le serveur de jeu. */
final readonly class Board
{
    public function __construct(private string $file)
    {
    }

    /**
     * @return list<array<string, int|string>>
     */
    public function top(): array
    {
        return (new Ratings($this->file))->top();
    }
}
