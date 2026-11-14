<?php

declare(strict_types=1);

namespace Bramble\Content;

/** Les dix types et leur table d'efficacité (attaque → défense). */
enum Type: string
{
    case Normal = 'normal';
    case Flame = 'flame';
    case Tide = 'tide';
    case Leaf = 'leaf';
    case Volt = 'volt';
    case Stone = 'stone';
    case Gust = 'gust';
    case Frost = 'frost';
    case Venom = 'venom';
    case Spirit = 'spirit';

    private const array CHART = [
        'normal' => ['stone' => 0.5, 'spirit' => 0.0],
        'flame' => ['leaf' => 2.0, 'frost' => 2.0, 'tide' => 0.5, 'stone' => 0.5, 'flame' => 0.5],
        'tide' => ['flame' => 2.0, 'stone' => 2.0, 'leaf' => 0.5, 'tide' => 0.5],
        'leaf' => ['tide' => 2.0, 'stone' => 2.0, 'flame' => 0.5, 'leaf' => 0.5, 'gust' => 0.5, 'venom' => 0.5],
        'volt' => ['tide' => 2.0, 'gust' => 2.0, 'leaf' => 0.5, 'volt' => 0.5, 'stone' => 0.0],
        'stone' => ['flame' => 2.0, 'gust' => 2.0, 'frost' => 2.0, 'leaf' => 0.5],
        'gust' => ['leaf' => 2.0, 'venom' => 2.0, 'volt' => 0.5, 'stone' => 0.5],
        'frost' => ['leaf' => 2.0, 'gust' => 2.0, 'flame' => 0.5, 'tide' => 0.5, 'frost' => 0.5],
        'venom' => ['leaf' => 2.0, 'spirit' => 2.0, 'venom' => 0.5, 'stone' => 0.5],
        'spirit' => ['spirit' => 2.0, 'venom' => 2.0, 'normal' => 0.0],
    ];

    /** Multiplicateur d'une attaque de ce type contre un défenseur d'un ou deux types. */
    public function against(Type ...$defender): float
    {
        $m = 1.0;
        foreach ($defender as $type) {
            $m *= self::CHART[$this->value][$type->value] ?? 1.0;
        }

        return $m;
    }

    /**
     * @return array<string, array<string, float>>
     */
    public static function chart(): array
    {
        return self::CHART;
    }
}
