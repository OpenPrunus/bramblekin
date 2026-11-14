<?php

declare(strict_types=1);

namespace Bramble\Player;

use Arcade\Support\AtomicFile;

/** Dépôt des sauvegardes : un fichier JSON par joueur, nommé d'après le hash de son jeton (jamais le jeton lui-même). */
final readonly class ProfileStore
{
    public function __construct(private string $dir)
    {
    }

    private function file(string $id): string
    {
        return $this->dir . '/' . substr($id, 0, 48) . '.json';
    }

    public function load(string $id, int $now): ?Profile
    {
        if (preg_match('/^[a-f0-9]{48,64}$/', $id) !== 1) {
            return null;
        }
        $data = AtomicFile::readJson($this->file($id));

        return is_array($data) ? Profile::fromArray($id, $data, $now) : null;
    }

    public function save(Profile $profile): bool
    {
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0775, true);
        }

        return AtomicFile::write($this->file($profile->id), json_encode($profile->toArray(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    public function dir(): string
    {
        return $this->dir;
    }
}
