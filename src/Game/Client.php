<?php

declare(strict_types=1);

namespace Bramble\Game;

use Arcade\Server\IpAware;
use Arcade\Server\Session;
use Arcade\Server\Transport;
use Bramble\Player\Profile;

/** Un navigateur connecté : son profil (une fois identifié), son combat, son échange, ses invitations et sa cadence. */
final class Client implements Session, IpAware
{
    public ?Profile $profile = null;
    public string $ip = '';
    public ?Fight $fight = null;
    public ?Trade $trade = null;
    /**
     * Invitation envoyée : destinataire, genre (duel|trade), échéance.
     * @var array{to: int, kind: string, until: int}|null
     */
    public ?array $invite = null;
    public bool $dirty = false;
    public float $stepCredits = 4.0;
    public float $lastStep = 0.0;
    /** Pas sans rencontre possible (juste après un combat). */
    public int $grace = 0;
    public bool $kicked = false;

    private int $lastSeen;
    private int $rateSecond = 0;
    private int $rateCount = 0;

    public function __construct(public readonly int $id, private readonly Transport $transport, int $now)
    {
        $this->lastSeen = $now;
    }

    #[\Override]
    public function setAddress(string $ip): void
    {
        $this->ip = $ip;
    }

    public function ready(): bool
    {
        return $this->profile !== null && !$this->kicked;
    }

    public function busy(): bool
    {
        return $this->fight !== null || $this->trade !== null;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function send(string $type, array $data = []): void
    {
        if (!$this->kicked) {
            $this->transport->send(json_encode(['t' => $type, ...$data], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        }
    }

    public function error(string $code): void
    {
        $this->send('error', ['code' => $code]);
    }

    public function allow(int $now, int $limit): bool
    {
        $this->lastSeen = $now;
        if ($now !== $this->rateSecond) {
            $this->rateSecond = $now;
            $this->rateCount = 0;
        }

        return ++$this->rateCount <= $limit;
    }

    #[\Override]
    public function idleFor(int $now): int
    {
        return $now - $this->lastSeen;
    }
}
