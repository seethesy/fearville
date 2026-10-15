// FEAR-173: wiki-style editing of official text by the admin account and
// trusted editors. Edits are drafts (never served to players) until the
// editor publishes that one field. Every change is in the admin audit log.
import { database } from '@/db';
import { accountAuth, accountToken } from '@/lib/accounts/service';
import { hash, limited } from '@/lib/game/store';
import { assertSQL } from '@/lib/admin/lobbies';
import {
  type Admin,
  auditStatement,
  commit,
  publicError,
} from '@/lib/admin/service/audit';
import {
  UI_TEXT,
  textDefault,
  textFormat,
  textGroup,
  validateText,
} from './registry.ts';

export type Editor = Admin & { admin: boolean };
const SUMMARY_MAX = 200;

/** The signed-in admin or trusted editor, or null for everyone else. */
export async function textEditor(r: Request): Promise<Editor | null> {
  const account = await accountAuth(r, true);
  if (!account) return null;
  const admin = account.role === 'admin';
  if (!admin) {
    const row = await database()
      .prepare('SELECT 1 AS ok FROM text_editors WHERE account=?')
      .bind(account.id)
      .first<{ ok: number }>();
    if (!row) return null;
  }
  await limited(r, 'text:' + account.id, 120);
  return {
    ...account,
    admin,
    sessionHash: await hash(accountToken(r)),
  } as Editor;
}

export async function requireTextEditor(r: Request) {
  const editor = await textEditor(r);
  if (!editor) throw Error('FORBIDDEN');
  return editor;
}

function summaryOf(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw Error('Write the edit summary as text.');
  const s = value.trim().replace(/\s+/g, ' ');
  if (s.length > SUMMARY_MAX)
    throw Error(`Keep the edit summary under ${SUMMARY_MAX} characters.`);
  return s || null;
}

async function latest(key: string) {
  return database()
    .prepare(
      'SELECT id,value FROM ui_text_versions WHERE key=? ORDER BY id DESC LIMIT 1',
    )
    .bind(key)
    .first<{ id: number; value: string }>();
}

async function audited<T>(
  editor: Editor,
  action: string,
  key: string,
  body: unknown,
  run: () => Promise<T>,
) {
  try {
    return await run();
  } catch (e) {
    await auditStatement(editor.id, action, key, body, 'error', undefined, {
      error: publicError(e),
    }).run();
    throw e;
  }
}

const rawKey = (body: Record<string, unknown>) =>
  typeof body.key === 'string' ? body.key.slice(0, 200) : '';
const keyOf = (body: Record<string, unknown>) => {
  const key = typeof body.key === 'string' ? body.key : '';
  textDefault(key);
  return key;
};

/** Save (or replace) the draft for one key. Players never see drafts. */
export function saveDraft(editor: Editor, body: Record<string, unknown>) {
  return audited(editor, 'text draft', rawKey(body), body, async () => {
    const key = keyOf(body);
    const value = validateText(key, body.value);
    const summary = summaryOf(body.summary);
    const base = (await latest(key))?.id ?? 0;
    return commit(
      editor,
      'text draft',
      { key, summary },
      {
        target: key,
        after: { value, summary },
        output: { key, value, summary, base },
        statements: [
          database()
            .prepare(
              'INSERT INTO ui_text_drafts(key,value,summary,base,editor,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,summary=excluded.summary,base=excluded.base,editor=excluded.editor,updated=excluded.updated',
            )
            .bind(key, value, summary, base, editor.id, Date.now()),
        ],
      },
    );
  });
}

export function discardDraft(editor: Editor, body: Record<string, unknown>) {
  return audited(
    editor,
    'text discard',
    rawKey(body),
    body,
    async () => {
      const key = keyOf(body);
      return commit(
        editor,
        'text discard',
        { key },
        {
          target: key,
          output: { key },
          statements: [
            database().prepare('DELETE FROM ui_text_drafts WHERE key=?').bind(key),
          ],
        },
      );
    },
  );
}

/**
 * Publish one field's draft as a new immutable version. `version` is the
 * published version the editor last saw, so concurrent edits are caught.
 */
