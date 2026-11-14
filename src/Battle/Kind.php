<?php

declare(strict_types=1);

namespace Bramble\Battle;

/** Combat contre une créature sauvage, contre un dresseur du jeu, ou duel entre deux joueurs. */
enum Kind: string
{
    case Wild = 'wild';
    case Trainer = 'trainer';
    case Duel = 'duel';
}
