<?php

declare(strict_types=1);

namespace Bramble\World;

use Bramble\Content\Dex;
use Bramble\Content\Item;
use Bramble\Content\Lines;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Le monde : 10 villes reliées par 9 routes (toujours vers le nord), une arène dans les villes 2 à 9, la Ligue dans la ville 10.
 * Tout est généré de façon déterministe (graine = nom de la carte) : le serveur et les tests obtiennent toujours le même monde.
 * Identifiants : t1…t10 (villes), r1…r9 (routes, la route i relie la ville i à la ville i+1), g2…g9 (arènes), league.
 */
final class World
{
    final public const int TOWNS = 10;
    final public const int TW = 30;
    final public const int TH = 24;
    final public const int RW = 24;
    final public const int RH = 44;
    final public const int GW = 13;
    final public const int GH = 15;
    final public const string START = 't1';

    /**
     * @var array<string, Zone>|null
     */
    private static ?array $zones = null;

    /**
     * @return array<string, Zone>
     */
    public static function zones(): array
    {
        if (self::$zones === null) {
            $zones = [];
            for ($i = 1; $i <= self::TOWNS; $i++) {
                $zones["t$i"] = self::town($i);
                if ($i < self::TOWNS) {
                    $zones["r$i"] = self::route($i);
                }
                if ($i >= 2 && $i <= 9) {
                    $zones["g$i"] = self::gym($i);
                }
            }
            $zones['league'] = self::league();
            self::$zones = $zones;
        }

        return self::$zones;
    }

    public static function zone(string $id): ?Zone
    {
        return self::zones()[$id] ?? null;
    }

    /**
     * Point de départ d'une partie, et point de soin par défaut : devant l'infirmière de Bourg-Ronce.
     * @return array{0: string, 1: int, 2: int}
     */
    public static function start(): array
    {
        return [self::START, 15, 13];
    }

    /**
     * Case où se tenir pour parler à l'infirmière de la ville `$i`.
     * @return array{0: string, 1: int, 2: int}
     */
    public static function healSpot(int $town): array
    {
        return ["t$town", 7, 9];
    }

    private static function rng(string $seed): Randomizer
    {
        return new Randomizer(new Mt19937(crc32("bramblekin:$seed")));
    }

    /** Forme atteinte par une créature de base à ce niveau (évolutions comprises). */
    public static function formAt(int $species, int $level): int
    {
        $info = Dex::get($species);
        while ($info->evolvesTo !== null && $level >= $info->evolveLevel) {
            $info = Dex::get($info->evolvesTo);
        }

        return $info->id;
    }

    /**
     * Niveaux sauvages de la route `$r`.
     * @return array{0: int, 1: int}
     */
    public static function routeLevels(int $r): array
    {
        $min = 2 + 5 * ($r - 1);

        return [$min, $min + 3];
    }

    /**
     * Premières formes des lignées d'une zone d'apparition.
     * @return list<int>
     */
    public static function basesOfTier(int $tier): array
    {
        $out = [];
        foreach (Dex::all() as $species) {
            if ($species->stage === 1 && $species->tier === $tier) {
                $out[] = $species->id;
            }
        }

        return $out;
    }

    /**
     * @return list<array{0: int, 1: int, 2: int, 3: int}>
     */
    public static function encounters(int $r): array
    {
        [$min, $max] = self::routeLevels($r);
        $rng = self::rng("wild$r");
        $table = [];
        foreach (self::basesOfTier($r) as $id) {
            $table[] = [$id, $min, $max, 30];                          // les nouvelles venues de la route : toujours la première forme
        }
        foreach ($r > 1 ? self::basesOfTier($r - 1) : [] as $id) {
            $table[] = [self::formAt($id, $min), $min, $max, 15];
        }
        $older = [];
        for ($t = 1; $t <= $r - 2; $t++) {
            array_push($older, ...self::basesOfTier($t));
        }
        if ($older !== []) {
            foreach ($rng->pickArrayKeys($older, min(4, count($older))) as $k) {
                $table[] = [self::formAt($older[$k], $min), $min, $max, 6];
            }
        }
        // un légendaire, très rare, sur chacune des routes 5 à 9
        $legend = self::basesOfTier(10)[$r - 5] ?? null;
        if ($legend !== null) {
            $table[] = [$legend, 40 + $r, 40 + $r, 1];
        }

        return $table;
    }

