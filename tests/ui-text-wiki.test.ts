import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UI_TEXT,
  glossaryId,
  textFormat,
  textGroup,
  validateText,
} from '../lib/ui-text/registry.ts';
import { parseMarkdown } from '../lib/ui-text/markdown.ts';
import { diffWords } from '../lib/ui-text/diff.ts';
import { ALL_ROLES } from '../lib/game/types/roles.ts';
import { GLOSSARY } from '../lib/game/glossary.ts';
import { TUTORIALS } from '../lib/tutorials/content.ts';
import { ROLE_TIPS } from '../lib/game/role-tips.ts';

void test('catalog content is registered as editable keys with defaults', () => {
  assert.equal(new Set(ALL_ROLES.map((r) => r.id)).size, ALL_ROLES.length);
  for (const r of ALL_ROLES) {
    assert.equal(UI_TEXT[`role.${r.id}.name`], r.name);
    assert.equal(UI_TEXT[`role.${r.id}.ability`], r.description);
  }
  for (const g of GLOSSARY) {
    assert.equal(UI_TEXT[`glossary.${g.id}.definition`], g.definition);
    assert.equal(glossaryId(g.term), g.id);
  }
  for (const t of TUTORIALS) {
    assert.equal(UI_TEXT[`tutorial.${t.id}.summary`], t.summary);
    t.steps.forEach((s, i) =>
      assert.equal(UI_TEXT[`tutorial.${t.id}.${i}.body`], s.body),
    );
  }
  for (const [script, roles] of Object.entries(ROLE_TIPS))
    for (const [role, tips] of Object.entries(roles))
      tips.forEach((tip, i) =>
        assert.equal(UI_TEXT[`tips.${script}.${role}.${i}`], tip),
      );
  // Every bundled default passes its own validation.
  for (const [key, value] of Object.entries(UI_TEXT))
    assert.equal(validateText(key, value), value, key);
});

void test('long content is markdown; names and labels stay plain', () => {
  assert.equal(textFormat('tutorial.guide.board.0.body'), 'markdown');
  assert.equal(textFormat('glossary.fear.definition'), 'markdown');
  assert.equal(textFormat('glossary.fear.term'), 'plain');
  assert.equal(textFormat('role.monster.ability'), 'plain');
  assert.equal(textFormat('home.welcome'), 'plain');
  assert.equal(textGroup('role.monster.name'), 'Characters');
  assert.equal(textGroup('nav.play'), 'Interface');
});

void test('markdown edits refuse unsafe links and unknown glossary terms', () => {
  const key = 'glossary.fear.definition';
  assert.ok(validateText(key, 'See [rules](/rules) and [[Fear]].'));
  assert.ok(validateText(key, 'More at [docs](https://example.com).'));
  assert.throws(() => validateText(key, '[x](javascript:alert(1))'));
  assert.throws(() => validateText(key, '[x](//evil.example)'));
  assert.throws(() => validateText(key, 'A [[Nonsense term]].'));
  // Placeholders must survive edits.
  assert.throws(() => validateText('lobby.players', 'players'));
  assert.ok(validateText('lobby.players', '{count} souls'));
});

void test('markdown parses to safe blocks', () => {
  const ids = (t: string) => glossaryId(t);
  const blocks = parseMarkdown(
    'Hello **bold** *it* [[Fear]] [a](/x) [b](javascript:x)\nline\n\n- one\n- two',
    ids,
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].t, 'p');
  const p = blocks[0].t === 'p' ? blocks[0].c : [];
  assert.deepEqual(
    p.map((n) => n.t),
    ['text', 'b', 'text', 'i', 'text', 'term', 'text', 'link', 'text', 'text', 'br', 'text'],
  );
  // The unsafe link keeps only its words.
  assert.ok(p.some((n) => n.t === 'text' && n.v === 'b'));
  assert.deepEqual(blocks[1], {
    t: 'ul',
    items: [[{ t: 'text', v: 'one' }], [{ t: 'text', v: 'two' }]],
  });
});

void test('word diff marks additions and deletions', () => {
  const d = diffWords('The red carriage escapes.', 'The brown carriage escapes now.');
  assert.deepEqual(d, [
    { t: 'same', v: 'The ' },
    { t: 'del', v: 'red' },
    { t: 'add', v: 'brown' },
    { t: 'same', v: ' carriage ' },
    { t: 'del', v: 'escapes.' },
    { t: 'add', v: 'escapes now.' },
  ]);
  assert.deepEqual(diffWords('same', 'same'), [{ t: 'same', v: 'same' }]);
});
