'use client';
import {HubShell} from '@/components/hub/shell';
import {TrustBalance} from '@/components/trust-balance';
import {useText} from '@/components/ui-text';
export default function Shop() {
  const text=useText();
  return <HubShell active="Account" title={text('shop.title')}><TrustBalance/><p>{text('shop.soon')}</p></HubShell>;
}
