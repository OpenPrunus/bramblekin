<?php

declare(strict_types=1);

namespace Bramble\Content;

/** Altérations d'état persistantes (soignées au centre ou par un remède). */
enum Status: string
{
    case Poison = 'psn';
    case Burn = 'brn';
    case Sleep = 'slp';
    case Paralysis = 'par';
}
