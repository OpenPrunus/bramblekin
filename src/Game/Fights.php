<?php

declare(strict_types=1);

namespace Bramble\Game;

use Arcade\Fair\RankingGuard;
use Bramble\Battle\Action;
use Bramble\Battle\Battle;
use Bramble\Battle\Fighter;
use Bramble\Battle\Kind;
use Bramble\Content\Item;
use Bramble\Creature\Kin;
use Bramble\Player\Profile;
use Bramble\Player\ProfileStore;
use Bramble\Ranking\Ratings;
use Bramble\World\Npc;
use Bramble\World\World;
use Random\Randomizer;

/** Tous les combats : rencontres sauvages, dresseurs du jeu, duels entre joueurs (avec délai par tour et classement). */
final class Fights
{
    /**
     * @var array<int, Fight>
     */
    private array $duels = [];

    public function __construct(
        private readonly Presence $presence,
        private readonly ProfileStore $store,
        private readonly Ratings $ratings,
        private readonly RankingGuard $guard,
        private readonly Config $config,
        private readonly Randomizer $rng,
    ) {
    }

    public function startWild(Client $c, int $species, int $level, int $now): void
    {
        $p = $c->profile;
        if ($p === null || $p->aliveCount() === 0) {
            return;
        }
        $wild = Kin::create(0, $species, $level);
        $battle = new Battle(Kind::Wild, [new Fighter($p->team, false, $p->name, $p->look), new Fighter([$wild], true)], $this->rng);
        $this->open($c, new Fight($battle, [$c, null]), ['kind' => 'wild']);
    }

    public function startTrainer(Client $c, Npc $npc): void
    {
        $p = $c->profile;
        if ($p === null || $p->aliveCount() === 0) {
            return;
        }
        $team = [];
        foreach ($npc->team as $k => [$species, $level]) {
            $team[] = Kin::create(-1 - $k, $species, $level);
        }
        $kind = Kind::Trainer;
        $battle = new Battle($kind, [new Fighter($p->team, false, $p->name, $p->look), new Fighter($team, true, $npc->name, $npc->sprite)], $this->rng);
        $this->open($c, new Fight($battle, [$c, null], $npc), [
            'kind' => 'trainer', 'cls' => $npc->cls, 'name' => $npc->name, 'sprite' => $npc->sprite, 'text' => $npc->text, 'npc' => $npc->id,
        ]);
    }

    public function startDuel(Client $a, Client $b, int $now): void
    {
        $pa = $a->profile;
        $pb = $b->profile;
        if ($pa === null || $pb === null) {
            return;
        }
        $copy = fn (Profile $p): array => array_map(fn (Kin $k): Kin => $k->duelCopy($this->config->duelLevel), $p->team);
        $battle = new Battle(Kind::Duel, [new Fighter($copy($pa), false, $pa->name, $pa->look), new Fighter($copy($pb), false, $pb->name, $pb->look)], $this->rng);
        $fight = new Fight($battle, [$a, $b]);
        $fight->why = $this->guard->check($a->ip, $pa->id, $b->ip, $pb->id, $now);
        $fight->ranked = $fight->why === null;
        $fight->deadline = $now + $this->config->turnSeconds;
        $this->duels[spl_object_id($fight)] = $fight;
        foreach ([0, 1] as $side) {
            $me = $fight->players[$side];
            $other = $side === 0 ? $pb : $pa;
            if ($me === null) {
                continue;
            }
            $me->fight = $fight;
            $me->send('battle', ['view' => $battle->view($side), 'intro' => [
                'kind' => 'duel', 'name' => $other->name, 'look' => $other->look, 'ranked' => $fight->ranked, 'why' => $fight->why,
                'rating' => $this->ratings->ratingOf($other->id), 'seconds' => $this->config->turnSeconds,
            ]]);
            $this->presence->moved($me);
        }
    }

    /**
     * @param array<string, mixed> $intro
     */
    private function open(Client $c, Fight $fight, array $intro): void
    {
        $c->fight = $fight;
        $p = $c->profile;
        $p?->seen($fight->battle->sides[1]->kin()->species);
        $c->send('battle', ['view' => $fight->battle->view(0), 'intro' => $intro]);
        $this->presence->moved($c);
    }

