<?php
// Régénère les données de l'aperçu 3D (web/zones.json et web/content.json) depuis le générateur du monde : php tools/export-3d.php
// Exporte les 60 cartes du jeu (avec la destination des passages) pour la démo 3D.
require __DIR__ . '/../vendor/autoload.php';
use Bramble\World\World;
$out = [];
foreach (World::zones() as $id => $z) {
    $out[$id] = [
        'id' => $id, 'name' => $z->name, 'kind' => $z->kind, 'index' => $z->index, 'theme' => $z->theme, 'rows' => $z->rows,
        'wild' => $z->encounters,
        'warps' => array_map(static fn ($w) => [$w->x, $w->y, $w->zone, $w->toX, $w->toY], $z->warps),
        'npcs' => array_map(static fn ($n) => ['id' => $n->id, 'kind' => $n->kind, 'x' => $n->x, 'y' => $n->y, 'd' => $n->dir, 'sprite' => $n->sprite, 'team' => $n->team, 'cls' => $n->cls, 'name' => $n->name, 'item' => $n->item?->label()['fr'], 'text' => $n->text], $z->npcs),
    ];
}
file_put_contents(__DIR__ . '/../web/zones.json', json_encode($out, JSON_UNESCAPED_UNICODE));
echo count($out), " cartes\n";
$content = [
    'species' => array_values(array_map(static fn ($sp) => $sp->toClient() + ['learnset' => $sp->learnset, 'xp' => $sp->xpYield], Bramble\Content\Dex::all())),
    'moves' => array_map(static fn ($m) => $m->toClient(), Bramble\Content\Moves::all()),
    'chart' => Bramble\Content\Type::chart(),
];
file_put_contents(__DIR__ . '/../web/content.json', json_encode($content, JSON_UNESCAPED_UNICODE));
