import { requireAdmin } from '@/lib/admin/auth';
import {
  runCommand,
  auditLog,
  textHistory,
  editText,
  flagsOverview,
  setFlag,
} from '@/lib/admin/service';
import { checkOrigin, cookieName, errorResponse, json } from '@/lib/game/store';
import { memberCookie } from '@/lib/game/join';
import { browse, browseCatalog } from '@/lib/admin/browse';
import { reportQueue } from '@/lib/admin/reports';
export async function GET(r: Request) {
  try {
    await requireAdmin(r);
    const params = new URL(r.url).searchParams;
    if (params.get('view') === 'reports')
      return json({
        reports: await reportQueue(
          params.get('status') ?? 'open',
          Number(params.get('offset') ?? 0),
        ),
      });
    if (params.get('view') === 'browse') return json(browseCatalog());
    if (params.get('view') === 'switches') return json(await flagsOverview());
    if (params.get('view') === 'history')
      return json({ history: await textHistory(params.get('key') ?? '') });
    return json({ audit: await auditLog(params) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const admin = await requireAdmin(r);
    const raw = await r.text();
    if (raw.length > 12000) throw Error('Request is too large.');
    const body = JSON.parse(raw);
    if (body.action === 'text') return json(await editText(admin, body));
    if (body.action === 'switch') return json(await setFlag(admin, body));
    if (body.action === 'browse') {
      const { token, clearTable, ...result } = await browse(admin, body);
      const headers: Record<string, string> = token
        ? { 'Set-Cookie': memberCookie(r, token) }
        : clearTable
          ? {
              'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
            }
          : {};
      return json(result, 200, headers);
    }
    return json(await runCommand(admin, body.command, body.confirmation));
  } catch (e) {
    return errorResponse(e);
  }
}
