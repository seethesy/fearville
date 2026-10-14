import { database } from '@/db';
import { saveD1 } from '../store';
import { inheritStored } from '../part-store';
import { type ActionAck } from '../socket-protocol';
import { syncResult, syncMvp, voidResult } from '../../social/results';
import { type TableMeta } from '../object-storage';
import type { Actor, Game } from '../types';
import { type TableContext, TABLE_RETENTION } from './context.ts';
export async function flushProjectionMethod(this: TableContext): Promise<void> {
  const projection = this.meta?.projection;
  if (!projection) return;
  const indexed = await database()
    .prepare('SELECT write_id FROM sessions WHERE code=?')
    .bind(this.meta!.code)
    .first<{ write_id: string | null }>();
  // The D1 transaction may have committed immediately before an eviction.
  // Its durable operation id makes replay (including revocation) idempotent.
  try {
    if (
      indexed?.write_id !== projection.id &&
      !(await saveD1(
        this.game!,
        projection.version,
        projection.syncRanked,
        projection.credentialHash,
        projection.communication,
        (guard, bindings) =>
          projection.removed
            ? ['members', 'account_seats'].map((name) =>
                database()
                  .prepare(
                    `DELETE FROM ${name} WHERE code=? AND player=? AND ${guard}`,
                  )
                  .bind(this.meta!.code, projection.removed!, ...bindings),
              )
            : [],
        projection.id,
      ))
    ) {
      // A concurrent admin revocation wins. Never publish a rejected write.
      await this.importD1(this.meta!.code, true);
      throw Error(
        'The table was updated by administration. Refresh before continuing.',
      );
    }
  } catch (error) {
    // A competing table may acquire a ranked account after eligibility was
    // checked. This is a rejected start, not a transient projection outage:
    // discard its durable intent so it cannot start later on a retry.
    if (
      error instanceof Error &&
      error.message.includes('already playing another ranked game')
    )
      await this.importD1(this.meta!.code, true);
    throw error;
  }
  delete this.meta!.projection;
  this.parts.save(this.game!, this.meta!);
  for (const entry of this.game!.history) entry.before = '';
  // On D1 outage the projection intent remains durable for alarm/request retry.
}
export async function flushEffectsMethod(this: TableContext): Promise<void> {
  const effects = this.meta?.effects;
  if (!effects) return;
  const g = this.game!,
    version = this.meta!.version;
  if (
    effects.before === 'ended' &&
    g.phase !== 'ended' &&
    effects.action !== 'returnLobby'
  )
    await voidResult(g.code, effects.started, version);
  else if (
    effects.action !== 'returnLobby' &&
    (g.phase === 'ended' || effects.before === 'ended')
  )
    await syncResult(
      g,
      g.gameStartedAt ?? this.meta!.created,
      effects.now,
      version,
      true,
    );
  if (effects.action === 'mvpVote' || effects.action === 'returnLobby')
    await syncMvp(g, version);
  delete this.meta!.effects;
  this.parts.save(g, this.meta!);
}
export async function commitMethod(
  this: TableContext,
  next: Game,
  actor: Actor | undefined,
  action: string,
  now: number,
  removed?: string,
  cause?: string,
  receipt?: { seat: string; ack: ActionAck },
): Promise<void> {
  const before = this.game!,
    oldMeta = this.meta!;
  if (actor) await this.authenticate(actor, next.code, action === 'chat');
  inheritStored(before, next);
  const meta: TableMeta = {
    ...oldMeta,
    version: oldMeta.version + 1,
    retainAt: now + TABLE_RETENTION,
    projection: {
      id: crypto.randomUUID(),
      version: oldMeta.version,
      credentialHash: actor?.credentialHash,
      communication: action === 'chat',
      removed,
      syncRanked:
        JSON.stringify([
          before.ranked,
          before.progression,
          before.gameStartedAt,
          before.phase === 'lobby',
          before.phase === 'ended',
        ]) !==
        JSON.stringify([
          next.ranked,
          next.progression,
          next.gameStartedAt,
          next.phase === 'lobby',
          next.phase === 'ended',
        ]),
    },
    effects: {
      before: before.phase,
      started: before.gameStartedAt ?? oldMeta.created,
      action,
      now,
    },
  };
  if (receipt)
    meta.receipts = {
      ...oldMeta.receipts,
      [receipt.seat]: [
        ...(oldMeta.receipts?.[receipt.seat] ?? []),
        receipt.ack,
      ].slice(-100),
    };
  this.parts.save(next, meta);
  const committedAt = Date.now();
  if (receipt) receipt.ack.committedAt = committedAt;
  this.game = next;
  this.meta = meta;
  await this.schedule();
  await this.flushProjection();
  await this.flushEffects();
  await this.schedule();
  this.publish(cause, committedAt);
}
