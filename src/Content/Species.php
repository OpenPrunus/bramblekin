<?php

declare(strict_types=1);

namespace Bramble\Content;

/** Une espèce du bestiaire (données fixes, dérivées de la table des lignées). */
final readonly class Species
{
    /**
     * @param list<Type> $types
     * @param array{hp: int, atk: int, def: int, spd: int} $base
     * @param list<array{0: int, 1: string}> $learnset niveau → attaque, triés par niveau
     */
    public function __construct(
        public int $id,
        public string $name,
        public array $types,
        public int $stage,
        public int $line,
        public array $base,
        public ?int $evolvesTo,
        public int $evolveLevel,
        public int $catchRate,
        public int $xpYield,
        public int $tier,
        public array $learnset,
    ) {
    }

    public function isLegendary(): bool
    {
        return $this->tier === 10;
    }

    /**
     * Les quatre dernières attaques apprises jusqu'à ce niveau.
     * @return list<string>
     */
    public function movesAt(int $level): array
    {
        $known = [];
        foreach ($this->learnset as [$at, $move]) {
            if ($at <= $level) {
                $known[] = $move;
            }
        }

        return array_slice($known, -4);
    }

    /**
     * Attaques apprises exactement à ce niveau.
     * @return list<string>
     */
    public function learnedAt(int $level): array
    {
        return array_values(array_map(static fn (array $l): string => $l[1], array_filter($this->learnset, static fn (array $l): bool => $l[0] === $level)));
    }

    /**
     * @return array<string, mixed>
     */
    public function toClient(): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'types' => array_map(static fn (Type $t): string => $t->value, $this->types),
            'stage' => $this->stage, 'line' => $this->line, 'base' => $this->base, 'evo' => $this->evolvesTo, 'evoLv' => $this->evolveLevel,
            'tier' => $this->tier,
        ];
    }
}
