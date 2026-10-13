import { currentEnvironment } from '@/lib/runtime/environment';
export function GET() {
  const staging = currentEnvironment() === 'staging';
  return new Response(`User-agent: *\n${staging ? 'Disallow: /' : 'Allow: /'}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
