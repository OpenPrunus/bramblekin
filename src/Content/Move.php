<?php

declare(strict_types=1);

namespace Bramble\Content;

/**
 * Une attaque. `power` 0 = attaque de statut. `effect` : `stat:<cible>:<stat>:<crans>` (cible self|foe),
 * `status:<psn|brn|slp|par>`, `heal` (moitié des PV) ; `chance` = probabilité de l'effet en % (100 pour une attaque de statut).
 */
final readonly class Move
{
    /**
     * @param array{fr: string, en: string} $name
     */
    public function __construct(
        public string $id,
        public array $name,
        public Type $type,
        public int $power,
        public int $accuracy,
        public int $pp,
        public string $effect = '',
        public int $chance = 0,
        public int $priority = 0,
    ) {
    }

    public function isDamaging(): bool
    {
        return $this->power > 0;
    }

    /**
     * @return array<string, mixed>
     */
    public function toClient(): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'type' => $this->type->value, 'power' => $this->power,
            'acc' => $this->accuracy, 'pp' => $this->pp, 'fx' => $this->effect, 'prio' => $this->priority,
        ];
    }
}
