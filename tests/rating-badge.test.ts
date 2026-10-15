// FEAR-133: rating badge bands and swappable art files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  BADGE_BANDS,
  badgeLabel,
  badgeSrc,
  ratingBand,
} from '../lib/social/rating-badge.ts';

void test('band boundaries', () => {
  for (const [rating, band] of [
    [500, 1000],
    [999, 1000],
    [1000, 1000],
    [1999, 1000],
    [2000, 2000],
    [7450, 7000],
    [9999, 9000],
    [10000, 10000],
    [14000, 10000],
    [Number.NaN, 1000],
  ])
    assert.equal(ratingBand(rating), band, String(rating));
  assert.equal(badgeLabel(7000), 'Rating badge, 7,000');
  assert.equal(badgeSrc(1000), '/badges/rating-01000.svg');
  assert.equal(badgeSrc(10000), '/badges/rating-10000.svg');
});

void test('every band has an art file, so final art is a file swap', () => {
  assert.equal(BADGE_BANDS.length, 10);
  for (const band of BADGE_BANDS) {
    const file = 'public' + badgeSrc(band);
    assert.ok(existsSync(file), file);
    assert.match(readFileSync(file, 'utf8'), /<svg[\s>]/);
  }
});
