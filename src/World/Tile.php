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
    final public const string RUG = 'm';
    final public const string COUNTER = 'C';
    final public const string SHELF = 'S';
    final public const string PLANT = 'p';
    final public const string BENCH = 'k';
    final public const string BED = 'Q';
    final public const string TABLE = 'B';

    /** Cases où l'on peut marcher. */
    final public const string WALKABLE = '.,"f' . 'D_bsm';

    public static function walkable(string $tile): bool
    {
        return $tile !== '' && str_contains(self::WALKABLE, $tile);
    }
}
