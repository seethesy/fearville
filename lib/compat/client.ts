// FEAR-120, browser side: identify this client on every same-origin request
// and surface the server's update verdicts as `fearville:update` events.
import { appInfo } from '../native/bridge.ts';
import { BUILD_ID } from '../runtime/build.ts';
import {
  CLIENT_HEADER,
  UPDATE_HEADER,
  clientHeader,
  type ClientInfo,
} from './versions.ts';
import { BUILD_EVENT, BUILD_HEADER } from './stale.ts';

export const UPDATE_EVENT = 'fearville:update';
export type UpdateDetail = {
  status: 'recommended' | 'required';
  updateUrl: string;
};

export function currentClient(): ClientInfo {
  const app = appInfo();
  return app
    ? {
        platform: app.platform,
        appVersion: app.version,
        build: app.build,
        bridgeVersion: app.bridgeVersion,
      }
    : { platform: 'web', buildId: BUILD_ID };
}
export function currentClientHeader() {
  return clientHeader(currentClient());
}

let installed = false;
/** Wrap window.fetch once. Cross-origin requests are left untouched. */
export function installClientHeader() {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href,
      );
    } catch {
      return original(input, init);
    }
    if (url.origin !== location.origin) return original(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has(CLIENT_HEADER))
      headers.set(CLIENT_HEADER, currentClientHeader());
    const response = await original(input, { ...init, headers });
    // FEAR-121: a newer server build means this page may need a reload.
    const build = response.headers.get(BUILD_HEADER);
    if (build)
      window.dispatchEvent(
        new CustomEvent(BUILD_EVENT, { detail: { buildId: build } }),
      );
    const verdict =
      response.status === 426
        ? 'required'
        : response.headers.get(UPDATE_HEADER) === 'recommended'
          ? 'recommended'
          : null;
    if (verdict) {
      let updateUrl = response.headers.get(UPDATE_HEADER + '-Url') ?? '';
      if (verdict === 'required')
        try {
          updateUrl =
            ((await response.clone().json()) as { updateUrl?: string })
              .updateUrl ?? updateUrl;
        } catch {
          /* The body is informational only. */
        }
      window.dispatchEvent(
        new CustomEvent<UpdateDetail>(UPDATE_EVENT, {
          detail: { status: verdict, updateUrl },
        }),
      );
    }
    return response;
  };
}
