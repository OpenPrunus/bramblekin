<?php

declare(strict_types=1);

namespace Bramble\Game;

/** Un échange en cours entre deux joueurs : chacun propose une créature de son équipe, puis les deux confirment. */
final class Trade
{
    /**
     * @var array<int, int|null> id du client → uid proposé
     */
    public array $offers;
    /**
     * @var array<int, bool>
     */
    public array $confirmed;

    public function __construct(public readonly Client $a, public readonly Client $b)
    {
        $this->offers = [$a->id => null, $b->id => null];
        $this->confirmed = [$a->id => false, $b->id => false];
    }

    public function other(Client $c): Client
    {
        return $c === $this->a ? $this->b : $this->a;
    }
}
