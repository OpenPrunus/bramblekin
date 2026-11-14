<?php

declare(strict_types=1);

namespace Bramble\Tests\World;

use Bramble\Content\Dex;
use Bramble\World\Grid;
use Bramble\World\Npc;
use Bramble\World\Tile;
use Bramble\World\World;
use Bramble\World\Zone;
use PHPUnit\Framework\TestCase;

final class WorldTest extends TestCase
{
    public function testTenTownsNineRoutesEightGymsAndTheLeague(): void
    {
        $zones = World::zones();
        self::assertCount(28, $zones);
        self::assertCount(10, array_filter($zones, static fn (Zone $z): bool => $z->kind === 'town'));
        self::assertCount(9, array_filter($zones, static fn (Zone $z): bool => $z->kind === 'route'));
        $leaders = [];
        foreach ($zones as $zone) {
            foreach ($zone->npcs as $npc) {
                if ($npc->kind === 'leader') {
                    $leaders[] = $npc->badge;
                }
            }
        }
        sort($leaders);
        self::assertSame(range(1, 8), $leaders);
    }

    public function testGenerationIsDeterministicAndRectangular(): void
    {
        foreach (World::zones() as $zone) {
            $w = $zone->width();
            foreach ($zone->rows as $row) {
                self::assertSame($w, strlen($row), $zone->id);
            }
        }
        $a = (new \ReflectionClass(World::class))->getMethod('route')->invoke(null, 4);
        self::assertSame(World::zone('r4')?->rows, $a->rows);
    }

    /** @return array<string, true> */
    private static function blocked(Zone $zone, bool $guardsGone): array
    {
        $b = [];
        foreach ($zone->npcs as $npc) {
            if (!($guardsGone && $npc->kind === 'guard')) {
                $b["{$npc->x},{$npc->y}"] = true;
            }
        }

        return $b;
    }

    public function testWarpsLeadToWalkableCellsAndComeBack(): void
    {
        foreach (World::zones() as $zone) {
            foreach ($zone->warps as $warp) {
                $to = World::zone($warp->zone);
                self::assertNotNull($to, $warp->zone);
                self::assertTrue(Tile::walkable($to->tile($warp->toX, $warp->toY)), "{$zone->id} → {$warp->zone}");
                self::assertNull($to->warpAt($warp->toX, $warp->toY), 'arrivée sur un passage');
                self::assertTrue(Tile::walkable($zone->tile($warp->x, $warp->y)), "passage praticable dans {$zone->id}");
                $back = array_filter($to->warps, static fn ($w): bool => $w->zone === $zone->id);
                self::assertNotEmpty($back, "retour de {$warp->zone} vers {$zone->id}");
            }
        }
    }

    public function testEveryRouteCanBeCrossedOnceTheGuardStepsAside(): void
    {
        for ($r = 1; $r <= 9; $r++) {
            $zone = World::zone("r$r");
            self::assertNotNull($zone);
            $h = $zone->height();
            $open = Grid::reachable($zone->rows, 11, $h - 2, self::blocked($zone, true));
            self::assertArrayHasKey('11,1', $open, "route $r traversable");
            self::assertArrayHasKey('12,0', $open);
            if ($r >= 2) {
                $closed = Grid::reachable($zone->rows, 11, $h - 2, self::blocked($zone, false));
                self::assertArrayNotHasKey('11,1', $closed, "le garde de la route $r barre le passage");
            }
            self::assertNotEmpty($zone->encounters);
            self::assertStringContainsString(Tile::GRASS, implode('', $zone->rows));
        }
    }

    public function testEveryCharacterCanBeTalkedTo(): void
    {
        foreach (World::zones() as $zone) {
            $start = match ($zone->kind) {
                'route' => [11, $zone->height() - 2],
                'town' => $zone->id === 't1' ? World::start() : [0, 14, $zone->height() - 2],
                default => [0, 6, $zone->height() - 2],
            };
            [$x, $y] = $zone->kind === 'route' ? $start : [$start[1], $start[2]];
            $reach = Grid::reachable($zone->rows, $x, $y, self::blocked($zone, true));
            foreach ($zone->npcs as $npc) {
                $ok = false;
                foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                    $ok = $ok || isset($reach[($npc->x + $dx) . ',' . ($npc->y + $dy)]);
                }
                self::assertTrue($ok, "{$npc->id} inaccessible");
                self::assertFalse(Tile::walkable($zone->tile($npc->x, $npc->y)) && $zone->warpAt($npc->x, $npc->y) !== null);
            }
        }
    }

    public function testDifficultyRisesAlongTheJourney(): void
    {
        $previous = 0;
        for ($g = 2; $g <= 9; $g++) {
            $leader = World::zone("g$g")?->npc("g$g.leader");
            self::assertInstanceOf(Npc::class, $leader);
            $ace = max(array_map(static fn (array $m): int => $m[1], $leader->team));
            self::assertGreaterThan($previous, $ace);
            [, $max] = World::routeLevels($g - 1);
            self::assertGreaterThan($max, $ace, "le champion $g dépasse les sauvages de la route qui y mène");
            $previous = $ace;
        }
        $champion = World::zone('league')?->npc('league.champion');
        self::assertNotNull($champion);
        self::assertCount(6, $champion->team);
        foreach (World::zones() as $zone) {
            foreach ($zone->npcs as $npc) {
                foreach ($npc->team as [$species, $level]) {
                    self::assertTrue(Dex::exists($species));
                    self::assertSame(World::formAt(self::base($species), $level), $species, "{$npc->id} : forme cohérente avec le niveau");
                }
            }
        }
    }

    private static function base(int $species): int
    {
        $line = Dex::get($species)->line;
        foreach (Dex::all() as $s) {
            if ($s->line === $line && $s->stage === 1) {
                return $s->id;
            }
        }

        return $species;
    }
}
