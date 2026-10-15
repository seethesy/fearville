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
import {
  feedbackSummary,
  formsOverview,
  publishForm,
  responses,
  responsesExport,
  setFormActive,
  triageResponse,
} from '@/lib/feedback/admin';
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
    // FEAR-175: feedback form editor and response viewer.
    if (params.get('view') === 'feedback-forms')
      return json({ forms: await formsOverview() });
    if (params.get('view') === 'feedback')
      return json(await responses(params));
    if (params.get('view') === 'feedback-summary')
      return json(await feedbackSummary());
    if (params.get('view') === 'feedback-csv')
      return new Response(await responsesExport(params), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="fearville-feedback-${new Date().toISOString().slice(0, 10)}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
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
    // Feedback form definitions can be larger than other admin requests.
    if (raw.length > 64000) throw Error('Request is too large.');
    const body = JSON.parse(raw);
    if (body.action !== 'feedback' && raw.length > 12000)
      throw Error('Request is too large.');
    if (body.action === 'feedback') {
      if (body.op === 'publish') return json(await publishForm(admin, body));
      if (body.op === 'activate') return json(await setFormActive(admin, body));
      if (body.op === 'triage') return json(await triageResponse(admin, body));
      throw Error('Unknown feedback action.');
    }
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
