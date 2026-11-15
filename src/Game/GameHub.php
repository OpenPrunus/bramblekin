<?php

declare(strict_types=1);

namespace Bramble\Game;

use Arcade\Fair\RankingGuard;
use Arcade\Server\Hub;
use Arcade\Server\Session;
use Arcade\Server\Transport;
use Arcade\Support\Nickname;
use Arcade\Support\SystemClock;
use Bramble\Content\Dex;
use Bramble\Content\Item;
use Bramble\Content\Moves;
use Bramble\Content\Type;
use Bramble\Player\Profile;
use Bramble\Player\ProfileStore;
use Bramble\Ranking\Ratings;
use Bramble\World\Names;
use Bramble\World\Npc;
use Bramble\World\Tile;
use Bramble\World\World;
use Psr\Clock\ClockInterface;
use Psr\Log\LoggerInterface;
use Random\Randomizer;

/**
 * Le serveur du monde partagé : identifie les joueurs, valide chaque pas, gère les personnages, les boutiques, les combats,
 * les duels et les échanges. Le navigateur n'envoie que des intentions ; la sauvegarde vit ici.
 */
final class GameHub implements Hub
{
    private const array DIRS = ['u' => [0, -1], 'd' => [0, 1], 'l' => [-1, 0], 'r' => [1, 0]];
    private const int EMOTES = 8;

    private int $nextId = 1;
    private int $lastHousekeeping = 0;
    private int $lastSave = 0;
    /**
     * @var array<int, int>
     */
    private array $lastEmote = [];
    /**
     * @var array<string, mixed>|null
     */
    private static ?array $content = null;

    public readonly Presence $presence;
    public readonly Fights $fights;
    public readonly Relay $relay;

    public function __construct(
        private readonly ProfileStore $store,
        private readonly Ratings $ratings,
        private readonly Config $config,
        private readonly ClockInterface $clock,
        private readonly LoggerInterface $logger,
        private readonly Randomizer $rng = new Randomizer(),
        ?RankingGuard $guard = null,
        ?Relay $relay = null,
    ) {
        $this->presence = new Presence();
        $this->relay = $relay ?? new Relay();
        $this->fights = new Fights($this->presence, $store, $ratings, $guard ?? RankingGuard::fromEnvironment('BRAMBLE'), $config, $rng);
    }

    private function now(): int
    {
        return $this->clock->now()->getTimestamp();
    }

    #[\Override]
    public function accept(Transport $transport): Client
    {
        $c = new Client($this->nextId++, $transport, $this->now());
        $this->presence->add($c);

        return $c;
    }

    #[\Override]
    public function population(): int
    {
        return $this->presence->count();
    }

    #[\Override]
    public function receive(Session $session, string $raw): void
    {
        $c = $session instanceof Client ? $session : throw new \InvalidArgumentException('unknown session');
        $now = $this->now();
        if ($c->kicked || !$c->allow($now, $this->config->rateLimit) || strlen($raw) > 2048 || !json_validate($raw)) {
            return;
        }
        $msg = json_decode($raw, true);
        if (!is_array($msg) || !is_string($msg['t'] ?? null)) {
            return;
        }
        /**
         * @var array<string, mixed> $msg
         */
        $type = $msg['t'];
        if ($type === 'ping') {
            $c->send('pong', ['c' => is_int($msg['c'] ?? null) ? $msg['c'] : 0]);

            return;
        }
        if ($type === 'whereHello' || $type === 'where') {
            $this->relay->receive($c, $type, $msg, $now);

            return;
        }
        if ($type === 'hello') {
            $this->hello($c, $msg, $now);

            return;
        }
        $p = $c->profile;
        if ($p === null) {
            $c->error('not_ready');

            return;
        }
        if ($type === 'starter') {
            $this->starter($c, $p, $this->int($msg, 'sp'));

            return;
        }
        match ($type) {
            'step' => $this->step($c, $p, $msg, $now),
            'turn' => $this->face($c, $p, $msg),
            'interact' => $this->interact($c, $p, $now),
            'buy' => $this->buy($c, $p, $msg),
            'deposit' => $this->deposit($c, $p, $this->int($msg, 'uid')),
            'withdraw' => $this->withdraw($c, $p, $this->int($msg, 'uid')),
            'use' => $this->useItem($c, $p, $msg),
            'learn' => $this->learn($c, $p, $msg),
            'order' => $this->order($c, $p, $this->int($msg, 'from'), $this->int($msg, 'to')),
            'look' => $this->look($c, $p, $this->int($msg, 'n')),
            'emote' => $this->emote($c, $p, $this->int($msg, 'e'), $now),
            'act' => $this->fights->act($c, $msg, $now),
            'replace' => $this->fights->replace($c, $this->int($msg, 'i'), $now),
            'forfeit' => $this->fights->forfeit($c),
            'invite' => $this->invite($c, $this->int($msg, 'id'), is_string($msg['kind'] ?? null) ? $msg['kind'] : '', $now),
            'accept' => $this->acceptInvite($c, $this->int($msg, 'id'), $now),
            'decline' => $this->declineInvite($c, $this->int($msg, 'id')),
            'uninvite' => $this->cancelInvite($c),
            'offer' => $this->offer($c, $this->int($msg, 'uid')),
            'confirm' => $this->confirm($c),
            'untrade' => $this->endTrade($c, 'cancel'),
            default => $c->error('unknown'),
        };
    }