    private static function town(int $i): Zone
    {
        $rng = self::rng("t$i");
        $w = self::TW;
        $h = self::TH;
        $g = new Grid($w, $h, Tile::GROUND);
        // lisière d'arbres, rues
        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                if ($x < 2 || $x >= $w - 2 || $y < 2 || $y >= $h - 2) {
                    $g->set($x, $y, Tile::TREE);
                }
            }
        }
        $top = $i === self::TOWNS ? 7 : 0;
        $bottom = $i === 1 ? $h - 3 : $h - 1;
        for ($y = $top; $y <= $bottom; $y++) {
            $g->set(14, $y, Tile::PATH);
            $g->set(15, $y, Tile::PATH);
        }
        $g->rect(3, 11, $w - 6, 2, Tile::PATH);
        $g->rect(3, 19, $w - 6, 1, Tile::PATH);
        $hasGym = $i >= 2 && $i <= 9;
        $npcs = [];
        $warps = [];
        // bâtiments : centre de soin (A), boutique (B), arène ou maison (C), maison (D)
        self::building($g, 4, 4, Tile::SHUT, 8);
        self::building($g, 20, 4, Tile::SHUT, 8);
        self::building($g, 4, 14, $hasGym ? Tile::DOOR : Tile::SHUT, 18);
        self::building($g, 20, 14, Tile::SHUT, 18);
        $g->rect(7, 18, 1, 1, Tile::PATH);
        $g->rect(23, 18, 1, 1, Tile::PATH);
        $npcs[] = new Npc("t$i.nurse", 'nurse', 7, 8, 'd', 1, 'nurse');
        $npcs[] = new Npc("t$i.pc", 'pc', 8, 8, 'd', 0, 'pc');
        $npcs[] = new Npc("t$i.shop", 'shop', 23, 8, 'd', 2, 'shop');
        if ($hasGym) {
            $warps[] = new Warp(7, 17, "g$i", 6, self::GH - 2);
        }
        $npcs[] = new Npc("t$i.talk1", 'talk', 21, 18, 'd', 3 + $rng->getInt(0, 4), 'talk' . (($i * 2) % 20));
        $npcs[] = new Npc("t$i.talk2", 'talk', 17, 15, 'l', 3 + $rng->getInt(0, 4), 'talk' . (($i * 2 + 1) % 20));
        $npcs[] = new Npc("t$i.sign", 'sign', 12, 20, 'd', 0, "town$i");
        if ($i === 1) {
            $npcs[] = new Npc('t1.prof', 'prof', 17, 9, 'l', 8, 'prof');
        }
        if ($i === self::TOWNS) {
            self::building($g, 12, 3, Tile::DOOR, 7, 6);
            $g->set(14, 7, Tile::PATH);
            $warps[] = new Warp(15, 6, 'league', 6, self::GH - 2);
            $npcs[] = new Npc('t10.guard', 'guard', 15, 7, 'd', 9, 'guardLeague', need: 8);
        }
        // sorties : nord vers la route i, sud vers la route i-1
        if ($i < self::TOWNS) {
            $warps[] = new Warp(14, 0, "r$i", 11, self::RH - 2);
            $warps[] = new Warp(15, 0, "r$i", 12, self::RH - 2);
        }
        if ($i > 1) {
            $warps[] = new Warp(14, $h - 1, 'r' . ($i - 1), 11, 1);
            $warps[] = new Warp(15, $h - 1, 'r' . ($i - 1), 12, 1);
        }
        self::decorate($g, $rng, $npcs, 0.05, 0.08);

        return new Zone("t$i", Names::TOWNS[$i - 1], 'town', $i, $g->rows(), $warps, $npcs, [], $i);
    }

    /** Bâtiment de 6 × 4 cases (2 rangées de toit, 2 de mur), porte au milieu du bas, allée jusqu'à la rue. */
    private static function building(Grid $g, int $x, int $y, string $door, int $front, int $width = 6): void
    {
        $g->rect($x, $y, $width, 2, Tile::ROOF);
        $g->rect($x, $y + 2, $width, 2, Tile::WALL);
        $g->set($x + 3, $y + 3, $door);
        for ($j = $y + 4; $j <= $front + 2 && $j < $g->h; $j++) {
            if ($g->get($x + 3, $j) === Tile::PATH) {
                break;
            }
            $g->set($x + 3, $j, Tile::PATH);
        }
    }

    /**
     * Fleurs et arbres isolés sur l'herbe rase, loin des allées et des personnages (le passage reste libre).
     *
     * @param list<Npc> $npcs
     */
    private static function decorate(Grid $g, Randomizer $rng, array $npcs, float $trees, float $flowers): void
    {
        $reserved = [];
        foreach ($npcs as $npc) {
            for ($dy = -2; $dy <= 2; $dy++) {
                for ($dx = -2; $dx <= 2; $dx++) {
                    $reserved[($npc->x + $dx) . ',' . ($npc->y + $dy)] = true;
                }
            }
        }
        for ($y = 1; $y < $g->h - 1; $y++) {
            for ($x = 1; $x < $g->w - 1; $x++) {
                if ($g->get($x, $y) !== Tile::GROUND || isset($reserved["$x,$y"])) {
                    continue;
                }
                $nearPath = false;
                for ($dy = -1; $dy <= 1; $dy++) {
                    for ($dx = -1; $dx <= 1; $dx++) {
                        $t = $g->get($x + $dx, $y + $dy);
                        if (in_array($t, [Tile::PATH, Tile::DOOR, Tile::SHUT, Tile::BRIDGE], true)) {
                            $nearPath = true;
                        }
                    }
                }
                $roll = $rng->getFloat(0, 1);
                if (!$nearPath && $roll < $trees) {
                    $g->set($x, $y, Tile::TREE);
                } elseif ($roll > 1 - $flowers) {
                    $g->set($x, $y, Tile::FLOWERS);
                }
            }
        }
    }

    private static function route(int $r): Zone
    {
        $rng = self::rng("r$r");
        $w = self::RW;
        $h = self::RH;
        $g = new Grid($w, $h, Tile::TREE);
        $path = [];
        $brush = static function (int $x, int $y) use ($g, &$path): void {
            for ($dy = 0; $dy <= 1; $dy++) {
                for ($dx = 0; $dx <= 1; $dx++) {
                    if ($y + $dy < $g->h && $x + $dx < $g->w) {
                        $g->set($x + $dx, $y + $dy, Tile::PATH);
                        $path[($x + $dx) . ',' . ($y + $dy)] = true;
                    }
                }
            }
        };
        // chemin sinueux : points de passage tirés au hasard, segments horizontaux puis verticaux
        $points = [[11, $h - 2], [11, $h - 8]];
        for ($y = $h - 14; $y > 8; $y -= 7) {
            $points[] = [$rng->getInt(3, $w - 5), $y];
        }
        $points[] = [11, 6];
        $points[] = [11, -1];
        for ($k = 1, $n = count($points); $k < $n; $k++) {
            [$x0, $y0] = $points[$k - 1];
            [$x1, $y1] = $points[$k];
            for ($x = $x0; $x !== $x1; $x += $x1 > $x0 ? 1 : -1) {
                $brush($x, $y0);
            }
            for ($y = $y0; $y !== $y1; $y += $y1 > $y0 ? 1 : -1) {
                $brush($x1, $y);
            }
            $brush($x1, $y1);
        }
        // clairières autour du chemin (pas près de l'entrée : le garde doit barrer le passage)
        $dist = self::distances($w, $h, $path);
        for ($y = 1; $y < $h - 1; $y++) {
            for ($x = 1; $x < $w - 1; $x++) {
                if (isset($path["$x,$y"]) || $y >= $h - 7 || $y <= 1) {
                    continue;
                }
                $d = $dist[$y][$x];
                if ($d <= 2 || ($d === 3 && $rng->getInt(0, 1) === 0)) {
                    $g->set($x, $y, Tile::GROUND);
                }
            }
        }
        // hautes herbes, mares, rochers
        $pathCells = array_keys($path);
        $patches = 4 + $rng->getInt(0, 3) + ($r === 1 ? 1 : 0);
        for ($p = 0; $p < $patches; $p++) {
            [$cx, $cy] = array_map(intval(...), explode(',', $pathCells[$rng->getInt(0, count($pathCells) - 1)]));
            if ($cy >= $h - 7 || $cy <= 2) {
                $p--;
                continue;
            }
            $pw = $rng->getInt(4, 7);
            $ph = $rng->getInt(3, 5);
            for ($y = $cy - intdiv($ph, 2); $y < $cy - intdiv($ph, 2) + $ph; $y++) {
                for ($x = $cx - intdiv($pw, 2); $x < $cx - intdiv($pw, 2) + $pw; $x++) {
                    if ($y > 1 && $y < $h - 7 && in_array($g->get($x, $y), [Tile::GROUND, Tile::PATH], true)) {
                        $g->set($x, $y, Tile::GRASS);
                    }
                }
            }
        }
        for ($p = 0, $ponds = $rng->getInt(1, 2); $p < $ponds; $p++) {
            $cx = $rng->getInt(3, $w - 4);
            $cy = $rng->getInt(5, $h - 10);
            for ($y = $cy - 2; $y <= $cy + 2; $y++) {
                for ($x = $cx - 3; $x <= $cx + 3; $x++) {
                    $ex = ($x - $cx) / 3;
                    $ey = ($y - $cy) / 2;
                    if ($x > 0 && $x < $w - 1 && $dist[$y][$x] >= 3 && $ex * $ex + $ey * $ey <= 1.1) {
                        $g->set($x, $y, Tile::WATER);
                    }
                }
            }
        }
        for ($y = 2; $y < $h - 7; $y++) {
            for ($x = 1; $x < $w - 1; $x++) {
                if ($g->get($x, $y) === Tile::GROUND && $dist[$y][$x] === 2 && $rng->getInt(1, 100) <= 4) {
                    $g->set($x, $y, Tile::ROCK);
                } elseif ($g->get($x, $y) === Tile::GROUND && $rng->getInt(1, 100) <= 5) {
                    $g->set($x, $y, Tile::FLOWERS);
                }
            }
        }
        $npcs = [];
        if ($r >= 2) {
            $g->set(12, $h - 4, Tile::TREE);
            $npcs[] = new Npc("r$r.guard", 'guard', 11, $h - 4, 'd', 9, 'guard', need: $r - 1);
        }
        $rows = $g->rows();
        // dresseurs au bord du chemin, un par tranche de la route
        $levels = self::routeLevels($r);
        $pool = array_map(static fn (array $e): int => $e[0], array_filter(self::encounters($r), static fn (array $e): bool => $e[3] > 1));
        $pool = array_values($pool);
        $trainers = $r === 1 ? 2 : 3;
        $band = intdiv($h - 12, $trainers);
        for ($t = 0; $t < $trainers; $t++) {
            $spot = self::trainerSpot($rows, $path, $rng, 4 + $t * $band, 4 + ($t + 1) * $band, $npcs);
            if ($spot === null) {
                continue;
            }
            [$x, $y, $dir] = $spot;
            $size = min(3, 1 + ($r >= 3 ? 1 : 0) + $rng->getInt(0, 1));
            $team = [];
            for ($k = 0; $k < $size; $k++) {
                $level = $rng->getInt($levels[0] + 1, $levels[1] + 1);
                $team[] = [self::formAt($pool[$rng->getInt(0, count($pool) - 1)], $level), $level];
            }
            $cls = Names::CLASSES[($r * 3 + $t) % count(Names::CLASSES)];
            $name = Names::FIRST[($r * 7 + $t * 3) % count(Names::FIRST)];
            $reward = 20 * max(array_map(static fn (array $m): int => $m[1], $team));
            $sprite = 10 + (int) array_search($cls, Names::CLASSES, true);
            $npcs[] = new Npc("r$r.trainer$t", 'trainer', $x, $y, $dir, $sprite, 'trainer' . ($t + $r) % 8, $team, $reward, cls: $cls, name: $name);
        }
        // objets à ramasser
        $items = [Item::Potion, Item::Orb];
        if ($r >= 3) {
            $items = [Item::SuperPotion, Item::Orb, Item::Remedy];
        }
        if ($r >= 5) {
            $items = [Item::SuperOrb, Item::Revive, Item::SuperPotion];
        }
        if ($r >= 7) {
            $items = [Item::HyperPotion, Item::HyperOrb, Item::Revive];
        }
        for ($k = 0; $k < 2; $k++) {
            $spot = self::itemSpot($rows, $path, $rng, $npcs, $w, $h);
            if ($spot !== null) {
                $npcs[] = new Npc("r$r.item$k", 'item', $spot[0], $spot[1], 'd', 0, 'item', item: $items[($k + $r) % count($items)]);
            }
        }
        $warps = [
            new Warp(11, $h - 1, "t$r", 14, 1), new Warp(12, $h - 1, "t$r", 15, 1),
            new Warp(11, 0, 't' . ($r + 1), 14, self::TH - 2), new Warp(12, 0, 't' . ($r + 1), 15, self::TH - 2),
        ];

        return new Zone("r$r", ['fr' => "Route $r", 'en' => "Route $r"], 'route', $r, $rows, $warps, $npcs, self::encounters($r), $r);
    }

    /**
     * Distance (en cases, 8 directions) de chaque case au chemin.
     *
     * @param array<string, true> $path
     * @return array<int, array<int, int>>
     */
    private static function distances(int $w, int $h, array $path): array
    {
        /** @var array<int, array<int, int>> $d */
        $d = array_fill(0, $h, array_fill(0, $w, 99));
        $queue = [];
        foreach (array_keys($path) as $key) {
            [$x, $y] = array_map(intval(...), explode(',', $key));
            $d[$y][$x] = 0;
            $queue[] = [$x, $y];
        }
        for ($q = 0; $q < count($queue); $q++) {
            [$x, $y] = $queue[$q];
            for ($dy = -1; $dy <= 1; $dy++) {
                for ($dx = -1; $dx <= 1; $dx++) {
                    $nx = $x + $dx;
                    $ny = $y + $dy;
                    if ($nx >= 0 && $ny >= 0 && $nx < $w && $ny < $h && $d[$ny][$nx] > $d[$y][$x] + 1) {
                        $d[$ny][$nx] = $d[$y][$x] + 1;
                        $queue[] = [$nx, $ny];
                    }
                }
            }
        }

        return $d;
    }

    /**
     * Une case d'herbe rase collée au chemin, entre deux rangées ; le dresseur regarde le chemin.
     *
     * @param list<string> $rows
     * @param array<string, true> $path
     * @param list<Npc> $npcs
     * @return array{0: int, 1: int, 2: string}|null
     */
    private static function trainerSpot(array $rows, array $path, Randomizer $rng, int $y0, int $y1, array $npcs): ?array
    {
        $taken = [];
        foreach ($npcs as $npc) {
            $taken["{$npc->x},{$npc->y}"] = true;
        }
        $candidates = [];
        for ($y = $y0; $y < $y1; $y++) {
            for ($x = 1; $x < strlen($rows[0]) - 1; $x++) {
                if (($rows[$y][$x] ?? '') !== Tile::GROUND || isset($path["$x,$y"]) || isset($taken["$x,$y"])) {
                    continue;
                }
                foreach (['r' => [1, 0], 'l' => [-1, 0], 'd' => [0, 1], 'u' => [0, -1]] as $dir => [$dx, $dy]) {
                    if (isset($path[($x + $dx) . ',' . ($y + $dy)]) && Tile::walkable($rows[$y + $dy][$x + $dx])) {
                        $candidates[] = [$x, $y, $dir];
                        break;
                    }
                }
            }
        }

        return $candidates === [] ? null : $candidates[$rng->getInt(0, count($candidates) - 1)];
    }

    /**
     * Une case d'herbe rase un peu à l'écart du chemin, atteignable à pied.
     *
     * @param list<string> $rows
     * @param array<string, true> $path
     * @param list<Npc> $npcs
     * @return array{0: int, 1: int}|null
     */
    private static function itemSpot(array $rows, array $path, Randomizer $rng, array $npcs, int $w, int $h): ?array
    {
        $blocked = [];
        foreach ($npcs as $npc) {
            if ($npc->kind !== 'guard') {
                $blocked["{$npc->x},{$npc->y}"] = true;
            }
        }
        $reach = Grid::reachable($rows, 11, $h - 2, $blocked);
        $candidates = [];
        for ($y = 3; $y < $h - 8; $y++) {
            for ($x = 1; $x < $w - 1; $x++) {
                $taken = array_any($npcs, static fn (Npc $n): bool => $n->x === $x && $n->y === $y);
                if (isset($reach["$x,$y"]) && $rows[$y][$x] === Tile::GROUND && !isset($path["$x,$y"]) && !$taken) {
                    $near = isset($path[($x - 1) . ",$y"]) || isset($path[($x + 1) . ",$y"]) || isset($path["$x," . ($y - 1)]) || isset($path["$x," . ($y + 1)]);
                    if (!$near) {
                        $candidates[] = [$x, $y];
                    }
                }
            }
        }

        return $candidates === [] ? null : $candidates[$rng->getInt(0, count($candidates) - 1)];
    }

    /** Salle d'arène (ville 2 à 9) : le champion au fond, deux dresseurs, des statues. */
    private static function gym(int $town): Zone
    {
        $badge = $town - 1;
        [$type, $leaderName] = Names::LEADERS[$badge];
        $ace = 8 + 5 * $badge;
        $size = min(5, 2 + intdiv($badge, 2));
        $lines = self::linesOfType($type);
        $team = [];
        for ($k = 0; $k < $size; $k++) {
            $level = $ace - ($size - 1 - $k);
            $team[] = [self::formAt($lines[($k * 3 + $badge) % count($lines)], $level), $level];
        }
        $npcs = [
            new Npc("g$town.leader", 'leader', 6, 2, 'd', 20 + $badge, "leader$badge", $team, 80 * $ace, $badge, cls: 'leader', name: $leaderName),
        ];
        foreach ([[3, 9, 'r'], [9, 6, 'l']] as $k => [$x, $y, $dir]) {
            $lv = $ace - 3 - $k;
            $mini = [
                [self::formAt($lines[($k + 1 + $badge * 2) % count($lines)], $lv), $lv],
                [self::formAt($lines[($k + 2 + $badge) % count($lines)], $lv + 1), $lv + 1],
            ];
            $name = Names::FIRST[($town * 5 + $k) % count(Names::FIRST)];
            $npcs[] = new Npc("g$town.trainer$k", 'trainer', $x, $y, $dir, 18, 'gymTrainer', $mini, 25 * ($lv + 1), cls: 'apprentice', name: $name);
        }

        return new Zone("g$town", ['fr' => 'Arène · ' . Names::TOWNS[$town - 1]['fr'], 'en' => Names::TOWNS[$town - 1]['en'] . ' Arena'], 'gym', $town, self::hall(), [
            new Warp(6, self::GH - 1, "t$town", 7, 18),
        ], $npcs, [], 10 + $badge);
    }

    /** La Ligue (ville 10) : le maître et son équipe de six. */
    private static function league(): Zone
    {
        $team = [];
        $picks = ['leaf', 'tide', 'flame', 'volt', 'frost', 'spirit'];
        foreach ($picks as $k => $type) {
            $level = 52 + $k;
            $lines = self::linesOfType($type);
            $team[] = [self::formAt($lines[($k * 5) % count($lines)], $level), $level];
        }
        $npcs = [
            new Npc('league.champion', 'champion', 6, 2, 'd', 29, 'champion', $team, 8000, 9, cls: 'champion', name: 'Ronce'),
            new Npc('league.trainer0', 'trainer', 3, 9, 'r', 19, 'eliteTrainer', [self::member('stone', 1, 49), self::member('gust', 2, 50)], 2500, cls: 'elite', name: 'Agate'),
            new Npc('league.trainer1', 'trainer', 9, 6, 'l', 19, 'eliteTrainer', [self::member('venom', 1, 50), self::member('normal', 2, 51)], 2500, cls: 'elite', name: 'Basalt'),
        ];

        return new Zone('league', ['fr' => 'Ligue de Cime-Ronce', 'en' => 'Bramble Peak League'], 'gym', 10, self::hall(), [
            new Warp(6, self::GH - 1, 't10', 15, 8),
        ], $npcs, [], 19);
    }

    /**
     * Une créature d'une lignée de ce type, à sa forme du niveau donné.
     *
     * @return array{0: int, 1: int}
     */
    private static function member(string $type, int $line, int $level): array
    {
        $lines = self::linesOfType($type);

        return [self::formAt($lines[$line % count($lines)], $level), $level];
    }

    /**
     * @return list<string>
     */
    private static function hall(): array
    {
        $g = new Grid(self::GW, self::GH, Tile::FLOOR);
        for ($y = 0; $y < self::GH; $y++) {
            for ($x = 0; $x < self::GW; $x++) {
                if ($x === 0 || $y === 0 || $x === self::GW - 1 || $y === self::GH - 1) {
                    $g->set($x, $y, Tile::INWALL);
                }
            }
        }
        foreach ([[2, 3], [10, 3], [2, 11], [10, 11], [2, 7], [10, 7]] as [$x, $y]) {
            $g->set($x, $y, Tile::ROCK);
        }
        $g->set(6, self::GH - 1, Tile::DOOR);

        return $g->rows();
    }

    /**
     * Premières formes des lignées qui comptent ce type (ni compagnons de départ ni légendaires).
     * @return list<int>
     */
    public static function linesOfType(string $type): array
    {
        $out = [];
        $id = 1;
        foreach (Lines::ALL as [$types, $names, , $tier]) {
            if ($tier >= 1 && $tier <= 9 && in_array($type, $types, true)) {
                $out[] = $id;
            }
            $id += count($names);
        }

        return $out;
    }
}
