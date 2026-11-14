<?php

declare(strict_types=1);

namespace Bramble\Game;

use Bramble\Content\Item;
use Bramble\Content\Moves;
use Bramble\Content\Type;
use Bramble\Creature\Kin;
use Bramble\Player\Profile;

/** Utilisation d'un objet hors combat : soins, capsules techniques, objets rares, vélo. */
final class ItemUse
{
    /**
     * @return string|list<array<string, mixed>> le motif d'un refus, ou le journal à afficher
     */
    public static function apply(Profile $p, Item $item, int $uid, bool $outdoors): string|array
    {
        if ($p->count($item) < 1) {
            return 'no_item';
        }
        switch ($item->kind()) {
            case 'heal':
                return Fights::useOutside($p, $item, $uid) ?? [];
            case 'orb':
                return 'bad_item';
            case 'key':
                if ($item !== Item::Bike) {
                    return 'passive';
                }
                if (!$outdoors && !$p->riding) {
                    return 'no_bike_here';
                }
                $p->riding = !$p->riding;

                return [['k' => 'bike', 'on' => $p->riding]];
        }
        $i = $p->teamIndex($uid);
        if ($i === null) {
            return 'bad_item';
        }
        $kin = $p->team[$i];
        $move = $item->move();
        if ($move !== null) {
            $type = Moves::get($move)->type;
            if ($type !== Type::Normal && !in_array($type, $kin->info()->types, true)) {
                return 'incompatible';
            }
            if (in_array($move, array_map(static fn (array $m): string => $m[0], $kin->moves), true)) {
                return 'known';
            }
            $p->take($item);

            return [$kin->learn($move)];
        }
        if ($item === Item::RareCandy) {
            if ($kin->level >= 100) {
                return 'useless';
            }
            $p->take($item);
            $log = $kin->gainXp(Kin::xpFor($kin->level + 1) - $kin->xp);
            $from = $kin->evolveIfReady();
            if ($from !== null) {
                $p->dex[$kin->species] = 2;
                $log[] = ['k' => 'evolve', 'uid' => $kin->uid, 'from' => $from, 'to' => $kin->species];
            }

            return $log;
        }
        // pierre d'éveil
        $from = $kin->evolveNow();
        if ($from === null) {
            return 'useless';
        }
        $p->take($item);
        $p->dex[$kin->species] = 2;

        return [['k' => 'evolve', 'uid' => $kin->uid, 'from' => $from, 'to' => $kin->species]];
    }
}