    /**
     * @param array<string, mixed> $msg
     */
    private function int(array $msg, string $key): int
    {
        return is_int($msg[$key] ?? null) ? $msg[$key] : -1;
    }

    // --- identité -------------------------------------------------------------------------------------------------------

    /**
     * @param array<string, mixed> $msg
     */
    private function hello(Client $c, array $msg, int $now): void
    {
        if ($c->profile !== null) {
            return;
        }
        $name = Nickname::clean(is_string($msg['name'] ?? null) ? $msg['name'] : '');
        $token = $msg['token'] ?? null;
        if (mb_strlen($name) < 2) {
            $c->error('bad_name');

            return;
        }
        if (!is_string($token) || preg_match('/^[A-Za-z0-9_-]{24,128}$/', $token) !== 1) {
            $c->error('bad_token');

            return;
        }
        $id = hash('sha256', $token);
        if ($this->presence->nameTaken(Nickname::key($name), $id)) {
            $c->error('name_taken');

            return;
        }
        $old = $this->presence->byToken($id);
        if ($old !== null && $old !== $c) {
            $old->send('kicked');
            $this->drop($old);
            $old->kicked = true;
        }
        $profile = $this->store->load($id, $now) ?? new Profile($id, $name, $now);
        $profile->name = $name;
        $zone = World::zone($profile->zone);
        if ($zone === null || !$zone->free($profile->x, $profile->y, Presence::visibleFor($profile), $profile->has(Item::CutCapsule), $profile->has(Item::SurfCapsule))) {
            [$profile->zone, $profile->x, $profile->y] = World::healSpot($profile->healTown);
        }
        $c->profile = $profile;
        $c->send('welcome', [
            'id' => $c->id, 'profile' => $profile->toClient(), 'content' => self::content(),
            'starter' => !$profile->hasStarter(), 'rating' => $this->ratings->ratingOf($id),
        ]);
        $this->logger->info("hello {$c->id} {$name}");
        $this->presence->enter($c);
    }

    /**
     * Données fixes envoyées une fois : bestiaire, attaques, objets, table des types, villes.
     * @return array<string, mixed>
     */
    public static function content(): array
    {
        return self::$content ??= [
            'species' => array_values(array_map(static fn ($s): array => $s->toClient(), Dex::all())),
            'moves' => (object) array_map(static fn ($m): array => $m->toClient(), Moves::all()),
            'items' => array_map(static fn (Item $i): array => [
                'id' => $i->value, 'name' => $i->label(), 'price' => $i->price(), 'kind' => $i->kind(), 'desc' => $i->description(), 'move' => $i->move(),
            ], Item::cases()),
            'chart' => Type::chart(),
            'towns' => Names::TOWNS,
            'starters' => Dex::STARTERS,
        ];
    }

