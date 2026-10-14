import { database } from '@/db';
import { checkSeatAccount } from '@/lib/admin/access';
import { readD1 } from '../store';
import { inheritStored } from '../part-store';
import { requireThat, nextDeadline } from '../engine';
import { ObjectParts } from '../object-storage';
import type { Actor, Game } from '../types';
import { type TableContext, TABLE_RETENTION } from './context.ts';
export async function authenticateMethod(
  this: TableContext,
  actor: Actor,
  code: string,
  communication = false,
): Promise<void> {
  requireThat(actor.credentialHash, 'AUTH');
  const member = await database()
    .prepare(
      'SELECT player,host FROM members WHERE code=? AND token_hash=? AND expires>?',
    )
    .bind(code, actor.credentialHash, Date.now())
    .first<{ player: string; host: number }>();
  requireThat(
    member && member.player === actor.id && !!member.host === actor.host,
    'AUTH',
  );
  await checkSeatAccount(code, actor.id, communication);
  requireThat(
    actor.host ||
      this.game?.players.some((p) => p.id === actor.id && !p.departed),
    'AUTH',
  );
}
export async function importD1Method(
  this: TableContext,
  code: string,
  reset = false,
): Promise<void> {
  const loaded = await readD1(code);
  if (reset) this.parts.reset();
  this.game = loaded.game;
  this.meta = {
    code,
    version: loaded.version,
    created: loaded.created,
    retainAt: this.meta?.retainAt ?? Date.now() + TABLE_RETENTION,
    receipts:
      reset && this.meta?.projection
        ? Object.fromEntries(
            Object.entries(this.meta.receipts ?? {}).map(([seat, receipts]) => [
              seat,
              receipts.filter(
                (ack) => !ack.ok || ack.version !== this.meta!.version,
              ),
            ]),
          )
        : this.meta?.receipts,
  };
  // Compatibility admin/account transactions can redact snapshots in D1.
  // Import them on an external revision, so a rewind cannot restore PII.
  const snapshots = await database()
    .prepare('SELECT id,state FROM session_snapshots WHERE code=?')
    .bind(code)
    .all<{ id: string; state: string }>();
  const byID = new Map(snapshots.results.map((s) => [s.id, s.state]));
  for (const entry of this.game.history)
    entry.before ||= byID.get(entry.id) ?? '';
  this.parts.save(this.game, this.meta);
  for (const entry of this.game.history) entry.before = '';
  await this.schedule();
  this.publish();
}
export async function currentMethod(
  this: TableContext,
  code: string,
  actor?: Actor,
): Promise<Game> {
  if (!this.game) {
    const restored = this.parts.load();
    if (restored) {
      this.game = restored.game;
      this.meta = restored.meta;
      const projection = await readD1(code);
      inheritStored(projection.game, this.game);
    } else await this.importD1(code);
  }
  requireThat(this.meta?.code === code, 'Session not found.');
  if (this.meta!.projection) await this.flushProjection();
  // D1 remains the account/admin compatibility projection during migration.
  // Ordinary requests load only this small revision, never all the parts.
  const indexed = await database()
    .prepare('SELECT version FROM sessions WHERE code=?')
    .bind(code)
    .first<{ version: number }>();
  if (!indexed) {
    await this.destroy();
    throw Error('Session not found.');
  }
  if (indexed.version !== this.meta!.version) await this.importD1(code, true);
  if (actor) await this.authenticate(actor, code);
  await this.flushEffects();
  return this.game!;
}
export async function scheduleMethod(this: TableContext): Promise<void> {
  if (this.meta)
    await this.ctx.storage.setAlarm(
      Math.min(
        this.meta.retainAt,
        nextDeadline(this.game!, this.meta.timerThrough ?? 0) ??
          this.meta.retainAt,
        this.meta.projection || this.meta.effects
          ? Date.now() + 2000
          : this.meta.retainAt,
      ),
    );
}
export async function destroyMethod(this: TableContext): Promise<void> {
  for (const socket of this.ctx.getWebSockets())
    socket.close(1001, 'Table closed.');
  await this.ctx.storage.deleteAlarm();
  await this.ctx.storage.deleteAll();
  this.parts = new ObjectParts(this.ctx.storage);
  this.game = undefined;
  this.meta = undefined;
}
