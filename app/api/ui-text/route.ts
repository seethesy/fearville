// Official UI text.
//   GET  /api/ui-text                    → { overrides } (published only, public)
//   GET  /api/ui-text?view=me            → { editor, admin } (FEAR-173)
//   GET  /api/ui-text?view=drafts        → { drafts }   (editors)
//   GET  /api/ui-text?view=history&key=  → { history }  (editors)
//   GET  /api/ui-text?view=catalog       → { keys }     (editors)
//   POST /api/ui-text { action: draft|discard|publish|revert, key, … } (editors)
import { database } from '@/db';
import { UI_TEXT } from '@/lib/ui-text/registry';
import { checkOrigin, errorResponse, json } from '@/lib/game/store';
import {
  catalog,
  discardDraft,
  drafts,
  history,
  publishDraft,
  requireTextEditor,
  revertText,
  saveDraft,
  textEditor,
} from '@/lib/ui-text/wiki';
export async function GET(r: Request) {
  try {
    const params = new URL(r.url).searchParams;
    const view = params.get('view');
    if (view === 'me') {
      const editor = await textEditor(r).catch(() => null);
      return json({ editor: !!editor, admin: !!editor?.admin });
    }
    if (view) {
      await requireTextEditor(r);
      if (view === 'drafts') return json({ drafts: await drafts() });
      if (view === 'history')
        return json({ history: await history(params.get('key') ?? '') });
      if (view === 'catalog') return json({ keys: catalog() });
      throw Error('Unknown view.');
    }
    const rows = await database()
      .prepare(
        'SELECT key,value,id FROM ui_text_versions WHERE id IN (SELECT MAX(id) FROM ui_text_versions GROUP BY key)',
      )
      .all<{ key: string; value: string; id: number }>();
    return json({
      overrides: Object.fromEntries(
        rows.results
          .filter((r) => Object.hasOwn(UI_TEXT, r.key))
          .map((r) => [r.key, { value: r.value, version: r.id }]),
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const editor = await requireTextEditor(r);
    const raw = await r.text();
    if (raw.length > 12000) throw Error('Request is too large.');
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.action === 'draft') return json(await saveDraft(editor, body));
    if (body.action === 'discard') return json(await discardDraft(editor, body));
    if (body.action === 'publish') return json(await publishDraft(editor, body));
    if (body.action === 'revert') return json(await revertText(editor, body));
    throw Error('Unknown action.');
  } catch (e) {
    return errorResponse(e);
  }
}
