<?php

declare(strict_types=1);

namespace Bramble\Content;

/**
 * Registre des attaques : cinq attaques par type (puissances 40, 60, 75, 90, 110), une attaque de statut par type
 * et quelques attaques normales de soutien. Les identifiants sont `<type><rang>` (ex. `flame3`) et `<type>S`.
 */
final class Moves
{
    /** Puissance, précision, PP des cinq rangs. */
    final public const array TIERS = [1 => [40, 100, 30], 2 => [60, 100, 20], 3 => [75, 95, 15], 4 => [90, 90, 10], 5 => [110, 80, 5]];

    /** Effet secondaire (10 %) des rangs 2 et 3, par type. */
    private const array SIDE_EFFECT = [
        'flame' => 'status:brn', 'volt' => 'status:par', 'venom' => 'status:psn', 'frost' => 'stat:foe:spd:-1',
        'tide' => 'stat:foe:atk:-1', 'stone' => 'stat:foe:def:-1', 'gust' => 'stat:self:spd:1', 'spirit' => 'stat:foe:def:-1',
        'leaf' => 'stat:foe:spd:-1', 'normal' => '',
    ];

    /** Noms FR | EN des cinq rangs puis de l'attaque de statut (avec son effet et sa précision). */
    private const array NAMES = [
        'normal' => [['Bousculade', 'Shove'], ['Coup de patte', 'Paw Swipe'], ['Ruade', 'Buck'], ['Écrasement', 'Crush'], ['Fracas', 'Uproar Slam'],
            ['Concentration', 'Focus', 'stat:self:atk:2', 100]],
        'flame' => [['Tison', 'Ember Flick'], ['Crocs ardents', 'Hot Fangs'], ['Torche', 'Torchlash'], ['Brasier', 'Blaze Wave'], ['Fournaise', 'Furnace'],
            ['Cendres brûlantes', 'Searing Ash', 'status:brn', 85]],
        'tide' => [['Éclaboussure', 'Splash Shot'], ['Gicleur', 'Squirt'], ['Remous', 'Undertow'], ['Lame de fond', 'Groundswell'], ['Raz-de-marée', 'Tidal Crash'],
            ['Brume', 'Mist Veil', 'stat:self:def:2', 100]],
        'leaf' => [['Brindille', 'Twig Jab'], ['Fouette-ronce', 'Bramble Whip'], ['Pluie de feuilles', 'Leaf Storm'], ['Racines', 'Root Snare'], ['Forêt vive', 'Wildwood'],
            ['Pollen', 'Drowsy Pollen', 'status:slp', 75]],
        'volt' => [['Zap', 'Zap'], ['Arc électrique', 'Arc Bolt'], ['Court-jus', 'Short Circuit'], ['Éclair', 'Flash Bolt'], ['Orage', 'Tempest'],
            ['Onde statique', 'Static Wave', 'status:par', 90]],
        'stone' => [['Gravillon', 'Pebble'], ['Jet de roc', 'Rock Toss'], ['Éboulis', 'Scree'], ['Menhir', 'Standing Stone'], ['Cataclysme', 'Cataclysm'],
            ['Carapace', 'Hard Shell', 'stat:self:def:2', 100]],
        'gust' => [['Souffle', 'Puff'], ['Bourrasque', 'Squall'], ['Lame d\'air', 'Air Blade'], ['Cyclone', 'Cyclone'], ['Ouragan', 'Hurricane'],
            ['Vent arrière', 'Tailwind', 'stat:self:spd:2', 100]],
        'frost' => [['Grésil', 'Sleet'], ['Givre', 'Rime'], ['Stalactite', 'Icicle Drop'], ['Blizzard', 'Whiteout'], ['Zéro absolu', 'Absolute Zero'],
            ['Verglas', 'Black Ice', 'stat:foe:spd:-2', 95]],
        'venom' => [['Piqûre', 'Sting'], ['Dard', 'Barb'], ['Crachat acide', 'Acid Spit'], ['Venin', 'Venom Fang'], ['Toxine noire', 'Black Toxin'],
            ['Miasme', 'Miasma', 'status:psn', 85]],
        'spirit' => [['Frisson', 'Shiver'], ['Ombre', 'Shade'], ['Hantise', 'Haunt'], ['Spectre', 'Phantom'], ['Néant', 'Void'],
            ['Berceuse spectrale', 'Ghost Lullaby', 'status:slp', 70]],
    ];

    /** Attaques normales de soutien. */
    private const array EXTRA = [
        'growl' => ['Grondement', 'Growl', 0, 100, 30, 'stat:foe:atk:-1', 0],
        'glare' => ['Moue farouche', 'Fierce Pout', 0, 100, 30, 'stat:foe:def:-1', 0],
        'quick' => ['Coup vif', 'Quick Nip', 40, 100, 25, '', 1],
        'nap' => ['Sieste', 'Catnap', 0, 100, 10, 'heal', 0],
    ];

    /**
     * @var array<string, Move>|null
     */
    private static ?array $all = null;

    /**
     * @return array<string, Move>
     */
    public static function all(): array
    {
        if (self::$all !== null) {
            return self::$all;
        }
        $all = [];
        foreach (self::NAMES as $typeId => $names) {
            $type = Type::from($typeId);
            foreach (self::TIERS as $tier => [$power, $acc, $pp]) {
                [$fr, $en] = $names[$tier - 1];
                $fx = in_array($tier, [2, 3], true) ? self::SIDE_EFFECT[$typeId] : '';
                $all["$typeId$tier"] = new Move("$typeId$tier", ['fr' => $fr, 'en' => $en], $type, $power, $acc, $pp, $fx, $fx === '' ? 0 : 10);
            }
            [$fr, $en, $fx, $acc] = $names[5];
            $all["{$typeId}S"] = new Move("{$typeId}S", ['fr' => $fr, 'en' => $en], $type, 0, $acc, 15, $fx, 100);
        }
        foreach (self::EXTRA as $id => [$fr, $en, $power, $acc, $pp, $fx, $prio]) {
            $all[$id] = new Move($id, ['fr' => $fr, 'en' => $en], Type::Normal, $power, $acc, $pp, $fx, $fx === '' ? 0 : 100, $prio);
        }

        return self::$all = $all;
    }

    public static function get(string $id): Move
    {
        return self::all()[$id] ?? throw new \InvalidArgumentException("unknown move $id");
    }

    public static function exists(string $id): bool
    {
        return isset(self::all()[$id]);
    }
}
