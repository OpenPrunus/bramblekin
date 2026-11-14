<?php

declare(strict_types=1);

namespace Bramble\Content;

/** Objets du sac. */
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

    public function price(): int
    {
        return match ($this) {
            self::Orb => 200, self::SuperOrb => 600, self::HyperOrb => 1200,
            self::Potion => 100, self::SuperPotion => 350, self::HyperPotion => 800,
            self::Remedy => 150, self::Revive => 1000,
        };
    }

    /** Badges nécessaires pour le trouver en boutique. */
    public function badgesForShop(): int
    {
        return match ($this) {
            self::Orb, self::Potion, self::Remedy => 0,
            self::SuperOrb, self::SuperPotion => 2,
            self::Revive => 3,
            self::HyperOrb, self::HyperPotion => 5,
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

    /**
     * @return array{fr: string, en: string}
     */
    public function label(): array
    {
        return match ($this) {
            self::Orb => ['fr' => 'Orbe', 'en' => 'Orb'],
            self::SuperOrb => ['fr' => 'Super orbe', 'en' => 'Great Orb'],
            self::HyperOrb => ['fr' => 'Hyper orbe', 'en' => 'Hyper Orb'],
            self::Potion => ['fr' => 'Potion', 'en' => 'Potion'],
            self::SuperPotion => ['fr' => 'Super potion', 'en' => 'Super Potion'],
            self::HyperPotion => ['fr' => 'Hyper potion', 'en' => 'Hyper Potion'],
            self::Remedy => ['fr' => 'Remède', 'en' => 'Remedy'],
            self::Revive => ['fr' => 'Rappel', 'en' => 'Revive'],
        };
    }
}
