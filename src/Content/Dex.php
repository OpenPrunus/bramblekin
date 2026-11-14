<?php

declare(strict_types=1);

namespace Bramble\Content;

/**
 * Le bestiaire : 150 espèces numérotées à partir de 1, construites depuis {
 * @see Lines}.
 */
final class Dex
{
    final public const int SIZE = 150;
    final public const array STARTERS = [1, 4, 7];

    private const array ROLES = [
        'balanced' => [1.0, 1.0, 1.0, 1.0],
        'swift' => [0.85, 1.05, 0.8, 1.3],
        'tank' => [1.15, 0.9, 1.35, 0.6],
        'bruiser' => [1.05, 1.3, 0.95, 0.7],
        'glass' => [0.8, 1.25, 0.75, 1.2],
    ];
    private const array TYPE_ROLE = [
        'stone' => 'tank', 'frost' => 'tank', 'volt' => 'swift', 'gust' => 'swift', 'flame' => 'bruiser', 'normal' => 'bruiser',
        'spirit' => 'glass', 'venom' => 'glass', 'tide' => 'balanced', 'leaf' => 'balanced',
    ];

    /**
     * @var array<int, Species>|null
     */
    private static ?array $all = null;

    /**
     * @return array<int, Species>
     */
    public static function all(): array
    {
        if (self::$all !== null) {
            return self::$all;
        }
        $all = [];
        $id = 1;
        $roles = array_keys(self::ROLES);
        foreach (Lines::ALL as $lineIndex => [$typeIds, $names, $levels, $tier]) {
            $types = array_map(Type::from(...), $typeIds);
            $role = self::TYPE_ROLE[$typeIds[0]];
            if ($lineIndex % 3 === 2) {
                $role = $roles[(array_search($role, $roles, true) + $lineIndex) % count($roles)];
            }
            $count = count($names);
            foreach ($names as $stage => $name) {
                $total = self::total($count, $stage, $tier);
                $w = self::ROLES[$role];
                $base = [
                    'hp' => (int) round($total / 4 * $w[0]), 'atk' => (int) round($total / 4 * $w[1]),
                    'def' => (int) round($total / 4 * $w[2]), 'spd' => (int) round($total / 4 * $w[3]),
                ];
                $evolves = $stage < $count - 1;
                $catch = match (true) {
                    $tier === 10 => 5,
                    $count === 1 => 75,
                    default => [190, 90, 45][$stage],
                };
                $all[$id] = new Species(
                    $id,
                    $name,
                    $types,
                    $stage + 1,
                    $lineIndex,
                    $base,
                    $evolves ? $id + 1 : null,
                    $evolves ? ($levels[$stage] ?? 0) : 0,
                    $catch,
                    intdiv($total, 5),
                    $tier,
                    self::learnset($types),
                );
                $id++;
            }
        }

        return self::$all = $all;
    }

    public static function get(int $id): Species
    {
        return self::all()[$id] ?? throw new \InvalidArgumentException("unknown species $id");
    }

    public static function exists(int $id): bool
    {
        return isset(self::all()[$id]);
    }

    /** Somme des quatre statistiques de base selon la taille de la lignée et le stade. */
    private static function total(int $count, int $stage, int $tier): int
    {
        return match (true) {
            $tier === 10 => 480,
            $tier === 0 => [240, 330, 430][$stage],
            $count === 3 => [230, 320, 420][$stage],
            $count === 2 => [260, 380][$stage],
            default => 380,
        };
    }

    /**
     * Attaques apprises, dérivées des types : rangs croissants du type principal, puis du second (ou des attaques normales).
     *
     * @param list<Type> $types
     * @return list<array{0: int, 1: string}>
     */
    private static function learnset(array $types): array
    {
        $p = $types[0]->value;
        $s = isset($types[1]) ? $types[1]->value : null;
        $plan = [
            [1, 'normal1'], [1, 'growl'], [4, "{$p}1"], [8, $s !== null ? "{$s}1" : 'quick'], [11, "{$p}S"], [15, "{$p}2"],
            [19, $s !== null ? "{$s}2" : 'glare'], [24, "{$p}3"], [29, $s !== null ? "{$s}3" : 'normal3'], [34, "{$p}4"],
            [39, $s !== null ? "{$s}S" : 'nap'], [44, $s !== null ? "{$s}4" : 'normal4'], [50, "{$p}5"],
        ];
        $seen = [];
        $out = [];
        foreach ($plan as [$level, $move]) {
            if (!isset($seen[$move])) {
                $seen[$move] = true;
                $out[] = [$level, $move];
            }
        }

        return $out;
    }
}
