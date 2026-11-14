<?php

declare(strict_types=1);

namespace Bramble\World;

/** Les cases de la carte (un caractère chacune, partagé avec le client qui les dessine). */
final class Tile
{
    final public const string GROUND = '.';
    final public const string PATH = ',';
    final public const string GRASS = '"';
    final public const string FLOWERS = 'f';
    final public const string TREE = 'T';
    final public const string WATER = '~';
    final public const string ROOF = 'R';
    final public const string WALL = '#';
    final public const string DOOR = 'D';
    final public const string SHUT = 'd';
    final public const string ROCK = 'r';
    final public const string FENCE = 'F';
    final public const string FLOOR = '_';
    final public const string INWALL = 'W';
    final public const string BRIDGE = 'b';
    final public const string SAND = 's';

    /** Cases où l'on peut marcher. */
    final public const string WALKABLE = '.,"f' . 'D_bs';

    public static function walkable(string $tile): bool
    {
        return $tile !== '' && str_contains(self::WALKABLE, $tile);
    }
}
