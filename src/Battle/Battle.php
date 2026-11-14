<?php

declare(strict_types=1);

namespace Bramble\Battle;

use Bramble\Content\Item;
use Bramble\Content\Move;
use Bramble\Content\Moves;
use Bramble\Content\Status;
use Bramble\Content\Type;
use Bramble\Creature\Kin;
use Random\Randomizer;

/**
 * Un combat au tour par tour entre deux camps (0 et 1). Le camp 0 est toujours un joueur ; le camp 1 est une créature sauvage,
 * un dresseur du jeu (IA) ou un autre joueur (duel). `resolve()` joue un tour et renvoie le journal des événements
 * (côtés absolus : `s` = camp qui agit, `t` = camp visé).
 */
final class Battle
{
    /** Attaque de secours quand plus aucune attaque n'a de PP. */
    final public const string STRUGGLE = 'normal1';

    /**
     * @var array<int, bool> camp devant envoyer une nouvelle créature
     */
    public array $replace = [false, false];
    /** Camp gagnant (null = en cours). */
    public ?int $winner = null;
    /** Fin particulière : 'caught' (capture), 'fled' (fuite). */
    public ?string $ending = null;
    public ?Kin $caught = null;
    public int $turn = 0;
    /**
     * uid des créatures du camp 0 qui ont pris des niveaux (pour les évolutions en fin de combat).
     * @var array<int, true>
     */
    public array $leveled = [];
    private int $runAttempts = 0;

    /**
     * @param array{0: Fighter, 1: Fighter} $sides
     */
    public function __construct(public readonly Kind $kind, public readonly array $sides, private readonly Randomizer $rng)
    {
    }

    public function over(): bool
    {
        return $this->winner !== null;
    }

    public function waitingReplacement(): bool
    {
        return $this->replace[0] || $this->replace[1];
    }

    /** Raison du refus d'une action (null = valable). */
    public function validate(int $side, Action $a): ?string
    {
        $me = $this->sides[$side];
        if ($this->over()) {
            return 'battle_over';
        }
        if ($this->waitingReplacement()) {
            return 'need_replace';
        }

        return match ($a->kind) {
            'move' => $this->validMove($me->kin(), $a->index) ? null : 'bad_move',
            'switch' => $me->canSwitchTo($a->index) ? null : 'bad_switch',
            'item' => $this->kind === Kind::Duel || $a->item === null || !$a->item->usableInBattle() || !isset($me->team[$a->index])
                ? 'bad_item' : $this->itemUseful($a->item, $me->team[$a->index]),
            'catch' => $this->kind !== Kind::Wild || $a->item === null || !$a->item->isOrb() ? 'no_catch' : null,
            'run' => $this->kind !== Kind::Wild ? 'no_run' : null,
            default => 'bad_action',
        };
    }

    private function validMove(Kin $kin, int $index): bool
    {
        if ($index === -1) {
            return array_all($kin->moves, static fn (array $m): bool => $m[1] <= 0);
        }

        return isset($kin->moves[$index]) && $kin->moves[$index][1] > 0;
    }

    private function itemUseful(Item $item, Kin $kin): ?string
    {
        return match (true) {
            $item === Item::Revive => $kin->fainted() ? null : 'useless',
            $kin->fainted() => 'useless',
            $item === Item::Remedy => $kin->status !== null ? null : 'useless',
            $item->heals() > 0 => $kin->hp < $kin->maxHp() ? null : 'useless',
            default => 'useless',
        };
    }

    /** Choix automatique (IA des dresseurs et créatures sauvages, ou joueur absent trop longtemps). */
    public function autoAction(int $side, bool $smart = true): Action
    {
        $me = $this->sides[$side];
        $foe = $this->sides[1 - $side];
        $kin = $me->kin();
        $usable = array_keys(array_filter($kin->moves, static fn (array $m): bool => $m[1] > 0));
        if ($usable === []) {
            return Action::move(-1);
        }
        if (!$smart || $this->rng->getInt(1, 100) <= 20) {
            return Action::move($usable[$this->rng->getInt(0, count($usable) - 1)]);
        }
        $best = $usable[0];
        $bestScore = -1.0;
        foreach ($usable as $i) {
            $move = Moves::get($kin->moves[$i][0]);
            $score = $this->expected($kin, $foe->kin(), $move, $foe);
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $i;
            }
        }

