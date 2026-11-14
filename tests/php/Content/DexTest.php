<?php

declare(strict_types=1);

namespace Bramble\Tests\Content;

use Bramble\Content\Dex;
use Bramble\Content\Moves;
use Bramble\Content\Type;
use Bramble\World\World;
use PHPUnit\Framework\TestCase;

final class DexTest extends TestCase
{
    public function testThereAreExactly150SpeciesWithUniqueNames(): void
    {
        $all = Dex::all();
        self::assertCount(150, $all);
        self::assertSame(range(1, 150), array_keys($all));
        $names = array_map(static fn ($s): string => mb_strtolower($s->name), $all);
        self::assertCount(150, array_unique($names), 'noms en double');
    }

    public function testEvolutionsPointToTheNextStageAtIncreasingLevels(): void
    {
        foreach (Dex::all() as $s) {
            if ($s->evolvesTo === null) {
                continue;
            }
            $next = Dex::get($s->evolvesTo);
            self::assertSame($s->line, $next->line);
            self::assertSame($s->stage + 1, $next->stage);
            self::assertGreaterThan(1, $s->evolveLevel);
            if ($next->evolvesTo !== null) {
                self::assertGreaterThan($s->evolveLevel, $next->evolveLevel, $s->name);
            }
            self::assertGreaterThan(array_sum($s->base), array_sum($next->base), "{$next->name} doit être plus fort que {$s->name}");
        }
    }

    public function testEveryLearnedMoveExistsAndEverySpeciesStartsWithTwoMoves(): void
    {
        foreach (Dex::all() as $s) {
            foreach ($s->learnset as [$level, $move]) {
                self::assertTrue(Moves::exists($move), "$move ({$s->name})");
            }
            self::assertCount(2, $s->movesAt(1));
            self::assertLessThanOrEqual(4, count($s->movesAt(100)));
            self::assertContains(count($s->types), [1, 2]);
        }
    }

    public function testEveryCreatureCanBeObtained(): void
    {
        $obtainable = array_fill_keys(Dex::STARTERS, true);
        for ($r = 1; $r <= 9; $r++) {
            foreach (World::encounters($r) as [$species]) {
                $obtainable[$species] = true;
            }
        }
        // évolutions de tout ce qu'on peut obtenir
        do {
            $grew = false;
            foreach (array_keys($obtainable) as $id) {
                $next = Dex::get($id)->evolvesTo;
                if ($next !== null && !isset($obtainable[$next])) {
                    $obtainable[$next] = true;
                    $grew = true;
                }
            }
        } while ($grew);
        $missing = array_diff(array_keys(Dex::all()), array_keys($obtainable));
        self::assertSame([], array_values($missing), 'créatures introuvables : ' . implode(', ', array_map(static fn (int $id): string => Dex::get($id)->name, $missing)));
    }

    public function testTypeChart(): void
    {
        self::assertSame(2.0, Type::Tide->against(Type::Flame));
        self::assertSame(0.5, Type::Flame->against(Type::Tide));
        self::assertSame(4.0, Type::Tide->against(Type::Flame, Type::Stone));
        self::assertSame(0.0, Type::Volt->against(Type::Stone));
        self::assertSame(0.0, Type::Normal->against(Type::Spirit));
        self::assertSame(1.0, Type::Normal->against(Type::Normal));
        foreach (Type::chart() as $attacker => $row) {
            self::assertNotNull(Type::tryFrom($attacker));
            foreach (array_keys($row) as $defender) {
                self::assertNotNull(Type::tryFrom($defender));
            }
        }
    }

    public function testMovesHaveFrenchAndEnglishNames(): void
    {
        self::assertGreaterThanOrEqual(60, count(Moves::all()));
        foreach (Moves::all() as $m) {
            self::assertNotSame('', $m->name['fr']);
            self::assertNotSame('', $m->name['en']);
            self::assertGreaterThan(0, $m->pp);
        }
    }
}
