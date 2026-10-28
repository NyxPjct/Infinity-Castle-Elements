'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const drawn = [];
class Canvas {
  fillText(text) { drawn.push(text); }
  strokeText(text) { drawn.push(text); }
  measureText(text) { return { width: text.length }; }
}
const sandbox = { CanvasRenderingContext2D: Canvas };
vm.createContext(sandbox);
for (const file of ['translations.js', 'i18n.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'public', file), 'utf8'), sandbox, { filename: file });
}
const i18n = sandbox.ICEI18N, catalogs = sandbox.ICE_TRANSLATIONS;
const expected = ['pt-BR','en-US','es-ES','fr-FR','de-DE','it-IT','nl-NL','pl-PL','ru-RU','tr-TR','ja-JP','ko-KR','zh-CN','zh-TW','ar-SA','hi-IN','sv-SE','da-DK','fi-FI','cs-CZ'];
assert.deepEqual(Array.from(i18n.locales).sort(), expected.sort());
const keys = Object.keys(catalogs['pt-BR']).sort();
const placeholders = value => (value.match(/\{\d+\}/g) || []).sort();
for (const code of expected) {
  const catalog = catalogs[code];
  assert.deepEqual(Object.keys(catalog).sort(), keys, `${code}: complete catalog`);
  for (const source of keys) {
    assert.ok(typeof catalog[source] === 'string' && catalog[source].trim(), `${code}: ${source}`);
    assert.deepEqual(placeholders(catalog[source]), placeholders(source), `${code}: placeholders in ${source}`);
  }
  i18n.setLanguage(code);
  assert.equal(i18n.translate('Configurações'), catalog['Configurações']);
  for(const label of ['Campanha','Maestria e memórias','Novo Jogo+','ROTA ELEMENTAL','Aprendiz','Guardião elemental'])assert.equal(i18n.translate(label),catalog[label]);
  assert.equal(i18n.translate('Maestria +24 XP'),catalog['Maestria +{0} XP'].replace('{0}','24'));
  assert.equal(i18n.translate('Concluir em até 90s ✓'),catalog['Concluir em até']+' 90s ✓');
  for(const label of ['Diagnóstico da conexão','Qualidade gráfica','Ranking online','PLATAFORMA ELEMENTAL','VÉU PROTETOR'])assert.equal(i18n.translate(label),catalog[label]);
  assert.equal(i18n.translate('Qualidade atual: Alta'),catalog['Qualidade atual: {0}'].replace('{0}',catalog['Alta']));
  assert.equal(i18n.translate('FASE DO CHEFE 3/3 · RITUAL ELEMENTAL'),catalog['FASE DO CHEFE {0}/3 · {1}'].replace('{0}','3').replace('{1}',i18n.translate('RITUAL ELEMENTAL')));
  assert.equal(i18n.translate('Sala não encontrada.'), catalog['Sala não encontrada.']);
  assert.equal(i18n.translate('RECARGA 2.5s'), catalog['RECARGA {0}s'].replace('{0}', '2.5'));
  assert.equal(i18n.translate('🪽 PASSO DO VENDAVAL'), '🪽 ' + catalog['Passo do Vendaval'].toLocaleUpperCase(code));
  assert.equal(i18n.translate('ABC123'), 'ABC123');
  assert.equal(i18n.translate('0.0.7'), '0.0.7');
}
i18n.setLanguage('en-US');
assert.equal(i18n.translate('Mapa da campanha'),'Campaign map');
assert.equal(i18n.translate('Posição no ranking: 12'),'Leaderboard position: 12');
assert.equal(i18n.translate('● Servidor em atualização'),'● Server updating');
assert.equal(i18n.translate('● Multiplayer incompatível'),'● Multiplayer incompatible');
assert.equal(i18n.translate('2.50s · 3 mortes'),'2.50s · 3 deaths');
for(const [code,expectedMute] of Object.entries({'es-ES':'Silenciar','fr-FR':'Couper le son','de-DE':'Stummschalten','ja-JP':'ミュート','ko-KR':'음소거','zh-CN':'静音','zh-TW':'靜音'}))assert.equal(catalogs[code]['Silenciar'],expectedMute,code+': audio mute must not be mistranslated');
assert.equal(i18n.translate(' 🪨 Terra '), ' 🪨 Earth ');
assert.equal(i18n.translate('Armadura'), 'Armadura'); // no replacement inside words
assert.equal(i18n.hasTranslation('Sala não encontrada.'), true);
assert.equal(i18n.hasTranslation('GitHub respondeu HTTP 404'), true);
assert.equal(i18n.hasTranslation('Failed to fetch'), false);
assert.equal(i18n.translate('O grupo despertou 3/4 selos.'), 'The group has awakened 3/4 seals.');
assert.equal(i18n.translate('Mortes: 7 · Segredos: 2 · Guardiões: 1 · Melhor rank: CASTELO TE ODEIA'), 'Deaths: 7 · Secrets: 2 · Guardians: 1 · Best rank: THE CASTLE HATES YOU');
const ctx = new Canvas();
ctx.fillText('PÁTIO DAS BANDEIRAS'); ctx.strokeText('RITUAL ELEMENTAL');
assert.deepEqual(drawn, ['FLAG COURTYARD', 'ELEMENTAL RITUAL']);
assert.equal(ctx.measureText('Terra').width, 'Earth'.length);

// DOM source retention must survive multiple language changes and later updates.
function element(ignore = false) {
  const attrs = { title: 'Loja Arcana' };
  return { nodeType: 1, closest: () => ignore ? {} : null, hasAttribute: name => name in attrs,
    getAttribute: name => attrs[name], setAttribute: (name,value) => { attrs[name] = value; } };
}
const parent = element(), text = { nodeType: 3, data: 'Moedas insuficientes.', parentElement: parent };
const nameParent = element(true), name = { nodeType: 3, data: 'Terra', parentElement: nameParent };
const nodes = [parent, text, name];
sandbox.document = { body: parent, documentElement: {}, createTreeWalker() {
  let index = 0; return { currentNode: parent, nextNode() { this.currentNode = nodes[index++]; return !!this.currentNode; } };
} };
for (const code of ['en-US','fr-FR','ar-SA','pt-BR','en-US']) {
  i18n.setLanguage(code);
  assert.equal(text.data, catalogs[code]['Moedas insuficientes.']);
  assert.equal(parent.getAttribute('title'), catalogs[code]['Loja Arcana']);
  assert.equal(name.data, 'Terra', 'player names remain unchanged');
  assert.equal(sandbox.document.documentElement.dir, code === 'ar-SA' ? 'rtl' : 'ltr');
}
text.data = 'Sala não encontrada.'; i18n.apply(text);
assert.equal(text.data, 'Room not found.');
i18n.setLanguage('pt-BR'); assert.equal(text.data, 'Sala não encontrada.');
assert.equal(i18n.setLanguage('invalid-locale'), 'pt-BR');
console.log(`PASS: ${expected.length} languages, ${keys.length} messages each, placeholders, dynamic text, canvas, RTL, and reversible DOM translation.`);
