import assert from 'node:assert/strict';

// Live players now explicitly choose their seats before a test deals roles.
export async function claimSeats(base, tokens) {
  for (const [index, token] of tokens.entries()) {
    const r = await fetch(base + '/api/game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'claimSeat', seat: index + 1 }),
    });
    assert.equal(r.status, 200, await r.text());
  }
}