    private function starter(Client $c, Profile $p, int $species): void
    {
        if ($p->hasStarter() || !in_array($species, Dex::STARTERS, true)) {
            $c->error('bad_starter');

            return;
        }
        $p->store($p->newKin($species, 5));
        $this->store->save($p);
        $c->send('profile', ['profile' => $p->toClient()]);
        foreach (Presence::zoneOf($p)->npcs as $npc) {
            if ($npc->kind === 'starter') {
                $c->send('npcGone', ['id' => $npc->id]);
            }
        }
        $c->send('say', ['text' => 'labThanks', 'sp' => $species]);
    }

    // --- déplacements ---------------------------------------------------------------------------------------------------

    /**
     * @param array<string, mixed> $msg
     */
    private function step(Client $c, Profile $p, array $msg, int $now): void
    {
        $dir = is_string($msg['d'] ?? null) && isset(self::DIRS[$msg['d']]) ? $msg['d'] : null;
        $seq = $this->int($msg, 'n');
        if ($dir === null || $c->busy()) {
            $this->reject($c, $p, $seq);

            return;
        }
        $t = SystemClock::seconds($this->clock) * 1000;
        $stepMs = $p->riding ? intdiv($this->config->stepMs, 2) : $this->config->stepMs;     // à vélo : deux fois plus vite
        $c->stepCredits = min(4.0, $c->stepCredits + ($t - $c->lastStep) / max(1, $stepMs));
        $c->lastStep = $t;
        $p->dir = $dir;
        [$dx, $dy] = self::DIRS[$dir];
        $zone = Presence::zoneOf($p);
        if ($c->stepCredits < 1 || !$zone->free($p->x + $dx, $p->y + $dy, Presence::visibleFor($p), $p->has(Item::CutCapsule), $p->has(Item::SurfCapsule))) {
            $this->reject($c, $p, $seq);
            $this->presence->moved($c);

            return;
        }
        $c->stepCredits -= 1;
        $p->x += $dx;
        $p->y += $dy;
        $c->dirty = true;
        $warp = $zone->warpAt($p->x, $p->y);
        if ($warp !== null && !$p->hasStarter() && str_starts_with($warp->zone, 'r')) {
            // sans compagnon, le professeur ne laisse pas partir dans les hautes herbes
            $p->x -= $dx;
            $p->y -= $dy;
            $p->dir = 'd';
            $this->reject($c, $p, $seq);
            $c->send('say', ['text' => 'profStop']);

            return;
        }
        if ($warp !== null) {
            $this->presence->leave($c, $zone->id);
            [$p->zone, $p->x, $p->y] = [$warp->zone, $warp->toX, $warp->toY];
            if ($p->riding && !in_array(World::zone($p->zone)?->kind, ['town', 'route'], true)) {
                $p->riding = false;                                   // on descend de vélo en entrant
                $c->send('profile', ['profile' => $p->toClient()]);
            }
            $this->presence->enter($c);

            return;
        }
        $this->presence->moved($c);
        if ($c->grace > 0) {
            $c->grace--;

            return;
        }
        if ($zone->tile($p->x, $p->y) === Tile::GRASS && $zone->encounters !== [] && $this->rng->getFloat(0, 1) < $this->config->encounterRate) {
            $this->encounter($c, $zone->encounters, $now);
        }
    }

    /**
     * @param list<array{0: int, 1: int, 2: int, 3: int}> $table
     */
    private function encounter(Client $c, array $table, int $now): void
    {
        $total = array_sum(array_map(static fn (array $e): int => $e[3], $table));
        $roll = $this->rng->getInt(1, max(1, $total));
        foreach ($table as [$species, $min, $max, $weight]) {
            $roll -= $weight;
            if ($roll <= 0) {
                $this->fights->startWild($c, $species, $this->rng->getInt($min, $max), $now);

                return;
            }
        }
    }

    private function reject(Client $c, Profile $p, int $seq): void
    {
        $c->send('pos', ['x' => $p->x, 'y' => $p->y, 'd' => $p->dir, 'n' => $seq, 'zone' => $p->zone]);
    }

