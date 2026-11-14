<?php

declare(strict_types=1);

namespace Bramble\Game;

use Bramble\Player\Profile;
use Bramble\World\Npc;
use Bramble\World\World;
use Bramble\World\Zone;

/** Qui est connecté, et qui se trouve sur quelle carte : diffuse les déplacements aux joueurs de la même carte. */
final class Presence
{
    /**
     * @var array<int, Client>
     */
    public array $clients = [];
    /**
     * @var array<string, array<int, Client>> carte → joueurs identifiés
     */
    private array $zones = [];

    public function add(Client $c): void
    {
        $this->clients[$c->id] = $c;
    }

    public function get(int $id): ?Client
    {
        $c = $this->clients[$id] ?? null;

        return $c !== null && $c->ready() ? $c : null;
    }

    /**
     * @return list<Client>
     */
    public function ready(): array
    {
        return array_values(array_filter($this->clients, static fn (Client $c): bool => $c->ready()));
    }

    public function byToken(string $id): ?Client
    {
        foreach ($this->clients as $c) {
            if ($c->profile?->id === $id && !$c->kicked) {
                return $c;
            }
        }

        return null;
    }

    public function nameTaken(string $key, string $exceptId): bool
    {
        foreach ($this->clients as $c) {
            if ($c->ready() && $c->profile !== null && $c->profile->id !== $exceptId && \Arcade\Support\Nickname::key($c->profile->name) === $key) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string, mixed>
     */
    public static function peer(Client $c): array
    {
        $p = $c->profile;

        return $p === null ? [] : ['id' => $c->id, 'name' => $p->name, 'x' => $p->x, 'y' => $p->y, 'd' => $p->dir, 'look' => $p->look, 'busy' => $c->busy()];
    }

    /** Fait entrer le joueur sur sa carte actuelle : il reçoit la carte et les joueurs présents, eux le voient arriver. */
    public function enter(Client $c): void
    {
        $p = $c->profile;
        if ($p === null) {
            return;
        }
        $zone = World::zone($p->zone) ?? World::zone(World::START);
        if ($zone === null) {
            return;
        }
        $peers = array_values(array_map(self::peer(...), array_filter($this->zones[$zone->id] ?? [], static fn (Client $o): bool => $o !== $c)));
        $this->zones[$zone->id][$c->id] = $c;
        $c->send('zone', [
            'zone' => $zone->toClient(self::visibleFor($p), self::beatenBy($p)),
            'me' => ['x' => $p->x, 'y' => $p->y, 'd' => $p->dir],
            'peers' => $peers,
        ]);
        $this->broadcast($zone->id, 'peer', self::peer($c), $c);
    }

    public function leave(Client $c, string $zone): void
    {
        if (isset($this->zones[$zone][$c->id])) {
            unset($this->zones[$zone][$c->id]);
            $this->broadcast($zone, 'gone', ['id' => $c->id]);
        }
    }

    public function remove(Client $c): void
    {
        foreach (array_keys($this->zones) as $zone) {
            $this->leave($c, $zone);
        }
        unset($this->clients[$c->id]);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function broadcast(string $zone, string $type, array $data, ?Client $except = null): void
    {
        foreach ($this->zones[$zone] ?? [] as $other) {
            if ($other !== $except) {
                $other->send($type, $data);
            }
        }
    }

    public function moved(Client $c): void
    {
        if ($c->profile !== null) {
            $this->broadcast($c->profile->zone, 'peer', self::peer($c), $c);
        }
    }

    public function sameZone(Client $a, Client $b): bool
    {
        return $a->profile !== null && $b->profile !== null && $a->profile->zone === $b->profile->zone;
    }

    public function count(): int
    {
        return count($this->clients);
    }

    /**
     * Les gardes s'effacent devant les badges, les objets ramassés disparaissent.
     * @return callable(Npc): bool
     */
    public static function visibleFor(Profile $p): callable
    {
        return static fn (Npc $n): bool => match ($n->kind) {
            'guard' => $p->badgeCount() < $n->need,
            'item' => !isset($p->done[$n->id]),
            default => true,
        };
    }

    /**
     * @return callable(Npc): bool
     */
    public static function beatenBy(Profile $p): callable
    {
        return static fn (Npc $n): bool => isset($p->done[$n->id]);
    }

    public static function zoneOf(Profile $p): Zone
    {
        return World::zone($p->zone) ?? throw new \LogicException('unknown zone');
    }
}
