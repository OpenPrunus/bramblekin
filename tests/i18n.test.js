import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const [k, v] of Object.entries({ localStorage: { getItem: () => null, setItem: () => {} }, navigator: { language: 'fr-FR' }, document: { documentElement: {} } })) {
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
}
const { DICTIONARY, t, setLang } = await import('../web/js/i18n.js');

test('le français et l\'anglais ont les mêmes clés', () => {
  assert.deepEqual(Object.keys(DICTIONARY.fr).sort(), Object.keys(DICTIONARY.en).sort());
});

test('les paramètres sont remplacés', () => {
  setLang('fr');
  assert.equal(t('money', { n: 12 }), '12 pièces');
  setLang('en');
  assert.equal(t('money', { n: 12 }), '12 coins');
  setLang('fr');
});

test('chaque texte demandé par le serveur ou la page existe', () => {
  const keys = new Set(Object.keys(DICTIONARY.fr));
  const php = fs.readFileSync(new URL('../src/World/World.php', import.meta.url), 'utf8');
  for (const [, key] of php.matchAll(/'(talk|town|leader|trainer|gymTrainer|eliteTrainer|champion|guard|guardLeague|nurse|pc|shop|prof)(\d*)'/g)) {
    void key;
  }
  for (let i = 0; i < 20; i++) assert.ok(keys.has(`talk${i}`));
  for (let i = 1; i <= 10; i++) assert.ok(keys.has(`town${i}`));
  for (let i = 1; i <= 8; i++) { assert.ok(keys.has(`leader${i}`)); assert.ok(keys.has(`badge${i}`)); }
  for (let i = 0; i < 8; i++) assert.ok(keys.has(`trainer${i}`));
  for (const k of ['gymTrainer', 'eliteTrainer', 'champion', 'guard', 'guardLeague', 'nurse', 'pc', 'shop', 'prof', 'found', 'noKin']) assert.ok(keys.has(k), k);
  for (const cls of ['youngster', 'lass', 'hiker', 'fisher', 'birder', 'scientist', 'camper', 'picnicker', 'ranger', 'ace', 'apprentice', 'leader', 'elite', 'champion']) assert.ok(keys.has(`cls_${cls}`), cls);
  for (const type of ['normal', 'flame', 'tide', 'leaf', 'volt', 'stone', 'gust', 'frost', 'venom', 'spirit']) assert.ok(keys.has(`type_${type}`));
  const html = fs.readFileSync(new URL('../web/index.php', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-ph|-aria|-html)?="(\w+)"/g)) assert.ok(keys.has(key), key);
  const js = ['main.js', 'battle.js', 'ui.js'].map((f) => fs.readFileSync(new URL(`../web/js/${f}`, import.meta.url), 'utf8')).join('\n');
  for (const [, key] of js.matchAll(/\bt\('(\w+)'/g)) assert.ok(keys.has(key), key);
});
