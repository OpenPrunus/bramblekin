<?php

declare(strict_types=1);

namespace Bramble\Tests\Game;

use Arcade\Server\Transport;

/** Transport factice : garde les messages envoyés au client. */
final class FakeTransport implements Transport
{
    /** @var list<array<string, mixed>> */
    public array $sent = [];

    #[\Override]
    public function send(string $json): void
    {
        $this->sent[] = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return list<array<string, mixed>> */
    public function of(string $type): array
    {
        return array_values(array_filter($this->sent, static fn (array $m): bool => $m['t'] === $type));
    }

    /** @return array<string, mixed>|null */
    public function last(string $type): ?array
    {
        $all = $this->of($type);

        return $all === [] ? null : $all[count($all) - 1];
    }
}
