<?php

declare(strict_types=1);

namespace Bramble\Tests\Game;

use Arcade\Fair\RankingGuard;
use Bramble\Game\Client;
use Bramble\Game\Config;
use Bramble\Game\GameHub;
use Bramble\Player\ProfileStore;
use Bramble\Ranking\Ratings;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Random\Engine\Mt19937;
use Random\Randomizer;

final class HubTest extends TestCase
{
    private string $dir;
    private FakeClock $clock;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/bramble-test-' . bin2hex(random_bytes(4));
        mkdir($this->dir . '/players', 0777, true);
        $this->clock = new FakeClock();
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/players/*') ?: [] as $f) {
            unlink($f);
        }
        foreach (glob($this->dir . '/*.json') ?: [] as $f) {
            unlink($f);
        }
        @rmdir($this->dir . '/players');
        @rmdir($this->dir);
    }

    private function hub(float $encounter = 0.0, int $seed = 1): GameHub
    {
        return new GameHub(
            new ProfileStore($this->dir . '/players'),
            new Ratings($this->dir . '/ratings.json'),
            new Config(encounterRate: $encounter, stepMs: 100, turnSeconds: 5),
            $this->clock,
            new NullLogger(),
            new Randomizer(new Mt19937($seed)),
            new RankingGuard(allowSameIp: true),
        );
    }

    /** @return array{0: Client, 1: FakeTransport} */
    private function join(GameHub $hub, string $name, string $token, bool $starter = true): array
    {
        $t = new FakeTransport();
        $c = $hub->accept($t);
        $hub->receive($c, json_encode(['t' => 'hello', 'name' => $name, 'token' => str_pad($token, 32, 'x')], JSON_THROW_ON_ERROR));
        $fresh = $starter && ($t->last('welcome')['starter'] ?? false) === true;
        if ($fresh) {
            $hub->receive($c, '{"t":"starter","sp":7}');
        }
        if ($fresh && $c->profile !== null) {
            // sur la place de Bourg-Ronce, comme avant le scénario d'introduction
            $hub->presence->leave($c, $c->profile->zone);
            [$c->profile->zone, $c->profile->x, $c->profile->y, $c->profile->dir] = ['t1', 15, 13, 'u'];
            $hub->presence->enter($c);
        }

        return [$c, $t];
    }

    /** @param array<string, mixed> $msg */
    private static function send(GameHub $hub, Client $c, array $msg): void
    {
        $hub->receive($c, json_encode($msg, JSON_THROW_ON_ERROR));
    }

    private function walk(GameHub $hub, Client $c, string $dir, int $n = 1): void
    {
        for ($i = 0; $i < $n; $i++) {
            $this->clock->advance(0.2);
            self::send($hub, $c, ['t' => 'step', 'd' => $dir, 'n' => $i]);
        }
    }

    public function testHelloStarterAndZone(): void
    {
        $hub = $this->hub();
        $t = new FakeTransport();
        $c = $hub->accept($t);
        self::send($hub, $c, ['t' => 'hello', 'name' => 'x', 'token' => str_repeat('a', 32)]);
        self::assertSame('bad_name', $t->last('error')['code']);
        self::send($hub, $c, ['t' => 'hello', 'name' => 'Alice', 'token' => 'short']);
        self::assertSame('bad_token', $t->last('error')['code']);
        self::send($hub, $c, ['t' => 'hello', 'name' => 'Alice', 'token' => str_repeat('a', 32)]);
        $welcome = $t->last('welcome');
        self::assertTrue($welcome['starter']);
        self::assertCount(150, $welcome['content']['species']);
        $zone = $t->last('zone');
        self::assertSame('ha1', $zone['zone']['id'], 'on commence dans sa chambre');
        self::send($hub, $c, ['t' => 'starter', 'sp' => 2]);
        self::assertSame('bad_starter', $t->last('error')['code']);
        self::send($hub, $c, ['t' => 'starter', 'sp' => 4]);
        self::assertSame(4, $t->last('profile')['profile']['team'][0]['sp']);
        self::assertSame(5, $t->last('profile')['profile']['team'][0]['lv']);
        // un deuxième joueur avec le même pseudo est refusé
        [, $t2] = $this->join($hub, 'alice', 'other');
        self::assertSame('name_taken', $t2->last('error')['code']);
    }