    /**
     * @param array<string, mixed> $msg
     */
    private function face(Client $c, Profile $p, array $msg): void
    {
        if (is_string($msg['d'] ?? null) && isset(self::DIRS[$msg['d']]) && !$c->busy()) {
            $p->dir = $msg['d'];
            $this->presence->moved($c);
        }
    }

    // --- personnages ----------------------------------------------------------------------------------------------------

    private function facing(Profile $p): ?Npc
    {
        [$dx, $dy] = self::DIRS[$p->dir];
        $visible = Presence::visibleFor($p);
        $zone = Presence::zoneOf($p);
        // on parle par-dessus un comptoir
        $reach = $zone->tile($p->x + $dx, $p->y + $dy) === Tile::COUNTER ? 2 : 1;
        foreach ($zone->npcs as $npc) {
            if ($npc->x === $p->x + $dx * $reach && $npc->y === $p->y + $dy * $reach && $visible($npc)) {
                return $npc;
            }
        }

        return null;
    }

    private function interact(Client $c, Profile $p, int $now): void
    {
        $npc = $c->busy() ? null : $this->facing($p);
        if ($npc === null) {
            return;
        }
        switch ($npc->kind) {
            case 'nurse':
                $p->healAll();
                $p->healTown = Presence::zoneOf($p)->index;
                $c->dirty = true;
                $c->send('say', ['text' => 'nurse', 'npc' => $npc->id]);
                $c->send('profile', ['profile' => $p->toClient()]);
                break;
            case 'pc':
                $c->send('box', ['box' => array_map(static fn ($k): array => $k->toClient(), $p->box)]);
                break;
            case 'shop':
                $c->send('shop', ['items' => $this->shopItems($p)]);
                break;
            case 'trainer':
            case 'leader':
            case 'champion':
                if (isset($p->done[$npc->id])) {
                    $c->send('say', ['text' => $npc->text, 'after' => true, 'npc' => $npc->id, 'name' => $npc->name, 'cls' => $npc->cls]);
                } elseif ($p->aliveCount() === 0) {
                    $c->send('say', ['text' => 'noKin']);
                } else {
                    $this->fights->startTrainer($c, $npc);
                }
                break;
            case 'item':
                if ($npc->item !== null && !isset($p->done[$npc->id])) {
                    $p->done[$npc->id] = true;
                    $p->give($npc->item);
                    $c->dirty = true;
                    $c->send('npcGone', ['id' => $npc->id]);
                    $c->send('say', ['text' => 'found', 'item' => $npc->item->value]);
                    $c->send('profile', ['profile' => $p->toClient()]);
                }
                break;
            case 'starter':
                if (!$p->hasStarter() && $npc->team !== []) {
                    $c->send('starterPick', ['sp' => $npc->team[0][0]]);
                }
                break;
            case 'gift':
                if ($npc->item !== null && !isset($p->done[$npc->id])) {
                    $p->done[$npc->id] = true;
                    $p->give($npc->item);
                    $c->dirty = true;
                    $c->send('say', ['text' => 'gift_' . $npc->item->kind(), 'item' => $npc->item->value, 'gift' => true]);
                    $c->send('profile', ['profile' => $p->toClient()]);
                } else {
                    $c->send('say', ['text' => 'giftAfter']);
                }
                break;
            case 'prof':
                if (!$p->hasStarter()) {
                    $c->send('say', ['text' => 'labChoose']);
                    break;
                }
                $c->send('say', ['text' => 'prof', 'seen' => count($p->dex), 'caught' => count(array_filter($p->dex, static fn (int $s): bool => $s === 2))]);
                break;
            default:
                $text = $npc->text === 'home' && !$p->hasStarter() ? 'homeStart' : $npc->text;
                $c->send('say', ['text' => $text, 'need' => $npc->need, 'npc' => $npc->id]);
        }
    }

