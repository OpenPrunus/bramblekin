<?php

declare(strict_types=1);

namespace Bramble\Content;

/**
 * Objets du sac. Genres : orbe (capture), soin, objet clé (unique, jamais consommé : carte, vélo, capsules spéciales,
 * talisman), capsule technique (enseigne une attaque, à usage unique), objet rare (bonbon, pierre d'éveil).
 */
enum Item: string
{
    case Orb = 'orb';
    case SuperOrb = 'orb2';
    case HyperOrb = 'orb3';
    case Potion = 'potion';
    case SuperPotion = 'potion2';
    case HyperPotion = 'potion3';
    case Remedy = 'remedy';
    case Revive = 'revive';
    case Map = 'map';
    case Bike = 'bike';
    case CutCapsule = 'cs_cut';
    case SurfCapsule = 'cs_surf';
    case Charm = 'charm';
    case RareCandy = 'candy';
    case AwakeStone = 'stone';
    case Ct01 = 'ct01';
    case Ct02 = 'ct02';
    case Ct03 = 'ct03';
    case Ct04 = 'ct04';
    case Ct05 = 'ct05';
    case Ct06 = 'ct06';
    case Ct07 = 'ct07';
    case Ct08 = 'ct08';
    case Ct09 = 'ct09';
    case Ct10 = 'ct10';
    case Ct11 = 'ct11';
    case Ct12 = 'ct12';

    /** Capsule technique → attaque enseignée. */
    private const array CT_MOVES = [
        'ct01' => 'flame3', 'ct02' => 'tide3', 'ct03' => 'leaf3', 'ct04' => 'volt3', 'ct05' => 'stone3', 'ct06' => 'gust3',
        'ct07' => 'frost3', 'ct08' => 'venom3', 'ct09' => 'spirit3', 'ct10' => 'normal4', 'ct11' => 'nap', 'ct12' => 'quick',
    ];

    public function kind(): string
    {
        return match ($this) {
            self::Orb, self::SuperOrb, self::HyperOrb => 'orb',
            self::Potion, self::SuperPotion, self::HyperPotion, self::Remedy, self::Revive => 'heal',
            self::Map, self::Bike, self::CutCapsule, self::SurfCapsule, self::Charm => 'key',
            self::RareCandy, self::AwakeStone => 'rare',
            default => 'ct',
        };
    }

    public function isKey(): bool
    {
        return $this->kind() === 'key';
    }

    /** Attaque enseignée par une capsule technique (null sinon). */
    public function move(): ?string
    {
        return self::CT_MOVES[$this->value] ?? null;
    }

    public function price(): int
    {
        return match ($this) {
            self::Orb => 200, self::SuperOrb => 600, self::HyperOrb => 1200,
            self::Potion => 100, self::SuperPotion => 350, self::HyperPotion => 800,
            self::Remedy => 150, self::Revive => 1000,
            self::Ct11, self::Ct12 => 1500,
            self::RareCandy => 4000,
            default => 0,
        };
    }

    /** Badges nécessaires pour le trouver en boutique (99 = jamais en vente). */
    public function badgesForShop(): int
    {
        return match ($this) {
            self::Orb, self::Potion, self::Remedy => 0,
            self::SuperOrb, self::SuperPotion => 2,
            self::Revive, self::Ct12 => 3,
            self::HyperOrb, self::HyperPotion, self::Ct11 => 5,
            self::RareCandy => 7,
            default => 99,
        };
    }

    /** Bonus de capture (0 = pas un orbe). */
    public function catchBonus(): float
    {
        return match ($this) {
            self::Orb => 1.0, self::SuperOrb => 1.5, self::HyperOrb => 2.0,
            default => 0.0,
        };
    }

    /** PV rendus (0 = pas une potion). */
    public function heals(): int
    {
        return match ($this) {
            self::Potion => 20, self::SuperPotion => 60, self::HyperPotion => 150,
            default => 0,
        };
    }

    public function isOrb(): bool
    {
        return $this->catchBonus() > 0;
    }

    /** Utilisable pendant un combat sur une créature de l'équipe. */
    public function usableInBattle(): bool
    {
        return $this->kind() === 'heal';
    }

    /** @return array{fr: string, en: string} */
    public function label(): array
    {
        $move = $this->move();
        if ($move !== null) {
            $name = Moves::get($move)->name;
            $n = substr($this->value, 2);

            return ['fr' => "CT$n · {$name['fr']}", 'en' => "TC$n · {$name['en']}"];
        }

        return match ($this) {
            self::Orb => ['fr' => 'Orbe', 'en' => 'Orb'],
            self::SuperOrb => ['fr' => 'Super orbe', 'en' => 'Great Orb'],
            self::HyperOrb => ['fr' => 'Hyper orbe', 'en' => 'Hyper Orb'],
            self::Potion => ['fr' => 'Potion', 'en' => 'Potion'],
            self::SuperPotion => ['fr' => 'Super potion', 'en' => 'Super Potion'],
            self::HyperPotion => ['fr' => 'Hyper potion', 'en' => 'Hyper Potion'],
            self::Remedy => ['fr' => 'Remède', 'en' => 'Remedy'],
            self::Revive => ['fr' => 'Rappel', 'en' => 'Revive'],
            self::Map => ['fr' => 'Carte du monde', 'en' => 'World Map'],
            self::Bike => ['fr' => 'Vélo', 'en' => 'Bicycle'],
            self::CutCapsule => ['fr' => 'Capsule spéciale · Coupe', 'en' => 'Special Capsule · Cut'],
            self::SurfCapsule => ['fr' => 'Capsule spéciale · Surf', 'en' => 'Special Capsule · Surf'],
            self::Charm => ['fr' => 'Talisman doré', 'en' => 'Golden Charm'],
            self::RareCandy => ['fr' => 'Bonbon rare', 'en' => 'Rare Candy'],
            self::AwakeStone => ['fr' => 'Pierre d\'éveil', 'en' => 'Awakening Stone'],
            default => ['fr' => $this->value, 'en' => $this->value],
        };
    }

    /** @return array{fr: string, en: string} */
    public function description(): array
    {
        $move = $this->move();
        if ($move !== null) {
            return ['fr' => 'Enseigne une attaque à une créature du même type (les attaques normales : à toutes). Usage unique.',
                'en' => 'Teaches a move to a creature of the same type (normal moves: to any). Single use.'];
        }

        return match ($this) {
            self::Map => ['fr' => 'Montre les dix villes et l\'endroit où tu te trouves.', 'en' => 'Shows the ten towns and where you are.'],
            self::Bike => ['fr' => 'Deux fois plus rapide dehors. Utilise-le pour monter dessus ou descendre.', 'en' => 'Twice as fast outdoors. Use it to get on or off.'],
            self::CutCapsule => ['fr' => 'Permet de tailler les petits buissons qui barrent certains passages.', 'en' => 'Lets you trim the small bushes that block some paths.'],
            self::SurfCapsule => ['fr' => 'Permet de nager sur l\'eau des mares et des étangs.', 'en' => 'Lets you swim across ponds and lakes.'],
            self::Charm => ['fr' => 'Les dresseurs vaincus donnent moitié plus de pièces.', 'en' => 'Beaten trainers give half again as many coins.'],
            self::RareCandy => ['fr' => 'Fait gagner un niveau à une créature.', 'en' => 'Raises a creature by one level.'],
            self::AwakeStone => ['fr' => 'Fait évoluer tout de suite une créature qui peut évoluer.', 'en' => 'Makes a creature that can evolve do so at once.'],
            default => ['fr' => '', 'en' => ''],
        };
    }
}
