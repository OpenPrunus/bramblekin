<?php

declare(strict_types=1);

namespace Bramble\Tests\Game;

use Bramble\Api\Nicknames;
use Bramble\Game\Client;
use Bramble\Game\Config;
use Bramble\Game\GameHub;
use Bramble\Game\Relay;
use Bramble\Player\ProfileStore;
use Bramble\Ranking\Ratings;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;

final class RelayTest extends TestCase
{
    private string $dir;
    private GameHub $hub;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/bramble-relay-' . bin2hex(random_bytes(4));
        mkdir($this->dir . '/players', 0777, true);
        $this->hub = new GameHub(
            new ProfileStore($this->dir . '/players'),
            new Ratings($this->dir . '/ratings.json'),
            new Config(),
            new FakeClock(),
            new NullLogger(),
            relay: new Relay(new Nicknames($this->dir . '/names.json')),
        );
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*.json') ?: [] as $f) {
            unlink($f);
        }
        @rmdir($this->dir . '/players');
        @rmdir($this->dir);
    }

    /**
     * @param array<string, mixed> $where
     * @return array{0: Client, 1: FakeTransport}
     */
    private function join(string $token, string $name, array $where): array
    {
        $t = new FakeTransport();
        $c = $this->hub->accept($t);
        $this->send($c, ['t' => 'whereHello', 'token' => str_pad($token, 32, 'x'), 'name' => $name, ...$where]);

        return [$c, $t];
    }

    /** @param array<string, mixed> $msg */
    private function send(Client $c, array $msg): void
    {
        $this->hub->receive($c, json_encode($msg, JSON_THROW_ON_ERROR));
    }

    public function testPlayersOfTheSamePlaceSeeEachOtherMoveInRealTime(): void
    {
        [$a, $ta] = $this->join('alice', 'Alice', ['place' => 'out', 'x' => 15, 'y' => 600, 'd' => 'u']);
        self::assertSame([], $ta->last('wherePeers')['peers'] ?? null);
        $aliceId = $ta->last('wherePeers')['me'] ?? null;
        self::assertIsString($aliceId);
        self::assertSame(substr(hash('sha256', 'public:' . str_pad('alice', 32, 'x')), 0, 12), $aliceId, 'même identifiant public que le chat');

        [$b, $tb] = $this->join('bob', 'Bob', ['place' => 'out', 'x' => 15, 'y' => 602, 'd' => 'u']);
        self::assertSame([['id' => $aliceId, 'name' => 'Alice', 'x' => 15, 'y' => 600, 'd' => 'u']], $tb->last('wherePeers')['peers'] ?? null);
        self::assertSame('Bob', $ta->last('whereJoin')['name'] ?? null);

        // chaque pas d'Alice arrive aussitôt chez Bob
        $this->send($a, ['t' => 'where', 'place' => 'out', 'x' => 15, 'y' => 599, 'd' => 'u']);
        self::assertSame(['t' => 'whereMove', 'id' => $aliceId, 'x' => 15, 'y' => 599, 'd' => 'u'], $tb->last('whereMove'));
        self::assertNull($ta->last('whereMove'), 'on ne reçoit pas ses propres pas');

        // Alice entre dans un centre de soin : Bob la voit partir ; elle n'y voit personne
        $this->send($a, ['t' => 'where', 'place' => 'c1', 'x' => 5, 'y' => 8, 'd' => 'u']);
        self::assertSame($aliceId, $tb->last('whereLeave')['id'] ?? null);
        self::assertSame([], $ta->last('wherePeers')['peers'] ?? null);
        $moves = count($tb->of('whereMove'));
        $this->send($a, ['t' => 'where', 'place' => 'c1', 'x' => 5, 'y' => 7, 'd' => 'u']);
        self::assertCount($moves, $tb->of('whereMove'), 'les pas dans un autre lieu ne sont pas relayés');

        // la chambre ha1 est privée : deux joueurs n'y sont jamais ensemble
        $this->send($a, ['t' => 'where', 'place' => 'ha1', 'x' => 2, 'y' => 2, 'd' => 'd']);
        $this->send($b, ['t' => 'where', 'place' => 'ha1', 'x' => 2, 'y' => 2, 'd' => 'd']);
        self::assertSame([], $tb->last('wherePeers')['peers'] ?? null);

        // déconnexion : les autres du lieu le voient disparaître
        $this->send($b, ['t' => 'where', 'place' => 'c1', 'x' => 5, 'y' => 8, 'd' => 'u']);
        $this->send($a, ['t' => 'where', 'place' => 'c1', 'x' => 5, 'y' => 7, 'd' => 'u']);
        $this->hub->disconnect($a);
        self::assertSame($aliceId, $tb->last('whereLeave')['id'] ?? null);
    }

    public function testReservedNamesAndBadMessages(): void
    {
        [, $ta] = $this->join('alice', 'Alice', ['place' => 'out', 'x' => 1, 'y' => 1, 'd' => 'd']);
        // Bob ne peut pas apparaître sous le pseudo d'Alice
        [, $tb] = $this->join('bob', 'ALICE', ['place' => 'out', 'x' => 2, 'y' => 1, 'd' => 'd']);
        self::assertSame('', $ta->last('whereJoin')['name'] ?? null);
        // mauvais jeton, mauvais lieu, pas encore annoncé
        $t = new FakeTransport();
        $c = $this->hub->accept($t);
        $this->send($c, ['t' => 'where', 'place' => 'out', 'x' => 1, 'y' => 1, 'd' => 'd']);
        $this->send($c, ['t' => 'whereHello', 'token' => 'court', 'place' => 'out', 'x' => 1, 'y' => 1]);
        $this->send($c, ['t' => 'whereHello', 'token' => str_repeat('z', 32), 'place' => '../x', 'x' => 1, 'y' => 1]);
        self::assertSame(['not_ready', 'bad_hello', 'bad_hello'], array_column($t->of('error'), 'code'));
        self::assertNull($tb->last('error'));
    }

    public function testASecondTabReplacesTheFirst(): void
    {
        [, $tb] = $this->join('bob', 'Bob', ['place' => 'out', 'x' => 1, 'y' => 1, 'd' => 'd']);
        $this->join('alice', 'Alice', ['place' => 'out', 'x' => 2, 'y' => 1, 'd' => 'd']);
        $this->join('alice', 'Alice', ['place' => 'out', 'x' => 3, 'y' => 1, 'd' => 'd']);
        self::assertCount(1, $tb->of('whereLeave'));
        self::assertCount(2, $tb->of('whereJoin'));
    }
}
