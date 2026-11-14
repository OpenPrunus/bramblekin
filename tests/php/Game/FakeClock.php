<?php

declare(strict_types=1);

namespace Bramble\Tests\Game;

use DateTimeImmutable;
use Psr\Clock\ClockInterface;

/** Horloge réglable. */
final class FakeClock implements ClockInterface
{
    public float $t = 1_800_000_000.0;

    #[\Override]
    public function now(): DateTimeImmutable
    {
        return DateTimeImmutable::createFromFormat('U.u', sprintf('%.6F', $this->t)) ?: new DateTimeImmutable();
    }

    public function advance(float $seconds): void
    {
        $this->t += $seconds;
    }
}