    public function testStepsAreValidatedAndSeenByOthers(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        [$b, $tb] = $this->join($hub, 'Bob', 'bob');
        self::assertSame('Alice', $tb->last('zone')['peers'][0]['name'] ?? null);
        $this->walk($hub, $a, 'u');
        $peer = $tb->last('peer');
        self::assertSame([$a->id, 15, 12], [$peer['id'], $peer['x'], $peer['y']]);
        // trop vite : refusé
        for ($i = 0; $i < 8; $i++) {
            self::send($hub, $a, ['t' => 'step', 'd' => 'd', 'n' => 100 + $i]);
        }
        self::assertNotNull($ta->last('pos'));
        // dans un mur : refusé, position renvoyée
        $p = $a->profile;
        self::assertNotNull($p);
        [$p->x, $p->y] = [2, 3];
        $this->walk($hub, $a, 'l');
        self::assertSame(2, $ta->last('pos')['x']);
        self::assertSame([2, 3], [$p->x, $p->y]);
        // départ : les autres le voient partir
        $hub->disconnect($b);
        self::assertSame($b->id, $ta->last('gone')['id']);
    }

    public function testWalkingNorthLeadsToRouteOneAndGrassStartsAWildBattle(): void
    {
        $hub = $this->hub(1.0);
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        $this->walk($hub, $a, 'u', 14);
        self::assertSame('r1', $ta->last('zone')['zone']['id']);
        $p = $a->profile;
        self::assertNotNull($p);
        $zone = \Bramble\World\World::zone('r1');
        self::assertNotNull($zone);
        // téléporte à côté d'une herbe haute et fait un pas dedans
        foreach ($zone->rows as $y => $row) {
            $x = strpos($row, '"');
            if ($x !== false && $x > 0 && $zone->free($x - 1, $y, static fn (): bool => true)) {
                [$p->x, $p->y] = [$x - 1, $y];
                break;
            }
        }
        $a->grace = 0;
        $this->walk($hub, $a, 'r');
        $battle = $ta->last('battle');
        self::assertNotNull($battle, 'rencontre sauvage');
        self::assertSame('wild', $battle['intro']['kind']);
        // pendant le combat, on ne bouge plus
        $this->walk($hub, $a, 'r');
        self::assertNotNull($ta->last('pos'));
        // on se bat jusqu'au bout (ou on capture)
        for ($i = 0; $i < 40 && $a->fight !== null; $i++) {
            $view = $ta->last('turn')['view'] ?? $battle['view'];
            if ($view['replace']) {
                foreach ($view['team'] as $k => $kin) {
                    if ($kin['hp'] > 0) {
                        self::send($hub, $a, ['t' => 'replace', 'i' => $k]);
                        break;
                    }
                }
                continue;
            }
            self::send($hub, $a, $i % 3 === 2 ? ['t' => 'act', 'k' => 'catch', 'item' => 'orb'] : ['t' => 'act', 'k' => 'move', 'i' => 0]);
        }
        self::assertNull($a->fight);
        self::assertContains($ta->last('battleEnd')['result'], ['win', 'caught', 'lose']);
        self::assertFileExists(glob($this->dir . '/players/*.json')[0] ?? '');
    }

    public function testNurseHealsAndTheSaveSurvivesAReconnection(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        $p = $a->profile;
        self::assertNotNull($p);
        $p->team[0]->hp = 1;
        $p->money = 4321;
        [$p->zone, $p->x, $p->y, $p->dir] = ['c1', 5, 3, 'u'];
        self::send($hub, $a, ['t' => 'interact']);
        self::assertSame('nurse', $ta->last('say')['text']);
        self::assertSame($p->team[0]->maxHp(), $p->team[0]->hp);
        // la même personne revient : l'ancienne connexion est fermée, la sauvegarde est reprise
        [$a2, $ta2] = $this->join($hub, 'Alice', 'alice');
        self::assertNotNull($ta->last('kicked'));
        self::assertFalse($ta2->last('welcome')['starter']);
        self::assertSame(4321, $ta2->last('welcome')['profile']['money']);
        self::assertSame(['c1', 5, 3], [$a2->profile?->zone, $a2->profile?->x, $a2->profile?->y]);
        self::assertSame(1, $a2->profile?->healTown);
    }

