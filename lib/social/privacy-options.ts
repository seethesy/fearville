export type Visibility = 'public' | 'friends' | 'private';
export type Privacy = {
  stats: Visibility;
  history: Visibility;
  requests: 'everyone' | 'nobody';
  invites: 'friends' | 'nobody';
};
export const defaultPrivacy: Privacy = {
  stats: 'friends',
  history: 'friends',
  requests: 'everyone',
  invites: 'friends',
};
export function canView(visibility: Visibility, relation: string) {
  if (relation === 'self') return true;
  if (relation === 'blocked' || relation === 'unavailable') return false;
  return (
    visibility === 'public' ||
    (visibility === 'friends' && relation === 'friends')
  );
}
