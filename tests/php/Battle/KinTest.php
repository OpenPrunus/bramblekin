<?php

declare(strict_types=1);

namespace Bramble\Tests\Battle;

use Bramble\Content\Dex;
use Bramble\Content\Status;
use Bramble\Creature\Kin;
use PHPUnit\Framework\TestCase;

final class KinTest extends TestCase
{
    public function testStatsGrowWithLevel(): void
    {
        $low = Kin::create(1, 1, 5);
        $high = Kin::create(2, 1, 50);
        self::assertGreaterThan($low->maxHp(), $high->maxHp());
        self::assertGreaterThan($low->stat('atk'), $high->stat('atk'));
        self::assertSame($low->maxHp(), $low->hp);
        self::assertSame(125, $low->xp);
    }

    public function testLevelUpLearnsMovesAndEvolvesAtTheRightLevel(): void
    {
        $kin = Kin::create(1, 1, 5);              // Pousseron
        self::assertSame(['normal1', 'growl', 'leaf1'], array_map(static fn (array $m): string => $m[0], $kin->moves));
        $events = $kin->gainXp(Kin::xpFor(16) - $kin->xp);
        self::assertSame(16, $kin->level);
        $kinds = array_column($events, 'k');
        self::assertContains('level', $kinds);
        self::assertContains('learn', $kinds);      // 4e attaque (Coup vif au niveau 8)
        self::assertContains('wants', $kinds);      // la 5e attend une décision
        self::assertCount(4, $kin->moves);
        self::assertNotSame([], $kin->pending);
        self::assertSame(1, $kin->evolveIfReady());
        self::assertSame(2, $kin->species);
        self::assertNull($kin->evolveIfReady());
    }

    public function testPendingMoveReplacesTheChosenSlot(): void
    {
        $kin = Kin::create(1, 4, 15);
        $kin->pending = ['flame2'];
        self::assertFalse($kin->resolvePending('nope', 0));
        self::assertTrue($kin->resolvePending('flame2', 1));
        self::assertSame('flame2', $kin->moves[1][0]);
        self::assertSame([], $kin->pending);
    }

    public function testSerializationRoundTrip(): void
    {
        $kin = Kin::create(7, 50, 23);
        $kin->hp = 3;
        $kin->status = Status::Poison;
        $kin->moves[0][1] = 2;
        $copy = Kin::tryFromArray(json_decode(json_encode($kin->toArray(), JSON_THROW_ON_ERROR), true));
        self::assertNotNull($copy);
        self::assertSame($kin->toArray(), $copy->toArray());
        self::assertNull(Kin::tryFromArray(['s' => 999, 'l' => 5, 'u' => 1]));
    }

    public function testDuelCopyIsLevel50AndHealed(): void
    {
        $kin = Kin::create(1, 10, 12);
        $kin->hp = 1;
        $copy = $kin->duelCopy(50);
        self::assertSame(50, $copy->level);
        self::assertSame($copy->maxHp(), $copy->hp);
        self::assertSame(1, $kin->hp);
        self::assertSame(Dex::get(10)->id, $copy->species);
    }
}
