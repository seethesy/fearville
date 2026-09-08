import { callback } from '@/lib/accounts/callback';
export async function GET(r: Request) {
  return callback(r, 'google');
}
