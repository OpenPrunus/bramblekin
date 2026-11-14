<?php

declare(strict_types=1);

namespace Bramble\World;

/** Une case qui mène ailleurs. */
final readonly class Warp
{
    public function __construct(public int $x, public int $y, public string $zone, public int $toX, public int $toY)
    {
    }
}
