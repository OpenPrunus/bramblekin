<?php

declare(strict_types=1);

namespace Bramble\Tests\Api;

use Bramble\Api\Nicknames;
use PHPUnit\Framework\TestCase;

final class NicknamesTest extends TestCase
{
    public function testTheFirstPlayerKeepsTheNicknameUntilItExpires(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'nicks');
        self::assertIsString($file);
        $n = new Nicknames($file);
        $t = 1_800_000_000;
        self::assertTrue($n->claim('Machin', 'aaaaaaaaaaaa', $t));
        self::assertTrue($n->claim('Machin', 'aaaaaaaaaaaa', $t + 5), 'son propriétaire le garde');
        self::assertFalse($n->claim('machin', 'bbbbbbbbbbbb', $t + 10), 'insensible à la casse');
        self::assertFalse($n->claim('MACHIN', 'bbbbbbbbbbbb', $t + 10));
        self::assertTrue($n->claim('Bidule', 'bbbbbbbbbbbb', $t + 10));
        // changer de pseudo libère l'ancien
        self::assertTrue($n->claim('Truc', 'aaaaaaaaaaaa', $t + 20));
        self::assertTrue($n->claim('Machin', 'bbbbbbbbbbbb', $t + 30));
        self::assertTrue($n->claim('Bidule', 'cccccccccccc', $t + 40), 'Bob a pris Machin : Bidule est libre');
        // 90 jours sans l'utiliser : le pseudo redevient libre
        self::assertFalse($n->claim('Truc', 'dddddddddddd', $t + 100));
        self::assertTrue($n->claim('Truc', 'dddddddddddd', $t + 20 + Nicknames::EXPIRE + 1));
        unlink($file);
    }
}
