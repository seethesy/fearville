import type { ComponentProps } from 'react';
// vinext's client Link interception stalled document navigation in this app.
// Keep normal clicks, new tabs, back/forward and fragment links native.
export default function AppLink(props: ComponentProps<'a'>) {
  // oxlint-disable-next-line next/no-html-link-for-pages, jsx-a11y/anchor-has-content
  return <a {...props} />;
}