        return Action::move($best);
    }

    private function expected(Kin $kin, Kin $target, Move $move, Fighter $foeSide): float
    {
        if (!$move->isDamaging()) {
            if (str_starts_with($move->effect, 'status:')) {
                return $target->status === null ? 35.0 : 0.0;
            }
            if ($move->effect === 'heal') {
                return $kin->hp < $kin->maxHp() / 2 ? 60.0 : 0.0;
            }

            return 20.0;
        }
        $eff = $move->type->against(...$target->info()->types);
        $stab = in_array($move->type, $kin->info()->types, true) ? 1.5 : 1.0;

        return $move->power * $eff * $stab * $move->accuracy / 100;
    }

    /**
     * Remplaçant choisi après un K.-O.
     * @return list<array<string, mixed>>
     */
    public function replaceWith(int $side, int $index): ?array
    {
        $me = $this->sides[$side];
        if (!$this->replace[$side] || !isset($me->team[$index]) || $me->team[$index]->fainted()) {
            return null;
        }
        $this->replace[$side] = false;
        $me->bring($index);

        return [['k' => 'send', 's' => $side, 'kin' => $me->kin()->toFoe()]];
    }

    /**
     * Joue un tour. Les actions doivent avoir été validées.
     *
     * @return list<array<string, mixed>>
     */
    public function resolve(Action $a0, Action $a1): array
    {
        $this->turn++;
        $log = [];
        $actions = [0 => $a0, 1 => $a1];
        // 1. fuite, capture, changements et objets passent avant les attaques
        foreach ([0, 1] as $side) {
            $a = $actions[$side];
            if ($a->kind === 'run') {
                $log[] = $this->tryRun($side);
                if ($this->over()) {
                    return $log;
                }
            } elseif ($a->kind === 'catch' && $a->item !== null) {
                array_push($log, ...$this->tryCatch($side, $a->item));
                if ($this->over()) {
                    return $log;
                }
            } elseif ($a->kind === 'switch') {
                $this->sides[$side]->bring($a->index);
                $log[] = ['k' => 'send', 's' => $side, 'kin' => $this->sides[$side]->kin()->toFoe()];
            } elseif ($a->kind === 'item' && $a->item !== null) {
                $log[] = $this->useItem($side, $a->item, $a->index);
            }
        }
        // 2. attaques : priorité, puis vitesse
        $movers = array_values(array_filter([0, 1], static fn (int $s): bool => $actions[$s]->kind === 'move'));
        usort($movers, fn (int $x, int $y): int => $this->speedOrder($x, $y, $actions));
        $front = [$this->sides[0]->active, $this->sides[1]->active];
        foreach ($movers as $side) {
            $me = $this->sides[$side];
            $foe = $this->sides[1 - $side];
            if ($me->active !== $front[$side] || $me->kin()->fainted() || $foe->kin()->fainted()) {
                continue;
            }
            array_push($log, ...$this->attack($side, $actions[$side]->index));
            if ($this->over()) {
                return $log;
            }
        }
        // 3. fin de tour : poison et brûlure
        foreach ([0, 1] as $side) {
            $kin = $this->sides[$side]->kin();
            if ($kin->fainted() || !in_array($kin->status, [Status::Poison, Status::Burn], true)) {
                continue;
            }
            $dmg = max(1, intdiv($kin->maxHp(), $kin->status === Status::Poison ? 8 : 16));
            $kin->hp = max(0, $kin->hp - $dmg);
            $log[] = ['k' => 'dot', 't' => $side, 'st' => $kin->status->value, 'hp' => $kin->hp, 'max' => $kin->maxHp()];
            if ($kin->fainted()) {
                array_push($log, ...$this->faint($side));
                if ($this->over()) {
                    return $log;
                }
            }
        }

        return $log;
    }

    /**
     * @param array<int, Action> $actions
     */
    private function speedOrder(int $x, int $y, array $actions): int
    {
        $px = $this->priorityOf($x, $actions[$x]);
        $py = $this->priorityOf($y, $actions[$y]);
        if ($px !== $py) {
            return $py <=> $px;
        }
        $sx = $this->speed($x);
        $sy = $this->speed($y);
        if ($sx !== $sy) {
            return $sy <=> $sx;
        }

        return $this->rng->getInt(0, 1) === 0 ? -1 : 1;
    }

    private function priorityOf(int $side, Action $a): int
    {
        $kin = $this->sides[$side]->kin();
        $id = $kin->moves[$a->index][0] ?? self::STRUGGLE;

        return Moves::get($id)->priority;
    }

    public function speed(int $side): float
    {
        $f = $this->sides[$side];
        $s = $f->kin()->stat('spd') * $f->multiplier('spd');

        return $f->kin()->status === Status::Paralysis ? $s / 2 : $s;
    }

    /**
     * @return array<string, mixed>
     */
    private function tryRun(int $side): array
    {
        $this->runAttempts++;
        $mine = $this->speed($side);
        $theirs = max(1.0, $this->speed(1 - $side));
        $odds = (int) floor($mine * 128 / $theirs) + 30 * $this->runAttempts;
        $ok = $odds >= 256 || $this->rng->getInt(0, 255) < $odds;
        if ($ok) {
            $this->winner = 1 - $side;
            $this->ending = 'fled';
        }

        return ['k' => 'run', 's' => $side, 'ok' => $ok];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function tryCatch(int $side, Item $orb): array
    {
        $target = $this->sides[1 - $side]->kin();
        $max = $target->maxHp();
        $statusBonus = match ($target->status) {
            Status::Sleep => 2.0,
            null => 1.0,
            default => 1.5,
        };
        $a = (3 * $max - 2 * $target->hp) * $target->info()->catchRate * $orb->catchBonus() * $statusBonus / (3 * $max);
        $p = min(1.0, $a / 255);
        // trois secousses : chacune réussit avec p^(1/3) ; la capture réussit si les trois passent
        $shake = $p ** (1 / 3);
        $shakes = 0;
        while ($shakes < 3 && $this->rng->getFloat(0, 1) < $shake) {
            $shakes++;
        }
        $ok = $shakes === 3;
        if ($ok) {
            $this->winner = $side;
            $this->ending = 'caught';
            $this->caught = $target;
        }

        return [['k' => 'catch', 's' => $side, 'item' => $orb->value, 'shakes' => $shakes, 'ok' => $ok]];
    }

    /**
     * @return array<string, mixed>
     */
    private function useItem(int $side, Item $item, int $index): array
    {
        $kin = $this->sides[$side]->team[$index];
        if ($item === Item::Revive) {
            $kin->hp = max(1, intdiv($kin->maxHp(), 2));
        } elseif ($item === Item::Remedy) {
            $kin->status = null;
            $kin->sleep = 0;
        } else {
            $kin->heal($item->heals());
        }

        return ['k' => 'item', 's' => $side, 'item' => $item->value, 'uid' => $kin->uid, 'hp' => $kin->hp, 'max' => $kin->maxHp(),
            'active' => $index === $this->sides[$side]->active];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function attack(int $side, int $index): array
    {
        $me = $this->sides[$side];
        $foe = $this->sides[1 - $side];
        $kin = $me->kin();
        $log = [];
        // sommeil et paralysie
        if ($kin->status === Status::Sleep) {
            if ($kin->sleep > 0) {
                $kin->sleep--;
                $log[] = ['k' => 'asleep', 's' => $side];

                return $log;
            }
            $kin->status = null;
            $log[] = ['k' => 'wake', 's' => $side];
        }
        if ($kin->status === Status::Paralysis && $this->rng->getInt(1, 100) <= 25) {
            $log[] = ['k' => 'para', 's' => $side];

            return $log;
        }
        if ($index >= 0 && isset($kin->moves[$index])) {
            $id = $kin->moves[$index][0];
            $kin->moves[$index][1] = max(0, $kin->moves[$index][1] - 1);
        } else {
            $id = self::STRUGGLE;
        }
        $move = Moves::get($id);
        $log[] = ['k' => 'use', 's' => $side, 'm' => $id];
        $selfOnly = !$move->isDamaging() && (str_starts_with($move->effect, 'stat:self') || $move->effect === 'heal');
        if (!$selfOnly && $this->rng->getInt(1, 100) > $move->accuracy) {
            $log[] = ['k' => 'miss', 's' => $side];

            return $log;
        }
        $target = $foe->kin();
        if ($move->isDamaging()) {
            $eff = $move->type->against(...$target->info()->types);
            if ($eff === 0.0) {
                $log[] = ['k' => 'immune', 't' => 1 - $side];

                return $log;
            }
            $crit = $this->rng->getInt(1, 16) === 1;
            $dmg = $this->damage($me, $foe, $move, $eff, $crit);
            $target->hp = max(0, $target->hp - $dmg);
            $log[] = ['k' => 'hit', 's' => $side, 't' => 1 - $side, 'dmg' => $dmg, 'hp' => $target->hp, 'max' => $target->maxHp(), 'eff' => $eff, 'crit' => $crit];
            if ($target->fainted()) {
                array_push($log, ...$this->faint(1 - $side));

                return $log;
            }
            if ($move->effect !== '' && $this->rng->getInt(1, 100) <= $move->chance) {
                array_push($log, ...$this->effect($side, $move->effect, true));
            }

            return $log;
        }
        array_push($log, ...$this->effect($side, $move->effect, false));

        return $log;
    }

    /** Dégâts : formule classique (niveau, puissance, attaque/défense), même type ×1,5, efficacité, critique ×1,5, aléa 85–100 %. */
    private function damage(Fighter $me, Fighter $foe, Move $move, float $eff, bool $crit): int
    {
        $kin = $me->kin();
        $atk = $kin->stat('atk') * ($crit ? max(1.0, $me->multiplier('atk')) : $me->multiplier('atk'));
        if ($kin->status === Status::Burn) {
            $atk /= 2;
        }
        $def = max(1.0, $foe->kin()->stat('def') * ($crit ? min(1.0, $foe->multiplier('def')) : $foe->multiplier('def')));
        $base = floor(floor((2 * $kin->level / 5 + 2) * $move->power * $atk / $def) / 50) + 2;
        $stab = in_array($move->type, $kin->info()->types, true) ? 1.5 : 1.0;
        $roll = $this->rng->getInt(85, 100) / 100;

        return max(1, (int) floor($base * $stab * $eff * ($crit ? 1.5 : 1.0) * $roll));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function effect(int $side, string $effect, bool $secondary): array
    {
        $parts = explode(':', $effect);
        if ($parts[0] === 'heal') {
            $kin = $this->sides[$side]->kin();
            $kin->heal(intdiv($kin->maxHp(), 2));

            return [['k' => 'heal', 't' => $side, 'hp' => $kin->hp, 'max' => $kin->maxHp()]];
        }
        if ($parts[0] === 'stat' && count($parts) === 4) {
            $who = $parts[1] === 'self' ? $side : 1 - $side;
            $f = $this->sides[$who];
            $stat = $parts[2];
            $old = $f->stages[$stat] ?? 0;
            $new = max(-6, min(6, $old + (int) $parts[3]));
            if ($new === $old) {
                return $secondary ? [] : [['k' => 'nostat', 't' => $who, 'stat' => $stat]];
            }
            $f->stages[$stat] = $new;

            return [['k' => 'stat', 't' => $who, 'stat' => $stat, 'd' => $new - $old]];
        }
        if ($parts[0] === 'status' && isset($parts[1])) {
            $status = Status::from($parts[1]);
            $target = $this->sides[1 - $side]->kin();
            $immune = match ($status) {
                Status::Burn => in_array(Type::Flame, $target->info()->types, true),
                Status::Poison => in_array(Type::Venom, $target->info()->types, true),
                Status::Paralysis => in_array(Type::Volt, $target->info()->types, true),
                Status::Sleep => false,
            };
            if ($target->status !== null || $immune) {
                return $secondary ? [] : [['k' => 'fail', 't' => 1 - $side]];
            }
            $target->status = $status;
            $target->sleep = $status === Status::Sleep ? $this->rng->getInt(1, 3) : 0;

            return [['k' => 'status', 't' => 1 - $side, 'st' => $status->value]];
        }

        return [];
    }

    /**
     * K.-O. d'une créature du camp `$side` : expérience pour le joueur, remplacement ou fin du combat.
     * @return list<array<string, mixed>>
     */
    private function faint(int $side): array
    {
        $log = [['k' => 'faint', 't' => $side]];
        $fallen = $this->sides[$side]->kin();
        $fallen->status = null;
        $fallen->sleep = 0;
        if ($side === 1 && $this->kind !== Kind::Duel) {
            array_push($log, ...$this->award($fallen));
        }
        $f = $this->sides[$side];
        if ($f->alive() === 0) {
            $this->winner = 1 - $side;

            return $log;
        }
        if ($f->ai) {
            $next = $f->firstAlive() ?? 0;
            $f->bring($next);
            $log[] = ['k' => 'send', 's' => $side, 'kin' => $f->kin()->toFoe()];
        } else {
            $this->replace[$side] = true;
        }

        return $log;
    }

    /**
     * Expérience : pleine pour la créature au front, un tiers pour les autres créatures valides de l'équipe.
     * @return list<array<string, mixed>>
     */
    private function award(Kin $fallen): array
    {
        $gain = (int) floor($fallen->info()->xpYield * $fallen->level / 7 * ($this->kind === Kind::Trainer ? 1.5 : 1.0));
        $log = [];
        $me = $this->sides[0];
        foreach ($me->team as $i => $kin) {
            if ($kin->fainted() || $kin->level >= Kin::MAX_LEVEL) {
                continue;
            }
            $amount = $i === $me->active ? $gain : max(1, intdiv($gain, 3));
            $log[] = ['k' => 'xp', 'uid' => $kin->uid, 'gain' => $amount];
            $events = $kin->gainXp($amount);
            if ($events !== []) {
                $this->leveled[$kin->uid] = true;
            }
            array_push($log, ...$events);
        }

        return $log;
    }

    /**
     * Ce que voit le camp `$side` (son équipe complète, la créature adverse au front).
     *
     * @return array<string, mixed>
     */
    public function view(int $side): array
    {
        $me = $this->sides[$side];
        $foe = $this->sides[1 - $side];

        return [
            'kind' => $this->kind->value,
            'turn' => $this->turn,
            'team' => array_map(static fn (Kin $k): array => $k->toClient(), $me->team),
            'active' => $me->active,
            'stages' => $me->stages,
            'foe' => $foe->kin()->toFoe(),
            'foeStages' => $foe->stages,
            'foeTeam' => array_map(static fn (Kin $k): bool => !$k->fainted(), $foe->team),
            'foeName' => $foe->name,
            'foeSprite' => $foe->trainerSprite,
            'replace' => $this->replace[$side],
            'foeReplace' => $this->replace[1 - $side],
            'over' => $this->over(),
        ];
    }

    /**
     * Le journal vu par le camp 1 : les côtés sont inversés.
     * @param list<array<string, mixed>> $log
     * @return list<array<string, mixed>>
     */
    public static function flip(array $log): array
    {
        return array_map(static function (array $e): array {
            foreach (['s', 't'] as $key) {
                if (isset($e[$key]) && is_int($e[$key])) {
                    $e[$key] = 1 - $e[$key];
                }
            }

            return $e;
        }, $log);
    }
}
