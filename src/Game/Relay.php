<?php

declare(strict_types=1);

namespace Bramble\Game;

use Arcade\Support\Nickname;
use Bramble\Api\Nicknames;

/**
 * Positions du monde 3D, relayées en temps réel. Le navigateur reste maître de sa partie (sauvegarde et combats côté
 * client) : le serveur ne fait que dire à chacun où sont les autres joueurs du même lieu, à chaque pas.
 *
 *   → {t: "whereHello", token, name, place, x, y, d}   ← {t: "wherePeers", me, peers: [{id, name, x, y, d}]}
 *   → {t: "where", place, x, y, d}                      aux autres : {t: "whereMove", id, x, y, d}
 *   aux autres en entrant / en partant d'un lieu : {t: "whereJoin", id, name, x, y, d} / {t: "whereLeave", id}
 *
 * Lieu : "out" dehors (coordonnées du monde continu) ou l'identifiant d'un intérieur. La chambre "ha1" est privée.
 * Identifiant public = 12 hex de sha256("public:" + code), le même que pour le chat ; jamais le code lui-même.
 */
final class Relay
{
    /**
     * @var array<int, array{client: Client, id: string, name: string, place: string, x: int, y: int, d: string}>
     */
    private array $here = [];

    public function __construct(private readonly ?Nicknames $names = null)
    {
    }

    /**
     * @param array<string, mixed> $msg
     */
    public function receive(Client $c, string $type, array $msg, int $now): void
    {
        if ($type === 'whereHello') {
            $this->hello($c, $msg, $now);

            return;
        }
        $me = $this->here[$c->id] ?? null;
        $pos = self::position($msg);
        if ($me === null || $pos === null) {
            $c->error($me === null ? 'not_ready' : 'bad_position');

            return;
        }
        [$place, $x, $y, $d] = $pos;
        $place = $place === 'ha1' ? 'ha1#' . $me['id'] : $place;
        if ($place !== $me['place']) {
            $this->broadcast($me['place'], 'whereLeave', ['id' => $me['id']], $c->id);
            $this->here[$c->id] = [...$me, 'place' => $place, 'x' => $x, 'y' => $y, 'd' => $d];
            $this->arrive($c);

            return;
        }
        $this->here[$c->id] = [...$me, 'x' => $x, 'y' => $y, 'd' => $d];
        $this->broadcast($place, 'whereMove', ['id' => $me['id'], 'x' => $x, 'y' => $y, 'd' => $d], $c->id);
    }

    public function remove(Client $c): void
    {
        $me = $this->here[$c->id] ?? null;
        if ($me === null) {
            return;
        }
        unset($this->here[$c->id]);
        $this->broadcast($me['place'], 'whereLeave', ['id' => $me['id']], $c->id);
    }

    public function count(): int
    {
        return count($this->here);
    }

    /**
     * @param array<string, mixed> $msg
     */
    private function hello(Client $c, array $msg, int $now): void
    {
        $token = $msg['token'] ?? null;
        $pos = self::position($msg);
        if (!is_string($token) || preg_match('/^[A-Za-z0-9_-]{24,128}$/', $token) !== 1 || $pos === null) {
            $c->error('bad_hello');

            return;
        }
        $id = substr(hash('sha256', 'public:' . $token), 0, 12);
        // un même joueur ouvert dans deux onglets : seule la dernière connexion compte
        foreach ($this->here as $cid => $other) {
            if ($other['id'] === $id && $cid !== $c->id) {
                $this->remove($other['client']);
            }
        }
        $this->remove($c);
        // le pseudo n'est montré que s'il est réservé à ce joueur (mêmes règles que le chat)
        $name = Nickname::clean(is_string($msg['name'] ?? null) ? $msg['name'] : '');
        if (mb_strlen($name) < 2 || ($this->names !== null && !$this->names->claim($name, $id, $now))) {
            $name = '';
        }
        [$place, $x, $y, $d] = $pos;
        $place = $place === 'ha1' ? "ha1#$id" : $place;
        $this->here[$c->id] = ['client' => $c, 'id' => $id, 'name' => $name, 'place' => $place, 'x' => $x, 'y' => $y, 'd' => $d];
        $this->arrive($c);
    }

    /** Le joueur arrive dans un lieu : il reçoit ceux qui y sont, et eux le voient apparaître. */
    private function arrive(Client $c): void
    {
        $me = $this->here[$c->id];
        $peers = [];
        foreach ($this->here as $cid => $p) {
            if ($cid !== $c->id && $p['place'] === $me['place']) {
                $peers[] = self::view($p);
            }
        }
        $c->send('wherePeers', ['me' => $me['id'], 'peers' => $peers]);
        $this->broadcast($me['place'], 'whereJoin', self::view($me), $c->id);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function broadcast(string $place, string $type, array $data, int $except): void
    {
        foreach ($this->here as $cid => $p) {
            if ($cid !== $except && $p['place'] === $place) {
                $p['client']->send($type, $data);
            }
        }
    }

    /**
     * @param array{id: string, name: string, x: int, y: int, d: string} $p
     * @return array{id: string, name: string, x: int, y: int, d: string}
     */
    private static function view(array $p): array
    {
        return ['id' => $p['id'], 'name' => $p['name'], 'x' => $p['x'], 'y' => $p['y'], 'd' => $p['d']];
    }

    /**
     * @param array<string, mixed> $msg
     * @return array{0: string, 1: int, 2: int, 3: string}|null
     */
    private static function position(array $msg): ?array
    {
        $place = $msg['place'] ?? null;
        $x = $msg['x'] ?? null;
        $y = $msg['y'] ?? null;
        $d = $msg['d'] ?? 'd';
        if (!is_string($place) || preg_match('/^[a-z0-9]{1,8}$/', $place) !== 1 || !is_int($x) || !is_int($y)
            || abs($x) > 100000 || abs($y) > 100000 || !in_array($d, ['u', 'd', 'l', 'r'], true)) {
            return null;
        }

        return [$place, $x, $y, $d];
    }
}
