import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLOSSARY, glossarySegments } from '../lib/game/glossary.ts';

void test('glossary defines the six key terms', () => {
  assert.deepEqual(
    GLOSSARY.map((t) => t.term),
    ['Fear', 'Visit', 'Save', 'Learn', 'Declare', 'Neighbor'],
  );
});

void test('the iPhone glossary matches the web glossary', () => {
  const swift = readFileSync(
    new URL('../ios/ClocktowerTable/ClocktowerTableApp.swift', import.meta.url),
    'utf8',
  );
  for (const t of GLOSSARY) {
    assert.ok(
      swift.includes(
        `GlossaryEntry(term: ${JSON.stringify(t.term)}, definition: ${JSON.stringify(t.definition)}, example: ${t.example ? JSON.stringify(t.example) : 'nil'})`,
      ),
      `${t.term} is out of date in ClocktowerTableApp.swift`,
    );
  }
});

void test('glossary words in role text link to their entry', () => {
  const parts = glossarySegments('Every night, visit a player to save them.');
  assert.deepEqual(parts, [
    'Every night, ',
    { text: 'visit', id: 'visit' },
    ' a player to ',
    { text: 'save', id: 'save' },
    ' them.',
  ]);
  assert.deepEqual(glossarySegments('Feared neighbors'), [
    { text: 'Feared', id: 'fear' },
    ' ',
    { text: 'neighbors', id: 'neighbor' },
  ]);
});
