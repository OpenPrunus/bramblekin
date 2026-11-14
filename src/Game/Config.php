<?php

declare(strict_types=1);

namespace Bramble\Game;

use Arcade\Support\Env;

/** Réglages du serveur (durées en secondes). */
final readonly class Config
{
    public function __construct(
        /** Probabilité d'une rencontre à chaque pas dans les hautes herbes. */
        public float $encounterRate = 0.12,
        /** Durée minimale d'un pas (ms) : au-delà, le serveur refuse le déplacement. */
        public int $stepMs = 140,
        public int $turnSeconds = 45,
        public int $inviteTtl = 30,
        public int $saveEvery = 5,
        public int $rateLimit = 40,
        public int $duelLevel = 50,
    ) {
    }

    public static function fromEnvironment(): self
    {
        return new self(
            encounterRate: Env::number('BRAMBLE_ENCOUNTER_RATE', 0.12, true),
            stepMs: (int) Env::number('BRAMBLE_STEP_MS', 140, true),
            turnSeconds: (int) Env::number('BRAMBLE_TURN_SECONDS', 45),
            inviteTtl: (int) Env::number('BRAMBLE_INVITE_TTL', 30),
        );
    }
}