    /**
     * @param array<string, mixed> $msg
     */
    public function act(Client $c, array $msg, int $now): void
    {
        $fight = $c->fight;
        $p = $c->profile;
        $action = Action::fromMessage($msg);
        if ($fight === null || $p === null || $action === null) {
            $c->error('bad_action');

            return;
        }
        $battle = $fight->battle;
        $side = $fight->sideOf($c);
        $why = $battle->validate($side, $action);
        if ($why === null && in_array($action->kind, ['item', 'catch'], true) && $action->item !== null && $p->count($action->item) < 1) {
            $why = 'no_item';
        }
        if ($why === null && $action->kind === 'catch' && $p->team !== [] && count($p->team) >= Profile::TEAM_MAX && count($p->box) >= Profile::BOX_MAX) {
            $why = 'box_full';
        }
        if ($why !== null) {
            $c->error($why);

            return;
        }
        if (!$fight->isDuel()) {
            if ($action->item !== null) {
                $p->take($action->item);
            }
            $log = $battle->resolve($action, $battle->autoAction(1, $battle->kind === Kind::Trainer));
            $this->afterPve($c, $fight, $log);

            return;
        }
        if ($fight->chosen[$side] !== null) {
            $c->error('already_chosen');

            return;
        }
        $fight->chosen[$side] = $action;
        $c->send('chosen');
        $fight->opponent($c)?->send('foeReady');
        if ($fight->chosen[0] !== null && $fight->chosen[1] !== null) {
            $this->duelTurn($fight, $now);
        }
    }

    public function replace(Client $c, int $index, int $now): void
    {
        $fight = $c->fight;
        if ($fight === null) {
            return;
        }
        $side = $fight->sideOf($c);
        $log = $fight->battle->replaceWith($side, $index);
        if ($log === null) {
            $c->error('bad_switch');

            return;
        }
        if (!$fight->isDuel()) {
            $this->afterPve($c, $fight, $log);

            return;
        }
        $this->sendDuel($fight, $log);
        if (!$fight->battle->waitingReplacement()) {
            $fight->deadline = $now + $this->config->turnSeconds;
        }
    }

    /**
     * @param list<array<string, mixed>> $log
     */
    private function afterPve(Client $c, Fight $fight, array $log): void
    {
        $p = $c->profile;
        foreach ($log as $e) {
            if (($e['k'] ?? '') === 'send' && ($e['s'] ?? 0) === 1 && is_array($e['kin'] ?? null) && is_int($e['kin']['sp'] ?? null)) {
                $p?->seen($e['kin']['sp']);
            }
        }
        $c->dirty = true;
        $c->send('turn', ['log' => $log, 'view' => $fight->battle->view(0)]);
        if ($fight->battle->over()) {
            $this->finishPve($c, $fight);
        }
    }

    private function finishPve(Client $c, Fight $fight): void
    {
        $p = $c->profile;
        if ($p === null) {
            return;
        }
        $battle = $fight->battle;
        $end = [];
        $teleport = false;
        if ($battle->ending === 'caught' && $battle->caught !== null) {
            $kin = $battle->caught;
            $kin->uid = $p->nextUid++;
            $result = 'caught';
            $end[] = ['k' => 'stored', 'where' => $p->store($kin), 'sp' => $kin->species];
        } elseif ($battle->ending === 'fled') {
            $result = 'fled';
        } elseif ($battle->winner === 0) {
            $result = 'win';
            $npc = $fight->npc;
            if ($npc !== null) {
                $p->done[$npc->id] = true;
                $reward = $p->has(Item::Charm) ? intdiv($npc->reward * 3, 2) : $npc->reward;
                $p->money += $reward;
                $end[] = ['k' => 'money', 'n' => $reward];
                if ($npc->kind === 'leader' && !in_array($npc->badge, $p->badges, true)) {
                    $p->badges[] = $npc->badge;
                    sort($p->badges);
                    $end[] = ['k' => 'badge', 'n' => $npc->badge];
                }
                if ($npc->kind === 'champion') {
                    $p->champion = true;
                    $end[] = ['k' => 'champion'];
                }
            }
        } else {
            $result = 'lose';
            $lost = intdiv($p->money, 2);
            $p->money -= $lost;
            $end[] = ['k' => 'blackout', 'n' => $lost];
            $p->healAll();
            $teleport = true;
        }
        foreach ($p->team as $kin) {
            if (isset($battle->leveled[$kin->uid])) {
                $from = $kin->evolveIfReady();
                if ($from !== null) {
                    $p->dex[$kin->species] = 2;
                    $end[] = ['k' => 'evolve', 'uid' => $kin->uid, 'from' => $from, 'to' => $kin->species];
                }
            }
        }
        $c->fight = null;
        $c->grace = 3;
        $oldZone = $p->zone;
        if ($teleport) {
            [$p->zone, $p->x, $p->y] = World::healSpot($p->healTown);
            $p->dir = 'u';
        }
        $this->store->save($p);
        $c->dirty = false;
        $c->send('battleEnd', ['result' => $result, 'log' => $end, 'profile' => $p->toClient()]);
        if ($teleport) {
            $this->presence->leave($c, $oldZone);
            $this->presence->enter($c);
        } else {
            $this->presence->moved($c);
        }
    }

