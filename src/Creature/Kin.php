<?php

declare(strict_types=1);

namespace Bramble\Creature;

use Bramble\Content\Dex;
use Bramble\Content\Moves;
use Bramble\Content\Species;
use Bramble\Content\Status;

/** Une créature possédée (ou sauvage) : niveau, expérience, PV, attaques (avec leurs PP), état. */
final class Kin
{
    final public const int MAX_LEVEL = 100;

    /**
     * @var list<array{0: string, 1: int}> attaque, PP restants
     */
    public array $moves = [];
    /**
     * Attaques que la créature veut apprendre alors qu'elle en connaît déjà quatre.
     * @var list<string>
     */
    public array $pending = [];
    public ?Status $status = null;
    public int $sleep = 0;
    public int $hp;

    public function __construct(public int $uid, public int $species, public int $level, public int $xp = -1)
    {
        $this->level = max(1, min(self::MAX_LEVEL, $level));
        if ($this->xp < self::xpFor($this->level)) {
            $this->xp = self::xpFor($this->level);
        }
        $this->hp = $this->stat('hp');
    }

    /** Une créature fraîche : ses quatre dernières attaques, PV pleins. */
    public static function create(int $uid, int $species, int $level): self
    {
        $kin = new self($uid, $species, $level);
        foreach (Dex::get($species)->movesAt($kin->level) as $id) {
            $kin->moves[] = [$id, Moves::get($id)->pp];
        }

        return $kin;
    }

    /** Expérience totale pour atteindre un niveau (courbe cubique). */
    public static function xpFor(int $level): int
    {
        return $level <= 1 ? 0 : $level ** 3;
    }

    public function info(): Species
    {
        return Dex::get($this->species);
    }

    /** Statistique au niveau actuel (hp, atk, def, spd). */
    public function stat(string $stat): int
    {
        $base = $this->info()->base[$stat] ?? 0;
        $value = intdiv(2 * $base * $this->level, 100);

        return $stat === 'hp' ? $value + $this->level + 10 : $value + 5;
    }

    public function maxHp(): int
    {
        return $this->stat('hp');
    }

    public function fainted(): bool
    {
        return $this->hp <= 0;
    }

    /** Soin complet : PV, PP, état. */
    public function restore(): void
    {
        $this->hp = $this->maxHp();
        $this->status = null;
        $this->sleep = 0;
        foreach ($this->moves as $i => [$id]) {
            $this->moves[$i][1] = Moves::get($id)->pp;
        }
    }

    public function heal(int $amount): int
    {
        $before = $this->hp;
        $this->hp = min($this->maxHp(), $this->hp + $amount);

        return $this->hp - $before;
    }

    /**
     * Ajoute de l'expérience ; renvoie les niveaux franchis et les attaques apprises (ou mises en attente).
     *
     * @return list<array<string, mixed>>
     */
    public function gainXp(int $amount): array
    {
        $events = [];
        if ($this->level >= self::MAX_LEVEL) {
            return $events;
        }
        $this->xp += $amount;
        while ($this->level < self::MAX_LEVEL && $this->xp >= self::xpFor($this->level + 1)) {
            $oldMax = $this->maxHp();
            $this->level++;
            if (!$this->fainted()) {
                $this->hp += $this->maxHp() - $oldMax;
            }
            $events[] = ['k' => 'level', 'uid' => $this->uid, 'level' => $this->level];
            foreach ($this->info()->learnedAt($this->level) as $move) {
                $events[] = $this->learn($move);
            }
        }

        return $events;
    }

    /**
     * @return array<string, mixed>
     */
    public function learn(string $move): array
    {
        foreach ($this->moves as [$id]) {
            if ($id === $move) {
                return ['k' => 'known', 'uid' => $this->uid, 'move' => $move];
            }
        }
        if (count($this->moves) < 4) {
            $this->moves[] = [$move, Moves::get($move)->pp];

            return ['k' => 'learn', 'uid' => $this->uid, 'move' => $move];
        }
        if (!in_array($move, $this->pending, true)) {
            $this->pending[] = $move;
        }

        return ['k' => 'wants', 'uid' => $this->uid, 'move' => $move];
    }

