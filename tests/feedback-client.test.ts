import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTBOX_LIMIT,
  PROMPT_RULES,
  decidePrompt,
  readOutbox,
  writeOutbox,
  type KeyValue,
} from '../lib/feedback/client.ts';
import { DEFAULT_FORMS, validSubject } from '../lib/feedback/forms.ts';

const memory = (): KeyValue => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

void test('a prompt decision is sampled once per occasion and remembered', () => {
  const store = memory();
  assert.equal(decidePrompt('puzzle', 'a', store, 0, () => 0.9), false);
  // Same occasion: same answer even if the dice would now say yes.
  assert.equal(decidePrompt('puzzle', 'a', store, 1, () => 0), false);
  const t = PROMPT_RULES.puzzle.cooldownMs * 2;
  assert.equal(decidePrompt('puzzle', 'b', store, t, () => 0), true);
  assert.equal(decidePrompt('puzzle', 'b', store, t + 5, () => 0.9), true);
});

void test('a cooldown stops back-to-back prompts in the same context only', () => {
  const store = memory();
  const t = 10 * PROMPT_RULES.script.cooldownMs;
  assert.equal(decidePrompt('script', 'g1', store, t, () => 0), true);
  assert.equal(decidePrompt('script', 'g2', store, t + 1000, () => 0), false);
  assert.equal(decidePrompt('puzzle', 'p1', store, t + 1000, () => 0), true);
  assert.equal(
    decidePrompt(
      'script',
      'g3',
      store,
      t + PROMPT_RULES.script.cooldownMs,
      () => 0,
    ),
    true,
  );
});

void test('corrupt prompt storage starts over instead of throwing', () => {
  const store = memory();
  store.set('fv.feedback.prompts', '{oops');
  assert.equal(decidePrompt('storyteller', 'x', store, 1e12, () => 0), true);
});

void test('the outbox keeps only the newest submissions', () => {
  const store = memory();
  const items = Array.from({ length: OUTBOX_LIMIT + 3 }, (_, i) => ({
    form: 'general:1',
    answers: { comment: String(i) },
    queued: i,
  }));
  writeOutbox(store, items);
  const kept = readOutbox(store);
  assert.equal(kept.length, OUTBOX_LIMIT);
  assert.equal(kept[0].queued, 3);
});

void test('the Storyteller form rates a script', () => {
  const form = DEFAULT_FORMS.find((f) => f.context === 'storyteller')!;
  assert.equal(validSubject(form, 'horrors'), 'horrors');
  assert.throws(() => validSubject(form, 'board'));
});