    private function duelTurn(Fight $fight, int $now): void
    {
        [$a0, $a1] = [$fight->chosen[0], $fight->chosen[1]];
        $fight->chosen = [0 => null, 1 => null];
        if ($a0 === null || $a1 === null) {
            return;
        }
        $log = $fight->battle->resolve($a0, $a1);
        $this->sendDuel($fight, $log);
        $fight->deadline = $now + $this->config->turnSeconds;
        if ($fight->battle->over()) {
            $this->finishDuel($fight, $fight->battle->winner ?? 0, 'ko');
        }
    }

    /**
     * @param list<array<string, mixed>> $log
     */
    private function sendDuel(Fight $fight, array $log): void
    {
        foreach ([0, 1] as $side) {
            $fight->players[$side]?->send('turn', ['log' => $side === 0 ? $log : Battle::flip($log), 'view' => $fight->battle->view($side)]);
        }
    }

    private function finishDuel(Fight $fight, int $winner, string $reason): void
    {
        unset($this->duels[spl_object_id($fight)]);
        $w = $fight->players[$winner];
        $l = $fight->players[1 - $winner];
        $delta = [0, 0];
        if ($fight->ranked && $w?->profile !== null && $l?->profile !== null) {
            $delta = $this->ratings->record($w->profile->id, $w->profile->name, $l->profile->id, $l->profile->name);
        }
        foreach ([0, 1] as $side) {
            $c = $fight->players[$side];
            if ($c === null || $c->fight !== $fight) {
                continue;
            }
            $c->fight = null;
            $c->grace = 3;
            $c->send('battleEnd', [
                'result' => $side === $winner ? 'win' : 'lose', 'reason' => $reason, 'ranked' => $fight->ranked,
                'delta' => $side === $winner ? $delta[0] : $delta[1], 'log' => [], 'profile' => $c->profile?->toClient(),
                'rating' => $c->profile !== null ? $this->ratings->ratingOf($c->profile->id) : null,
            ]);
            $this->presence->moved($c);
        }
    }

    public function forfeit(Client $c): void
    {
        $fight = $c->fight;
        if ($fight === null || !$fight->isDuel()) {
            return;
        }
        $this->finishDuel($fight, 1 - $fight->sideOf($c), 'forfeit');
    }

    public function disconnect(Client $c): void
    {
        $fight = $c->fight;
        if ($fight === null) {
            return;
        }
        if ($fight->isDuel()) {
            $this->finishDuel($fight, 1 - $fight->sideOf($c), 'left');
        }
        $c->fight = null;
    }

    /** Délais des duels : action ou remplaçant choisi d'office pour le joueur qui tarde. */
    public function tick(int $now): void
    {
        foreach ($this->duels as $fight) {
            if ($now < $fight->deadline) {
                continue;
            }
            $battle = $fight->battle;
            if ($battle->waitingReplacement()) {
                foreach ([0, 1] as $side) {
                    if ($battle->replace[$side]) {
                        $log = $battle->replaceWith($side, $battle->sides[$side]->firstAlive() ?? 0) ?? [];
                        $this->sendDuel($fight, $log);
                    }
                }
                $fight->deadline = $now + $this->config->turnSeconds;
                continue;
            }
            foreach ([0, 1] as $side) {
                $fight->chosen[$side] ??= $battle->autoAction($side, false);
            }
            $this->duelTurn($fight, $now);
        }
    }

    public function duelCount(): int
    {
        return count($this->duels);
    }

    /** Utilisation d'un objet hors combat (potion, remède, rappel). */
    public static function useOutside(Profile $p, Item $item, int $uid): ?string
    {
        $i = $p->teamIndex($uid);
        if ($i === null || $item->isOrb()) {
            return 'bad_item';
        }
        if ($p->count($item) < 1) {
            return 'no_item';
        }
        $kin = $p->team[$i];
        $ok = match (true) {
            $item === Item::Revive => $kin->fainted(),
            $kin->fainted() => false,
            $item === Item::Remedy => $kin->status !== null,
            default => $kin->hp < $kin->maxHp(),
        };
        if (!$ok) {
            return 'useless';
        }
        $p->take($item);
        if ($item === Item::Revive) {
            $kin->hp = max(1, intdiv($kin->maxHp(), 2));
        } elseif ($item === Item::Remedy) {
            $kin->status = null;
            $kin->sleep = 0;
        } else {
            $kin->heal($item->heals());
        }

        return null;
    }
}
