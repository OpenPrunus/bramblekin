<?php

declare(strict_types=1);

namespace Bramble\Player;

use Bramble\Content\Dex;
use Bramble\Content\Item;
use Bramble\Creature\Kin;
use Bramble\World\World;

/** La sauvegarde d'un joueur (côté serveur : c'est elle qui fait foi). */
final class Profile
{
    final public const int TEAM_MAX = 6;
    final public const int BOX_MAX = 300;

    public string $zone;
    public int $x;
    public int $y;
    public string $dir = 'u';
    public int $money = 1000;
    /**
     * @var array<string, int>
     */
    public array $items = ['orb' => 5, 'potion' => 3];
    /**
     * @var list<Kin>
     */
    public array $team = [];
    /**
     * @var list<Kin>
     */
    public array $box = [];
    /**
     * @var list<int>
     */
    public array $badges = [];
    /**
     * @var array<string, true> dresseurs battus, objets ramassés
     */
    public array $done = [];
    /**
     * @var array<int, int> espèce → 1 (vue) ou 2 (attrapée)
     */
    public array $dex = [];
    public int $healTown = 1;
    public int $look = 0;
    public int $nextUid = 1;
    public bool $champion = false;
    public int $created;

    public function __construct(public readonly string $id, public string $name, int $now)
    {
        [$this->zone, $this->x, $this->y] = World::start();
        $this->created = $now;
    }

    public function hasStarter(): bool
    {
        return $this->team !== [] || $this->box !== [];
    }

    public function newKin(int $species, int $level): Kin
    {
        return Kin::create($this->nextUid++, $species, $level);
    }

    /** Range une créature (équipe si place, sinon boîte) et la marque attrapée. Renvoie 'team', 'box' ou null (boîte pleine). */
    public function store(Kin $kin): ?string
    {
        $this->dex[$kin->species] = 2;
        if (count($this->team) < self::TEAM_MAX) {
            $this->team[] = $kin;

            return 'team';
        }
        if (count($this->box) < self::BOX_MAX) {
            $this->box[] = $kin;

            return 'box';
        }

        return null;
    }

    public function seen(int $species): void
    {
        $this->dex[$species] = max(1, $this->dex[$species] ?? 0);
    }

    public function count(Item $item): int
    {
        return $this->items[$item->value] ?? 0;
    }

    public function take(Item $item, int $n = 1): bool
    {
        if ($this->count($item) < $n) {
            return false;
        }
        $this->items[$item->value] -= $n;
        if ($this->items[$item->value] === 0) {
            unset($this->items[$item->value]);
        }

        return true;
    }

    public function give(Item $item, int $n = 1): void
    {
        $this->items[$item->value] = min(999, $this->count($item) + $n);
    }

    public function teamIndex(int $uid): ?int
    {
        foreach ($this->team as $i => $kin) {
            if ($kin->uid === $uid) {
                return $i;
            }
        }

        return null;
    }

    public function aliveCount(): int
    {
        return count(array_filter($this->team, static fn (Kin $k): bool => !$k->fainted()));
    }

    public function healAll(): void
    {
        foreach ($this->team as $kin) {
            $kin->restore();
        }
    }

    public function badgeCount(): int
    {
        return count($this->badges);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'v' => 1, 'name' => $this->name, 'zone' => $this->zone, 'x' => $this->x, 'y' => $this->y, 'dir' => $this->dir,
            'money' => $this->money, 'items' => $this->items,
            'team' => array_map(static fn (Kin $k): array => $k->toArray(), $this->team),
            'box' => array_map(static fn (Kin $k): array => $k->toArray(), $this->box),
            'badges' => $this->badges, 'done' => array_keys($this->done), 'dex' => $this->dex, 'heal' => $this->healTown,
            'look' => $this->look, 'uid' => $this->nextUid, 'champion' => $this->champion, 'created' => $this->created,
        ];
    }

    /**
     * @param array<mixed> $d
     */
    public static function fromArray(string $id, array $d, int $now): self
    {
        $p = new self($id, is_string($d['name'] ?? null) ? $d['name'] : 'Kin', is_int($d['created'] ?? null) ? $d['created'] : $now);
        $zone = is_string($d['zone'] ?? null) ? World::zone($d['zone']) : null;
        if ($zone !== null && is_int($d['x'] ?? null) && is_int($d['y'] ?? null)) {
            [$p->zone, $p->x, $p->y] = [$zone->id, $d['x'], $d['y']];
        }
        $p->dir = in_array($d['dir'] ?? null, ['u', 'd', 'l', 'r'], true) ? (string) $d['dir'] : 'u';
        $p->money = is_int($d['money'] ?? null) ? max(0, $d['money']) : 0;
        $p->items = [];
        foreach (is_array($d['items'] ?? null) ? $d['items'] : [] as $id => $n) {
            if (is_string($id) && Item::tryFrom($id) !== null && is_int($n) && $n > 0) {
                $p->items[$id] = min(999, $n);
            }
        }
        $maxUid = 0;
        foreach (['team', 'box'] as $field) {
            foreach (is_array($d[$field] ?? null) ? $d[$field] : [] as $row) {
                $kin = is_array($row) ? Kin::tryFromArray($row) : null;
                if ($kin === null) {
                    continue;
                }
                $maxUid = max($maxUid, $kin->uid);
                if ($field === 'team' && count($p->team) < self::TEAM_MAX) {
                    $p->team[] = $kin;
                } else {
                    $p->box[] = $kin;
                }
            }
        }
        $p->badges = array_values(array_unique(array_filter(is_array($d['badges'] ?? null) ? $d['badges'] : [], static fn (mixed $b): bool => is_int($b) && $b >= 1 && $b <= 8)));
        sort($p->badges);
        foreach (is_array($d['done'] ?? null) ? $d['done'] : [] as $key) {
            if (is_string($key)) {
                $p->done[$key] = true;
            }
        }
        foreach (is_array($d['dex'] ?? null) ? $d['dex'] : [] as $species => $state) {
            if (is_int($species) && Dex::exists($species) && in_array($state, [1, 2], true)) {
                $p->dex[$species] = $state;
            }
        }
        $p->healTown = is_int($d['heal'] ?? null) && $d['heal'] >= 1 && $d['heal'] <= World::TOWNS ? $d['heal'] : 1;
        $p->look = is_int($d['look'] ?? null) ? max(0, min(7, $d['look'])) : 0;
        $p->nextUid = max($maxUid + 1, is_int($d['uid'] ?? null) ? $d['uid'] : 1);
        $p->champion = ($d['champion'] ?? false) === true;
        if ($p->team === [] && $p->box !== []) {
            $first = array_shift($p->box);
            $p->team[] = $first;
        }

        return $p;
    }

    /**
     * Ce que le joueur voit de sa propre sauvegarde.
     * @return array<string, mixed>
     */
    public function toClient(): array
    {
        return [
            'name' => $this->name, 'money' => $this->money, 'items' => (object) $this->items, 'badges' => $this->badges,
            'team' => array_map(static fn (Kin $k): array => $k->toClient(), $this->team),
            'boxCount' => count($this->box), 'dex' => (object) $this->dex, 'look' => $this->look, 'champion' => $this->champion,
            'heal' => $this->healTown,
        ];
    }
}