    /** Remplace l'attaque `$slot` par une attaque en attente (`$slot` < 0 : renonce). */
    public function resolvePending(string $move, int $slot): bool
    {
        $at = array_search($move, $this->pending, true);
        if ($at === false || $slot >= count($this->moves)) {
            return false;
        }
        array_splice($this->pending, (int) $at, 1);
        if ($slot >= 0) {
            $this->moves[$slot] = [$move, Moves::get($move)->pp];
        }

        return true;
    }

    /** Évolue si le niveau le permet ; renvoie l'ancienne espèce ou null. */
    public function evolveIfReady(): ?int
    {
        $info = $this->info();
        if ($info->evolvesTo === null || $this->level < $info->evolveLevel) {
            return null;
        }
        $from = $this->species;
        $ratio = $this->hp / max(1, $this->maxHp());
        $this->species = $info->evolvesTo;
        $this->hp = $this->fainted() ? 0 : max(1, (int) round($ratio * $this->maxHp()));

        return $from;
    }

    /** Copie pour un duel : même espèce et mêmes attaques, ramenée au niveau donné, soignée. */
    public function duelCopy(int $level): self
    {
        $copy = new self($this->uid, $this->species, $level);
        $copy->moves = $this->moves;
        $copy->restore();

        return $copy;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'u' => $this->uid, 's' => $this->species, 'l' => $this->level, 'x' => $this->xp, 'h' => $this->hp,
            'm' => $this->moves, 'st' => $this->status?->value, 'sl' => $this->sleep, 'p' => $this->pending,
        ];
    }

    /**
     * @param array<mixed> $row
     */
    public static function tryFromArray(array $row): ?self
    {
        $species = $row['s'] ?? null;
        $level = $row['l'] ?? null;
        $uid = $row['u'] ?? null;
        if (!is_int($species) || !Dex::exists($species) || !is_int($level) || !is_int($uid)) {
            return null;
        }
        $kin = new self($uid, $species, $level, is_int($row['x'] ?? null) ? $row['x'] : -1);
        foreach (is_array($row['m'] ?? null) ? $row['m'] : [] as $m) {
            if (is_array($m) && is_string($m[0] ?? null) && Moves::exists($m[0]) && is_int($m[1] ?? null) && count($kin->moves) < 4) {
                $kin->moves[] = [$m[0], max(0, min(Moves::get($m[0])->pp, $m[1]))];
            }
        }
        if ($kin->moves === []) {
            foreach ($kin->info()->movesAt($kin->level) as $id) {
                $kin->moves[] = [$id, Moves::get($id)->pp];
            }
        }
        $kin->hp = is_int($row['h'] ?? null) ? max(0, min($kin->maxHp(), $row['h'])) : $kin->maxHp();
        $kin->status = is_string($row['st'] ?? null) ? Status::tryFrom($row['st']) : null;
        $kin->sleep = is_int($row['sl'] ?? null) ? max(0, $row['sl']) : 0;
        foreach (is_array($row['p'] ?? null) ? $row['p'] : [] as $p) {
            if (is_string($p) && Moves::exists($p)) {
                $kin->pending[] = $p;
            }
        }

        return $kin;
    }

    /**
     * Ce que le client affiche de sa propre créature.
     * @return array<string, mixed>
     */
    public function toClient(): array
    {
        return [
            'uid' => $this->uid, 'sp' => $this->species, 'lv' => $this->level, 'hp' => $this->hp, 'max' => $this->maxHp(),
            'xp' => $this->xp, 'xpLo' => self::xpFor($this->level), 'xpHi' => self::xpFor(min(self::MAX_LEVEL, $this->level + 1)),
            'moves' => array_map(static fn (array $m): array => ['id' => $m[0], 'pp' => $m[1], 'max' => Moves::get($m[0])->pp], $this->moves),
            'st' => $this->status?->value, 'pending' => $this->pending,
            'stats' => ['atk' => $this->stat('atk'), 'def' => $this->stat('def'), 'spd' => $this->stat('spd')],
        ];
    }

    /**
     * Ce que l'adversaire voit.
     * @return array<string, mixed>
     */
    public function toFoe(): array
    {
        return ['uid' => $this->uid, 'sp' => $this->species, 'lv' => $this->level, 'hp' => $this->hp, 'max' => $this->maxHp(), 'st' => $this->status?->value];
    }
}