    public function testIntroductionHomeProfessorAndLab(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice', false);
        $p = $a->profile;
        self::assertNotNull($p);
        self::assertSame(['ha1', 5, 5], [$p->zone, $p->x, $p->y]);
        // la mère parle du professeur
        [$p->x, $p->y, $p->dir] = [4, 3, 'l'];
        self::send($hub, $a, ['t' => 'interact']);
        self::assertSame('homeStart', $ta->last('say')['text']);
        // sortir de la ville sans compagnon : le professeur arrête le joueur
        $hub->presence->leave($a, $p->zone);
        [$p->zone, $p->x, $p->y] = ['t1', 14, 1];
        $hub->presence->enter($a);
        $this->walk($hub, $a, 'u');
        self::assertSame('profStop', $ta->last('say')['text']);
        self::assertSame(['t1', 14, 1], [$p->zone, $p->x, $p->y]);
        // au laboratoire : un orbe montre son compagnon, le choix le donne et fait disparaître les orbes
        $hub->presence->leave($a, $p->zone);
        [$p->zone, $p->x, $p->y, $p->dir] = ['hb1', 5, 4, 'u'];
        $hub->presence->enter($a);
        self::assertCount(3, array_filter($ta->last('zone')['zone']['npcs'], static fn (array $n): bool => $n['kind'] === 'starter'));
        self::send($hub, $a, ['t' => 'interact']);
        self::assertSame(4, $ta->last('starterPick')['sp']);
        self::send($hub, $a, ['t' => 'starter', 'sp' => 4]);
        self::assertSame('labThanks', $ta->last('say')['text']);
        self::assertCount(3, $ta->of('npcGone'));
        self::assertSame(4, $p->team[0]->species);
        // ensuite le chemin du nord est libre
        $hub->presence->leave($a, $p->zone);
        [$p->zone, $p->x, $p->y] = ['t1', 14, 1];
        $hub->presence->enter($a);
        $this->walk($hub, $a, 'u');
        self::assertSame('r1', $p->zone);
    }

    public function testShopAndItems(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        $p = $a->profile;
        self::assertNotNull($p);
        self::send($hub, $a, ['t' => 'buy', 'item' => 'orb', 'n' => 1]);
        self::assertSame('bad_buy', $ta->last('error')['code'], 'loin de la boutique');
        [$p->zone, $p->x, $p->y, $p->dir] = ['s1', 5, 3, 'u'];
        self::send($hub, $a, ['t' => 'interact']);
        self::assertContains('orb', array_column($ta->last('shop')['items'], 'id'));
        self::assertNotContains('orb3', array_column($ta->last('shop')['items'], 'id'));
        self::send($hub, $a, ['t' => 'buy', 'item' => 'orb', 'n' => 3]);
        self::assertSame(8, $p->count(\Bramble\Content\Item::Orb));
        self::assertSame(400, $p->money);
        self::send($hub, $a, ['t' => 'buy', 'item' => 'orb', 'n' => 3]);
        self::assertSame('no_money', $ta->last('error')['code']);
        $p->team[0]->hp = 1;
        self::send($hub, $a, ['t' => 'use', 'item' => 'potion', 'uid' => $p->team[0]->uid]);
        self::assertSame(21, $p->team[0]->hp);
    }

    public function testTradeSwapsTwoCreatures(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        [$b, $tb] = $this->join($hub, 'Bob', 'bob');
        $pa = $a->profile;
        $pb = $b->profile;
        self::assertNotNull($pa);
        self::assertNotNull($pb);
        self::send($hub, $a, ['t' => 'invite', 'id' => $b->id, 'kind' => 'trade']);
        self::assertSame('trade', $tb->last('invite')['kind']);
        self::send($hub, $b, ['t' => 'accept', 'id' => $a->id]);
        self::assertNotNull($a->trade);
        self::send($hub, $a, ['t' => 'offer', 'uid' => $pa->team[0]->uid]);
        self::assertSame('bad_offer', $ta->last('error')['code'], 'on ne cède pas son unique créature');
        $pa->store($pa->newKin(10, 4));
        $pb->store($pb->newKin(13, 4));
        self::send($hub, $a, ['t' => 'offer', 'uid' => $pa->team[1]->uid]);
        self::send($hub, $b, ['t' => 'offer', 'uid' => $pb->team[1]->uid]);
        self::assertSame(10, $tb->last('trade')['theirs']['sp']);
        self::send($hub, $a, ['t' => 'confirm']);
        self::assertNull($ta->last('tradeDone'));
        self::send($hub, $b, ['t' => 'confirm']);
        self::assertSame(13, $ta->last('tradeDone')['got']);
        self::assertSame([7, 13], array_map(static fn ($k): int => $k->species, $pa->team));
        self::assertSame([7, 10], array_map(static fn ($k): int => $k->species, $pb->team));
        self::assertNull($a->trade);
        self::assertSame(2, $pa->dex[13]);
    }

