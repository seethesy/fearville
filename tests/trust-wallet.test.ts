import test from 'node:test';
import assert from 'node:assert/strict';
import { trustDB } from './trust-db.ts';
import { credit,debit,mutateWallet,readBalance,checkIntegrity } from '../lib/trust/wallet.ts';
const award={amount:20,origin:'earned' as const,source:'game',reason:'finish',key:'finish'};
void test('retry, conflicting key and fifty concurrent debits preserve the ledger',async()=>{
  const {db}=trustDB();
  const first=await credit(db,'a',award);
  assert.deepEqual(await credit(db,'a',award),first);
  await assert.rejects(credit(db,'a',{...award,amount:30}),/idempotency_conflict/);
  const results=await Promise.allSettled(Array.from({length:50},(_,i)=>debit(db,'a',{...award,amount:-3,key:'spend'+i})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,6);
  assert.equal(await readBalance(db,'a'),2);
  assert.deepEqual(await checkIntegrity(db),[]);
});
void test('guests, immutable history, direct edits, reversals and deletion',async()=>{
  const {db,sqlite}=trustDB();
  await assert.rejects(credit(db,null,award),/not_signed_in/);
  await credit(db,'a',award);
  assert.throws(()=>sqlite.exec('UPDATE wallets SET balance=200'),/ledger_required/);
  assert.throws(()=>sqlite.exec('DELETE FROM trust_ledger'),/immutable_ledger/);
  assert.throws(()=>sqlite.exec('UPDATE trust_ledger SET amount=3'),/immutable_ledger/);
  await mutateWallet(db,'a',{...award,amount:-30,kind:'reversal',key:'rewind'});
  await assert.rejects(debit(db,'a',{...award,amount:-1,key:'blocked'}),/insufficient_trust/);
  sqlite.exec("DELETE FROM accounts WHERE id='a'");
  assert.equal(sqlite.prepare('SELECT account FROM wallets').get()?.account,null);
  assert.deepEqual(await checkIntegrity(db),[]);
});
