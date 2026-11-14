<?php

declare(strict_types=1);

namespace Bramble\Tests\Battle;

use Bramble\Battle\Action;
use Bramble\Battle\Battle;
use Bramble\Battle\Fighter;
use Bramble\Battle\Kind;
use Bramble\Content\Item;
use Bramble\Content\Moves;
use Bramble\Content\Status;
use Bramble\Creature\Kin;
use PHPUnit\Framework\TestCase;
use Random\Engine\Mt19937;
use Random\Randomizer;

final class BattleTest extends TestCase
{
    private static function battle(Kind $kind, array $mine, array $theirs, int $seed = 1): Battle
    {
        return new Battle($kind, [new Fighter($mine, false, 'Moi'), new Fighter($theirs, $kind !== Kind::Duel, 'Eux')], new Randomizer(new Mt19937($seed)));
    }

    private static function withMoves(Kin $kin, string ...$moves): Kin
    {
        $kin->moves = array_map(static fn (string $m): array => [$m, Moves::get($m)->pp], $moves);

        return $kin;
    }

    public function testSuperEffectiveHitsHarderAndFaintAwardsXp(): void
    {
        $me = self::withMoves(Kin::create(1, 7, 20), 'tide3');    // Gouttelin (eau)
        $fire = Kin::create(-1, 4, 20);                             // Braisillon (feu)
        $leaf = Kin::create(-2, 1, 20);                             // Pousseron (plante)
        $b1 = self::battle(Kind::Wild, [$me], [$fire]);
        $log1 = $b1->resolve(Action::move(0), Action::move(0));
        $b2 = self::battle(Kind::Wild, [self::withMoves(Kin::create(1, 7, 20), 'tide3')], [$leaf]);
        $log2 = $b2->resolve(Action::move(0), Action::move(0));
        $hit = static fn (array $log): array => array_values(array_filter($log, static fn (array $e): bool => $e['k'] === 'hit' && $e['s'] === 0))[0] ?? [];
        self::assertSame(2.0, $hit($log1)['eff'] ?? null);
        self::assertSame(0.5, $hit($log2)['eff'] ?? null);
        self::assertGreaterThan($hit($log2)['dmg'], $hit($log1)['dmg']);
    }

    public function testWildBattleEndsWithXpAndLevel(): void
    {
        $me = self::withMoves(Kin::create(1, 7, 30), 'tide5');
        $foe = Kin::create(-1, 4, 3);
        $b = self::battle(Kind::Wild, [$me], [$foe]);
        $log = [];
        for ($i = 0; $i < 10 && !$b->over(); $i++) {
            array_push($log, ...$b->resolve(Action::move(0), $b->autoAction(1)));
        }
        self::assertSame(0, $b->winner);
        self::assertContains('faint', array_column($log, 'k'));
        self::assertContains('xp', array_column($log, 'k'));
        self::assertGreaterThan(Kin::xpFor(30), $me->xp);
    }

    public function testImmunityAndStatus(): void
    {
        $me = self::withMoves(Kin::create(1, 19, 20), 'volt2', 'voltS');   // Étincelot (volt)
        $rock = Kin::create(-1, 22, 20);                                     // Caillouto (roche)
        $b = self::battle(Kind::Trainer, [$me], [$rock]);
        $log = $b->resolve(Action::move(0), Action::move(0));
        self::assertContains('immune', array_column($log, 'k'));
        $water = Kin::create(-2, 7, 20);
        $b = self::battle(Kind::Trainer, [self::withMoves(Kin::create(1, 19, 20), 'voltS')], [$water], 3);
        for ($i = 0; $i < 6 && $water->status === null; $i++) {
            $b->resolve(Action::move(0), $b->autoAction(1));
        }
        self::assertSame(Status::Paralysis, $water->status);
    }

    public function testCatchingAWeakCreatureEventuallySucceeds(): void
    {
        $caught = 0;
        for ($seed = 1; $seed <= 30; $seed++) {
            $foe = Kin::create(0, 10, 3);
            $foe->hp = 1;
            $b = self::battle(Kind::Wild, [Kin::create(1, 7, 10)], [$foe], $seed);
            self::assertNull($b->validate(0, Action::catch(Item::Orb)));
            $log = $b->resolve(Action::catch(Item::Orb), $b->autoAction(1));
            if ($b->ending === 'caught') {
                $caught++;
                self::assertSame($foe, $b->caught);
                self::assertSame(3, $log[0]['shakes']);
            }
        }
        self::assertGreaterThan(12, $caught);
        // impossible de capturer la créature d'un dresseur ou de fuir
        $b = self::battle(Kind::Trainer, [Kin::create(1, 7, 10)], [Kin::create(-1, 10, 3)]);
        self::assertSame('no_catch', $b->validate(0, Action::catch(Item::Orb)));
        self::assertSame('no_run', $b->validate(0, Action::run()));
    }

    public function testFaintedPlayerMustSendAReplacement(): void
    {
        $weak = Kin::create(1, 10, 2);
        $strong = Kin::create(2, 7, 30);
        $foe = self::withMoves(Kin::create(-1, 6, 40), 'flame5');
        $b = self::battle(Kind::Trainer, [$weak, $strong], [$foe]);
        for ($i = 0; $i < 5 && !$b->replace[0]; $i++) {
            $b->resolve(Action::move(0), Action::move(0));
        }
        self::assertTrue($b->replace[0]);
        self::assertSame('need_replace', $b->validate(0, Action::move(0)));
        self::assertNull($b->replaceWith(0, 0), 'pas une créature K.-O.');
        self::assertNotNull($b->replaceWith(0, 1));
        self::assertSame(1, $b->sides[0]->active);
        self::assertNull($b->validate(0, Action::move(0)));
    }

    public function testDuelLogCanBeFlippedForTheOtherSide(): void
    {
        $log = [['k' => 'hit', 's' => 0, 't' => 1, 'dmg' => 3], ['k' => 'faint', 't' => 1]];
        self::assertSame([['k' => 'hit', 's' => 1, 't' => 0, 'dmg' => 3], ['k' => 'faint', 't' => 0]], Battle::flip($log));
    }

    public function testSwitchingHappensBeforeMovesAndStruggleWithoutPp(): void
    {
        $a = Kin::create(1, 7, 20);
        $b2 = Kin::create(2, 1, 20);
        $b = self::battle(Kind::Duel, [$a, $b2], [Kin::create(3, 4, 20)]);
        $log = $b->resolve(Action::switch(1), Action::move(0));
        self::assertSame('send', $log[0]['k']);
        foreach ($a->moves as $i => $m) {
            $a->moves[$i][1] = 0;
        }
        $b->resolve(Action::switch(0), Action::move(0));
        self::assertSame('bad_move', $b->validate(0, Action::move(0)));
        self::assertNull($b->validate(0, Action::move(-1)));
        $log = $b->resolve(Action::move(-1), Action::move(0));
        self::assertContains(['k' => 'use', 's' => 0, 'm' => Battle::STRUGGLE], $log);
    }
}
