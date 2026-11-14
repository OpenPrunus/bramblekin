<?php

declare(strict_types=1);

namespace Bramble\World;

/** Noms propres du monde : villes, champions d'arène, prénoms des dresseurs. */
final class Names
{
    /**
     * @var list<array{fr: string, en: string}>
     */
    final public const array TOWNS = [
        ['fr' => 'Bourg-Ronce', 'en' => 'Bramble Hollow'],
        ['fr' => 'Mousseval', 'en' => 'Mossvale'],
        ['fr' => 'Port-Brume', 'en' => 'Mistport'],
        ['fr' => 'Fulgurville', 'en' => 'Sparkton'],
        ['fr' => 'Pierrefonde', 'en' => 'Stonedeep'],
        ['fr' => 'Haut-Vent', 'en' => 'Highwind'],
        ['fr' => 'Givrelune', 'en' => 'Frostmoon'],
        ['fr' => 'Marais-Noir', 'en' => 'Blackmire'],
        ['fr' => 'Sombrecombe', 'en' => 'Duskhollow'],
        ['fr' => 'Cime-Ronce', 'en' => 'Bramble Peak'],
    ];

    /** Type et nom du champion de l'arène de la ville 2 à 9 (badge 1 à 8). */
    final public const array LEADERS = [
        1 => ['leaf', 'Sylvine'], 2 => ['tide', 'Marin'], 3 => ['volt', 'Volta'], 4 => ['stone', 'Roch'],
        5 => ['gust', 'Aéria'], 6 => ['frost', 'Givra'], 7 => ['venom', 'Vénéa'], 8 => ['spirit', 'Ombrin'],
    ];

    final public const array FIRST = [
        'Paul', 'Léa', 'Hugo', 'Inès', 'Tom', 'Jade', 'Noé', 'Lina', 'Sacha', 'Zoé', 'Malo', 'Rose', 'Yanis', 'Anna', 'Théo', 'Mila',
        'Enzo', 'Lou', 'Axel', 'Nina', 'Gabin', 'Iris', 'Robin', 'Alba', 'Marius', 'Elsa', 'Basile', 'Chloé', 'Timéo', 'Maëlle',
    ];

    final public const array CLASSES = ['youngster', 'lass', 'hiker', 'fisher', 'birder', 'scientist', 'camper', 'picnicker', 'ranger', 'ace'];
}