    /**
     * @return list<array{id: string, price: int}>
     */
    private function shopItems(Profile $p): array
    {
        $out = [];
        foreach (Item::cases() as $item) {
            if ($item->badgesForShop() <= $p->badgeCount()) {
                $out[] = ['id' => $item->value, 'price' => $item->price()];
            }
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $msg
     */
    private function buy(Client $c, Profile $p, array $msg): void
    {
        $item = is_string($msg['item'] ?? null) ? Item::tryFrom($msg['item']) : null;
        $n = $this->int($msg, 'n');
        if ($c->busy() || $this->facing($p)?->kind !== 'shop' || $item === null || $item->badgesForShop() > $p->badgeCount() || $n < 1 || $n > 99) {
            $c->error('bad_buy');

            return;
        }
        $cost = $item->price() * $n;
        if ($p->money < $cost) {
            $c->error('no_money');

            return;
        }
        $p->money -= $cost;
        $p->give($item, $n);
        $c->dirty = true;
        $c->send('bought', ['item' => $item->value, 'n' => $n]);
        $c->send('profile', ['profile' => $p->toClient()]);
    }

    private function deposit(Client $c, Profile $p, int $uid): void
    {
        $i = $p->teamIndex($uid);
        if ($c->busy() || $this->facing($p)?->kind !== 'pc' || $i === null || count($p->team) < 2 || count($p->box) >= Profile::BOX_MAX) {
            $c->error('bad_box');

            return;
        }
        $kin = $p->team[$i];
        array_splice($p->team, $i, 1);
        $kin->restore();
        $p->box[] = $kin;
        $this->boxChanged($c, $p);
    }

    private function withdraw(Client $c, Profile $p, int $uid): void
    {
        $i = null;
        foreach ($p->box as $k => $kin) {
            if ($kin->uid === $uid) {
                $i = $k;
            }
        }
        if ($c->busy() || $this->facing($p)?->kind !== 'pc' || $i === null || count($p->team) >= Profile::TEAM_MAX) {
            $c->error('bad_box');

            return;
        }
        $kin = $p->box[$i];
        array_splice($p->box, $i, 1);
        $kin->restore();
        $p->team[] = $kin;
        $this->boxChanged($c, $p);
    }

    private function boxChanged(Client $c, Profile $p): void
    {
        $c->dirty = true;
        $c->send('box', ['box' => array_map(static fn ($k): array => $k->toClient(), $p->box)]);
        $c->send('profile', ['profile' => $p->toClient()]);
    }

    /**
     * @param array<string, mixed> $msg
     */
    private function useItem(Client $c, Profile $p, array $msg): void
    {
        $item = is_string($msg['item'] ?? null) ? Item::tryFrom($msg['item']) : null;
        if ($c->busy() || $item === null) {
            $c->error('bad_item');

            return;
        }
        $outdoors = in_array(Presence::zoneOf($p)->kind, ['town', 'route'], true);
        $result = ItemUse::apply($p, $item, $this->int($msg, 'uid'), $outdoors);
        if (is_string($result)) {
            $c->error($result);

            return;
        }
        $c->dirty = true;
        $c->send('used', ['item' => $item->value, 'log' => $result]);
        $c->send('profile', ['profile' => $p->toClient()]);
        if ($item === Item::Bike) {
            $this->presence->moved($c);
        }
    }

    /**
     * @param array<string, mixed> $msg
     */
    private function learn(Client $c, Profile $p, array $msg): void
    {
        $i = $p->teamIndex($this->int($msg, 'uid'));
        $move = is_string($msg['move'] ?? null) ? $msg['move'] : '';
        if ($c->fight !== null || $i === null || !$p->team[$i]->resolvePending($move, $this->int($msg, 'slot'))) {
            $c->error('bad_learn');

            return;
        }
        $c->dirty = true;
        $c->send('profile', ['profile' => $p->toClient()]);
    }

    private function order(Client $c, Profile $p, int $from, int $to): void
    {
        if ($c->busy() || !isset($p->team[$from], $p->team[$to])) {
            $c->error('bad_order');

            return;
        }
        $team = $p->team;
        $moved = $team[$from];
        $team[$from] = $team[$to];
        $team[$to] = $moved;
        $p->team = array_values($team);
        $c->dirty = true;
        $c->send('profile', ['profile' => $p->toClient()]);
    }

    private function look(Client $c, Profile $p, int $n): void
    {
        if ($n >= 0 && $n <= 7) {
            $p->look = $n;
            $c->dirty = true;
            $this->presence->moved($c);
            $c->send('profile', ['profile' => $p->toClient()]);
        }
    }

    private function emote(Client $c, Profile $p, int $e, int $now): void
    {
        if ($e < 0 || $e >= self::EMOTES || ($this->lastEmote[$c->id] ?? 0) >= $now) {
            return;
        }
        $this->lastEmote[$c->id] = $now;
        $this->presence->broadcast(Presence::room($p, $p->zone), 'emote', ['id' => $c->id, 'e' => $e]);
    }

    // --- invitations, duels, échanges -----------------------------------------------------------------------------------

    private function invite(Client $c, int $id, string $kind, int $now): void
    {
        $to = $this->presence->get($id);
        if (
            !in_array($kind, ['duel', 'trade'], true) || $to === null || $to === $c || !$this->presence->sameZone($c, $to)
            || $c->busy() || $to->busy() || $to->profile === null || !$to->profile->hasStarter()
        ) {
            $c->error('bad_invite');

            return;
        }
        $this->cancelInvite($c);
        $c->invite = ['to' => $id, 'kind' => $kind, 'until' => $now + $this->config->inviteTtl];
        $to->send('invite', ['from' => $c->id, 'name' => $c->profile?->name, 'kind' => $kind]);
        $c->send('invited', ['id' => $id, 'kind' => $kind]);
    }

    private function cancelInvite(Client $c): void
    {
        if ($c->invite !== null) {
            $this->presence->get($c->invite['to'])?->send('inviteGone', ['from' => $c->id]);
            $c->invite = null;
        }
    }

    private function acceptInvite(Client $c, int $id, int $now): void
    {
        $from = $this->presence->get($id);
        $invite = $from?->invite;
        if ($from === null || $invite === null || $invite['to'] !== $c->id || $invite['until'] < $now) {
            $c->error('no_invite');

            return;
        }
        $from->invite = null;
        if ($from->busy() || $c->busy() || !$this->presence->sameZone($from, $c)) {
            $c->error('bad_invite');
            $from->send('declined', ['id' => $c->id]);

            return;
        }
        $this->cancelInvite($c);
        if ($invite['kind'] === 'duel') {
            $this->fights->startDuel($from, $c, $now);

            return;
        }
        $trade = new Trade($from, $c);
        $from->trade = $trade;
        $c->trade = $trade;
        $this->tradeState($trade);
        $this->presence->moved($from);
        $this->presence->moved($c);
    }

    private function declineInvite(Client $c, int $id): void
    {
        $from = $this->presence->get($id);
        if ($from?->invite !== null && $from->invite['to'] === $c->id) {
            $from->invite = null;
            $from->send('declined', ['id' => $c->id]);
        }
    }

    private function tradeState(Trade $trade): void
    {
        foreach ([$trade->a, $trade->b] as $me) {
            $other = $trade->other($me);
            $theirs = $trade->offers[$other->id];
            $kin = null;
            if ($theirs !== null && $other->profile !== null) {
                $i = $other->profile->teamIndex($theirs);
                $kin = $i !== null ? $other->profile->team[$i]->toClient() : null;
            }
            $me->send('trade', [
                'with' => $other->id, 'name' => $other->profile?->name, 'mine' => $trade->offers[$me->id], 'theirs' => $kin,
                'confirmed' => $trade->confirmed[$me->id], 'theyConfirmed' => $trade->confirmed[$other->id],
            ]);
        }
    }

    private function offer(Client $c, int $uid): void
    {
        $trade = $c->trade;
        $p = $c->profile;
        if ($trade === null || $p === null || $p->teamIndex($uid) === null || count($p->team) < 2) {
            $c->error('bad_offer');

            return;
        }
        $trade->offers[$c->id] = $uid;
        $trade->confirmed = [$trade->a->id => false, $trade->b->id => false];
        $this->tradeState($trade);
    }

    private function confirm(Client $c): void
    {
        $trade = $c->trade;
        if ($trade === null || in_array(null, $trade->offers, true)) {
            $c->error('bad_offer');

            return;
        }
        $trade->confirmed[$c->id] = true;
        if (in_array(false, $trade->confirmed, true)) {
            $this->tradeState($trade);

            return;
        }
        $pa = $trade->a->profile;
        $pb = $trade->b->profile;
        $ia = $pa?->teamIndex((int) $trade->offers[$trade->a->id]);
        $ib = $pb?->teamIndex((int) $trade->offers[$trade->b->id]);
        if ($pa === null || $pb === null || $ia === null || $ib === null || count($pa->team) < 2 || count($pb->team) < 2) {
            $this->endTrade($c, 'invalid');

            return;
        }
        $ka = $pa->team[$ia];
        $kb = $pb->team[$ib];
        array_splice($pa->team, $ia, 1);
        array_splice($pb->team, $ib, 1);
        $ka->uid = $pb->nextUid++;
        $kb->uid = $pa->nextUid++;
        $pa->store($kb);
        $pb->store($ka);
        $this->store->save($pa);
        $this->store->save($pb);
        foreach ([[$trade->a, $kb, $ka], [$trade->b, $ka, $kb]] as [$client, $got, $gave]) {
            $client->trade = null;
            $client->dirty = false;
            $client->send('tradeDone', ['got' => $got->species, 'gave' => $gave->species, 'profile' => $client->profile?->toClient()]);
            $this->presence->moved($client);
        }
        $this->logger->info("trade {$pa->name} <-> {$pb->name}");
    }

    private function endTrade(Client $c, string $reason): void
    {
        $trade = $c->trade;
        if ($trade === null) {
            return;
        }
        foreach ([$trade->a, $trade->b] as $client) {
            $client->trade = null;
            $client->send('tradeEnd', ['reason' => $reason, 'by' => $c->id]);
            $this->presence->moved($client);
        }
    }

    // --- départs et battement -------------------------------------------------------------------------------------------

    /** Retire un client du monde (combat perdu par forfait en duel, échange annulé, invitations effacées), sauvegarde. */
    private function drop(Client $c): void
    {
        $this->fights->disconnect($c);
        $this->endTrade($c, 'left');
        $this->cancelInvite($c);
        foreach ($this->presence->ready() as $other) {
            if ($other->invite !== null && $other->invite['to'] === $c->id) {
                $other->invite = null;
                $other->send('declined', ['id' => $c->id]);
            }
        }
        if ($c->profile !== null) {
            $this->store->save($c->profile);
        }
        $this->presence->remove($c);
        unset($this->lastEmote[$c->id]);
    }

    #[\Override]
    public function disconnect(Session $session): void
    {
        if ($session instanceof Client) {
            $this->relay->remove($session);
        }
        if ($session instanceof Client && !$session->kicked) {
            $this->drop($session);
        } elseif ($session instanceof Client) {
            $this->presence->remove($session);
        }
    }

    #[\Override]
    public function tick(): void
    {
        $now = $this->now();
        $this->fights->tick($now);
        if ($now - $this->lastHousekeeping < 1) {
            return;
        }
        $this->lastHousekeeping = $now;
        $save = $now - $this->lastSave >= $this->config->saveEvery;
        if ($save) {
            $this->lastSave = $now;
        }
        foreach ($this->presence->ready() as $c) {
            if ($c->invite !== null && $c->invite['until'] < $now) {
                $this->presence->get($c->invite['to'])?->send('inviteGone', ['from' => $c->id]);
                $c->send('declined', ['id' => $c->invite['to']]);
                $c->invite = null;
            }
            if ($save && $c->dirty && $c->profile !== null) {
                $c->dirty = !$this->store->save($c->profile);
            }
        }
    }

    public function ratings(): Ratings
    {
        return $this->ratings;
    }
}