    public function testDuelIsPlayedTurnByTurnAndRanked(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        [$b, $tb] = $this->join($hub, 'Bob', 'bob');
        $a->ip = '198.18.0.1';
        $b->ip = '198.18.0.2';
        self::send($hub, $a, ['t' => 'invite', 'id' => $b->id, 'kind' => 'duel']);
        self::send($hub, $b, ['t' => 'accept', 'id' => $a->id]);
        self::assertSame(50, $ta->last('battle')['view']['team'][0]['lv']);
        self::assertTrue($ta->last('battle')['intro']['ranked']);
        $hpBefore = $a->profile?->team[0]->hp;
        for ($i = 0; $i < 60 && $a->fight !== null; $i++) {
            foreach ([[$a, $ta], [$b, $tb]] as [$c, $t]) {
                $view = $t->last('turn')['view'] ?? $t->last('battle')['view'];
                if ($view['replace']) {
                    continue;
                }
                self::send($hub, $c, ['t' => 'act', 'k' => 'move', 'i' => 0]);
            }
            if ($i === 30) {
                // un joueur ne répond plus : le délai choisit à sa place
                $this->clock->advance(6);
                $hub->tick();
            }
        }
        self::assertNull($a->fight);
        $ra = $ta->last('battleEnd');
        $rb = $tb->last('battleEnd');
        self::assertNotSame($ra['result'], $rb['result']);
        self::assertTrue($ra['ranked']);
        self::assertSame($hpBefore, $a->profile?->team[0]->hp, 'un duel ne blesse pas les vraies créatures');
        self::assertCount(2, $hub->ratings()->top());
    }

    public function testDuelForfeitOnDisconnect(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        [$b] = $this->join($hub, 'Bob', 'bob');
        self::send($hub, $a, ['t' => 'invite', 'id' => $b->id, 'kind' => 'duel']);
        self::send($hub, $b, ['t' => 'accept', 'id' => $a->id]);
        $hub->disconnect($b);
        self::assertSame('win', $ta->last('battleEnd')['result']);
        self::assertSame('left', $ta->last('battleEnd')['reason']);
        self::assertSame(0, $hub->fights->duelCount());
    }

    public function testTrainerBattleGivesMoneyAndIsRememberedAndGuardsNeedBadges(): void
    {
        $hub = $this->hub();
        [$a, $ta] = $this->join($hub, 'Alice', 'alice');
        $p = $a->profile;
        self::assertNotNull($p);
        $p->team[0] = $p->newKin(9, 60);            // de quoi gagner à coup sûr
        $route = \Bramble\World\World::zone('r1');
        self::assertNotNull($route);
        $npc = $route->npc('r1.trainer0');
        self::assertNotNull($npc);
        $p->zone = 'r1';
        $dirs = ['u' => [0, 1], 'd' => [0, -1], 'l' => [1, 0], 'r' => [-1, 0]];
        foreach ($dirs as $face => [$dx, $dy]) {
            if ($route->free($npc->x + $dx, $npc->y + $dy, static fn (): bool => true)) {
                [$p->x, $p->y, $p->dir] = [$npc->x + $dx, $npc->y + $dy, $face];
                break;
            }
        }
        $money = $p->money;
        self::send($hub, $a, ['t' => 'interact']);
        self::assertSame('trainer', $ta->last('battle')['intro']['kind']);
        for ($i = 0; $i < 20 && $a->fight !== null; $i++) {
            self::send($hub, $a, ['t' => 'act', 'k' => 'move', 'i' => 0]);
        }
        self::assertSame('win', $ta->last('battleEnd')['result']);
        self::assertSame($money + $npc->reward, $p->money);
        self::send($hub, $a, ['t' => 'interact']);
        self::assertTrue($ta->last('say')['after']);
        // le garde de la route 2 bloque sans badge
        $p->zone = 'r2';
        [$p->x, $p->y] = [11, \Bramble\World\World::RH - 3];
        $this->walk($hub, $a, 'u');
        self::assertSame(\Bramble\World\World::RH - 3, $p->y);
        $p->badges = [1];
        $this->walk($hub, $a, 'u');
        self::assertSame(\Bramble\World\World::RH - 4, $p->y);
    }
}
