import { callback } from '@/lib/accounts/callback';
export async function POST(r: Request) {
  return callback(r, 'apple');
}