export function publishDraft(editor: Editor, body: Record<string, unknown>) {
  return audited(
    editor,
    'text publish',
    rawKey(body),
    body,
    async () => {
      const key = keyOf(body);
      const draft = await database()
        .prepare('SELECT value,summary,base FROM ui_text_drafts WHERE key=?')
        .bind(key)
        .first<{ value: string; summary: string | null; base: number }>();
      if (!draft) throw Error('There is no draft to publish.');
      const value = validateText(key, draft.value);
      const before = await latest(key);
      const expected = Number(body.version ?? draft.base);
      if ((before?.id ?? 0) !== expected)
        throw Error('Someone published this text since you started. Review the latest version first.');
      return commit(
        editor,
        'text publish',
        { key, summary: draft.summary },
        {
          target: key,
          before: before?.value ?? textDefault(key),
          after: value,
          output: { key, value },
          statements: [
            assertSQL(
              'COALESCE((SELECT MAX(id) FROM ui_text_versions WHERE key=?),0)=?',
              key,
              expected,
            ),
            assertSQL(
              'EXISTS (SELECT 1 FROM ui_text_drafts WHERE key=? AND value=?)',
              key,
              draft.value,
            ),
            database()
              .prepare(
                'INSERT INTO ui_text_versions(key,value,at,admin,summary) VALUES (?,?,?,?,?)',
              )
              .bind(key, value, Date.now(), editor.id, draft.summary),
            database().prepare('DELETE FROM ui_text_drafts WHERE key=?').bind(key),
          ],
        },
      );
    },
  );
}

/**
 * Publish an earlier version (or the bundled default, `to: 0`) as a new
 * version. Reverts are immediate: the editor chose an already-reviewed text.
 */
export function revertText(editor: Editor, body: Record<string, unknown>) {
  return audited(
    editor,
    'text revert',
    rawKey(body),
    body,
    async () => {
      const key = keyOf(body);
      const to = Number(body.to);
      if (!Number.isSafeInteger(to) || to < 0) throw Error('Choose a version.');
      let value = textDefault(key);
      if (to > 0) {
        const row = await database()
          .prepare('SELECT value FROM ui_text_versions WHERE id=? AND key=?')
          .bind(to, key)
          .first<{ value: string }>();
        if (!row) throw Error('Unknown version for this text.');
        value = row.value;
      }
      value = validateText(key, value);
      const before = await latest(key);
      const summary =
        summaryOf(body.summary) ??
        (to ? `Reverted to version ${to}` : 'Reset to default');
      return commit(
        editor,
        'text revert',
        { key, to, summary },
        {
          target: key,
          before: before?.value ?? textDefault(key),
          after: value,
          output: { key, value },
          statements: [
            assertSQL(
              'COALESCE((SELECT MAX(id) FROM ui_text_versions WHERE key=?),0)=?',
              key,
              before?.id ?? 0,
            ),
            database()
              .prepare(
                'INSERT INTO ui_text_versions(key,value,at,admin,summary) VALUES (?,?,?,?,?)',
              )
              .bind(key, value, Date.now(), editor.id, summary),
          ],
        },
      );
    },
  );
}

export type HistoryEntry = {
  id: number;
  value: string;
  at: number;
  editor: string;
  summary: string | null;
};

/** Published versions of one key, newest first, with who made them. */
export async function history(key: string): Promise<HistoryEntry[]> {
  textDefault(key);
  return (
    await database()
      .prepare(
        "SELECT v.id,v.value,v.at,COALESCE(a.handle,a.name,'(deleted account)') AS editor,v.summary FROM ui_text_versions v LEFT JOIN accounts a ON a.id=v.admin WHERE v.key=? ORDER BY v.id DESC LIMIT 200",
      )
      .bind(key)
      .all<HistoryEntry>()
  ).results;
}

/** Every unpublished draft, for editors browsing in edit mode. */
export async function drafts() {
  const rows = (
    await database()
      .prepare(
        "SELECT d.key,d.value,d.summary,d.base,d.updated,COALESCE(a.handle,a.name,'(deleted account)') AS editor FROM ui_text_drafts d LEFT JOIN accounts a ON a.id=d.editor",
      )
      .all<{
        key: string;
        value: string;
        summary: string | null;
        base: number;
        updated: number;
        editor: string;
      }>()
  ).results;
  return Object.fromEntries(
    rows.filter((r) => Object.hasOwn(UI_TEXT, r.key)).map((r) => [r.key, r]),
  );
}

/** The editable catalog: key, group and format (for search in the editor). */
export function catalog() {
  return Object.entries(UI_TEXT).map(([key, value]) => ({
    key,
    group: textGroup(key),
    format: textFormat(key),
    value,
  }));
}
