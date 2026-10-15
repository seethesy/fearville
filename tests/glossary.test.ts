import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, glossarySegments } from '../lib/game/glossary.ts';

void test('glossary defines the six key terms', () => {
  assert.deepEqual(
    GLOSSARY.map((t) => t.term),
    ['Fear', 'Visit', 'Save', 'Learn', 'Declare', 'Neighbor'],
  );
});

void test('only the first form of each term links, case insensitively', () => {
  assert.deepEqual(
    glossarySegments(
      'FEARED players fear Fear; visits visit visiting. Neighbors neighbor.',
    ),
    [
      { text: 'FEARED', id: 'fear' },
      ' players fear Fear; ',
      { text: 'visits', id: 'visit' },
      ' visit visiting. ',
      { text: 'Neighbors', id: 'neighbor' },
      ' neighbor.',
    ],
  );
});
void test('whole words, overlapping forms, unknown inflections and empty text are handled', () => {
  assert.deepEqual(
    glossarySegments('fearful revisit savedata learned neighborhood'),
    ['fearful revisit savedata learned neighborhood'],
  );
  assert.deepEqual(glossarySegments('éfear fear_1 SAVE saved'), [
    'éfear fear_1 ',
    { text: 'SAVE', id: 'save' },
    ' saved',
  ]);
  assert.deepEqual(glossarySegments('An ordinary character.'), [
    'An ordinary character.',
  ]);
  assert.deepEqual(glossarySegments(''), []);
  assert.deepEqual(glossarySegments('Declare a declaration.', 'declare'), [
    'Declare a declaration.',
  ]);
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
