import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isObjectionable,
  isObjectionableHandle,
} from '../lib/social/moderation.ts';

void test('offensive handles are rejected, including leetspeak and underscores', () => {
  for (const handle of ['fuck_you', 'sh1thead', 'f_u_c_k', 'b1tch'])
    assert.equal(isObjectionableHandle(handle), true, handle);
});

void test('ordinary handles pass, including Scunthorpe-style names', () => {
  for (const handle of [
    'bass_player',
    'assassin',
    'scunthorpe',
    'dickens_fan',
    'grape',
    'night_owl_42',
    'cocktail_hour',
  ])
    assert.equal(isObjectionableHandle(handle), false, handle);
});

void test('rating comments are filtered for abuse but allow normal feedback', () => {
  assert.equal(isObjectionable('Great storyteller, kept the pace up!'), false);
  assert.equal(isObjectionable('Worst night ever, you piece of shit'), true);
});
