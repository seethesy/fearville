import { database } from '@/db';
import { UI_TEXT } from '@/lib/ui-text/registry';
import { json, errorResponse } from '@/lib/game/store';
export async function GET() {
  try {
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
