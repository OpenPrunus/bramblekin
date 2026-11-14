<?php

declare(strict_types=1);

namespace Bramble\Content;

/**
 * Les lignées de créatures (« kins ») : types, noms de chaque stade, niveaux d'évolution et zone d'apparition
 * (0 = compagnon de départ, 1 à 9 = route à partir de laquelle on la croise, 10 = rareté légendaire).
 * Les numéros du bestiaire suivent l'ordre de cette table : 150 créatures en tout.
 */
final class Lines
{
    /**
     * @var list<array{0: list<string>, 1: list<string>, 2: list<int>, 3: int}>
     */
    final public const array ALL = [
        // compagnons de départ
        [['leaf'], ['Pousseron', 'Ronçalin', 'Sylvorne'], [16, 36], 0],
        [['flame'], ['Braisillon', 'Fournaille', 'Volcanor'], [16, 36], 0],
        [['tide'], ['Gouttelin', 'Ondelame', 'Marévor'], [16, 36], 0],
        // trois stades
        [['normal', 'gust'], ['Piouchet', 'Plumaille', 'Aquilor'], [12, 30], 1],
        [['normal'], ['Grignou', 'Croquebois', 'Mâchefort'], [12, 30], 1],
        [['venom', 'gust'], ['Chenillou', 'Cocottin', 'Papillombre'], [8, 14], 1],
        [['volt'], ['Étincelot', 'Voltigeon', 'Fulgurix'], [18, 34], 2],
        [['stone'], ['Caillouto', 'Rocassin', 'Monolithe'], [20, 38], 2],
        [['leaf', 'venom'], ['Champilou', 'Spormoisi', 'Moisirex'], [18, 36], 2],
        [['frost'], ['Givrinet', 'Glacerf', 'Blizzardoc'], [22, 40], 5],
        [['spirit'], ['Lumignon', 'Spectrelle', 'Hantombre'], [24, 40], 4],
        [['tide', 'stone'], ['Coquillon', 'Pincegalet', 'Récifort'], [20, 38], 3],
        [['gust'], ['Souffleau', 'Bourrasquin', 'Tempêtor'], [20, 38], 3],
        [['flame', 'stone'], ['Scorillon', 'Lavabrut', 'Cratérion'], [22, 42], 4],
        [['volt', 'gust'], ['Lucelle', 'Fulgiluce', 'Orageline'], [16, 32], 2],
        [['leaf', 'gust'], ['Graminelle', 'Pissenvol', 'Aigrettine'], [14, 30], 1],
        [['venom'], ['Crapaudin', 'Bavimarais', 'Crapotoxe'], [18, 36], 3],
        [['tide', 'frost'], ['Phoquette', 'Banquisard', 'Morsépic'], [24, 42], 6],
        [['normal'], ['Peluchon', 'Câlinours', 'Ursoléon'], [20, 40], 4],
        [['stone', 'spirit'], ['Gargouillon', 'Pierrhante', 'Obéliscelle'], [26, 44], 7],
        [['spirit', 'frost'], ['Flocombre', 'Glaçombre', 'Spectregel'], [26, 44], 7],
        [['volt', 'stone'], ['Bobinot', 'Ferrovolt', 'Dynamorph'], [22, 40], 5],
        [['flame', 'gust'], ['Fumerole', 'Cendrevol', 'Phénixar'], [24, 44], 6],
        [['leaf', 'stone'], ['Mousseroc', 'Lichénor', 'Arbolithe'], [20, 40], 5],
        [['tide', 'spirit'], ['Méduson', 'Abyssile', 'Néréidra'], [24, 44], 8],
        // deux stades
        [['normal'], ['Trottimulot', 'Gerbillar'], [18], 1],
        [['gust'], ['Moinelet', 'Corbaron'], [20], 2],
        [['flame'], ['Pyrolin', 'Pyrolion'], [28], 3],
        [['tide'], ['Têtardine', 'Grenouillage'], [22], 1],
        [['leaf'], ['Champignard', 'Champidor'], [24], 2],
        [['volt'], ['Zappeton', 'Zappoing'], [26], 3],
        [['stone'], ['Galechon', 'Galetroll'], [28], 4],
        [['frost'], ['Frimousse', 'Frimastodonte'], [30], 6],
        [['venom'], ['Sifflaspic', 'Aspicorne'], [26], 4],
        [['spirit'], ['Murmurin', 'Lamentor'], [30], 5],
        [['normal', 'gust'], ['Chouettard', 'Hibouclard'], [22], 2],
        [['tide', 'gust'], ['Mouettin', 'Albatrombe'], [26], 3],
        [['leaf', 'frost'], ['Pinsapin', 'Sapinoël'], [30], 6],
        [['flame', 'normal'], ['Grillon', 'Criquetfeu'], [20], 1],
        [['volt', 'tide'], ['Anguicelle', 'Murénovolt'], [28], 4],
        [['stone', 'normal'], ['Taupinet', 'Taupinator'], [22], 2],
        [['venom', 'tide'], ['Fangeon', 'Bourbouillon'], [24], 3],
        [['spirit', 'flame'], ['Chandelin', 'Lustrombre'], [32], 7],
        [['frost', 'gust'], ['Manchoutin', 'Empergivre'], [28], 6],
        [['normal'], ['Biquette', 'Bouquetor'], [24], 3],
        [['leaf', 'normal'], ['Escarlimace', 'Escargoliath'], [26], 4],
        [['tide'], ['Hippocalme', 'Hippotempête'], [30], 5],
        [['stone', 'frost'], ['Stalagnon', 'Stalagmor'], [32], 7],
        [['volt', 'normal'], ['Zébrillon', 'Zébroudre'], [28], 5],
        [['venom', 'leaf'], ['Ortiglou', 'Ortigarde'], [24], 3],
        [['spirit', 'gust'], ['Voilette', 'Voilombre'], [30], 6],
        [['flame', 'venom'], ['Fumigon', 'Fumivore'], [28], 5],
        [['frost', 'normal'], ['Yétinou', 'Yétigrand'], [32], 8],
        [['tide', 'leaf'], ['Lotusette', 'Lotusiane'], [26], 4],
        [['stone', 'gust'], ['Falaisin', 'Falaisaigle'], [30], 7],
        // sans évolution
        [['normal'], ['Tambourin'], [], 2],
        [['leaf'], ['Faucheron'], [], 5],
        [['tide', 'stone'], ['Coralys'], [], 6],
        [['volt'], ['Volterrier'], [], 6],
        [['stone', 'frost'], ['Cristallis'], [], 8],
        [['spirit', 'leaf'], ['Fantômousse'], [], 7],
        [['flame', 'gust'], ['Braséole'], [], 8],
        [['gust'], ['Plumargent'], [], 8],
        [['venom', 'gust'], ['Venimouche'], [], 9],
        [['spirit', 'normal'], ['Kaléidon'], [], 9],
        // légendaires
        [['leaf', 'stone'], ['Ronceroi'], [], 10],
        [['volt', 'gust'], ['Fulgarion'], [], 10],
        [['tide', 'spirit'], ['Abyssaure'], [], 10],
        [['flame', 'stone'], ['Pyroclaste'], [], 10],
        [['frost', 'spirit'], ['Aurorine'], [], 10],
    ];
}
