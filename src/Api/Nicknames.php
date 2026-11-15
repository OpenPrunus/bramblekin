<?php

declare(strict_types=1);

namespace Bramble\Api;

use Arcade\Support\Nickname;

/**
 * Pseudos réservés : le premier joueur (identifiant public) qui prend un pseudo le garde ; insensible à la casse et aux
 * accents majuscules. Un joueur n'a qu'un pseudo (en prendre un autre libère l'ancien), et un pseudo inutilisé pendant
 * 90 jours redevient libre. Fichier JSON verrouillé pendant la mise à jour.
 */
final readonly class Nicknames
{
    final public const int EXPIRE = 90 * 86400;

    public function __construct(private string $file)
    {
    }

    /** Réserve ou confirme le pseudo pour cet identifiant ; faux s'il appartient à quelqu'un d'autre. */
    public function claim(string $name, string $id, int $now): bool
    {
        $key = Nickname::key($name);
        $fh = @fopen($this->file, 'c+');
        if ($fh === false) {
            return true;                                              // stockage indisponible : on ne bloque pas la discussion
        }
        flock($fh, LOCK_EX);
        $all = json_decode((string) stream_get_contents($fh), true);
        $all = is_array($all) ? $all : [];
        $owner = $all[$key] ?? null;
        $taken = is_array($owner) && ($owner['id'] ?? null) !== $id && is_int($owner['at'] ?? null) && $owner['at'] > $now - self::EXPIRE;
        if (!$taken) {
            foreach ($all as $k => $entry) {
                if (!is_array($entry) || ($entry['id'] ?? null) === $id || !is_int($entry['at'] ?? null) || $entry['at'] <= $now - self::EXPIRE) {
                    unset($all[$k]);                                  // l'ancien pseudo de ce joueur, et les pseudos expirés
                }
            }
            $all[$key] = ['id' => $id, 'at' => $now];
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($all, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
            fflush($fh);
        }
        flock($fh, LOCK_UN);
        fclose($fh);

        return !$taken;
    }
}
