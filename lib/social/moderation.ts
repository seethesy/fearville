// Server-side filter for objectionable handles and Storyteller rating
// comments (App Store 1.2, Google Play UGC policy). Uses the `obscenity`
// English dataset, which handles leetspeak and avoids common false positives
// ("assassin", "Scunthorpe").
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export function isObjectionable(text: string) {
  return matcher.hasMatch(text);
}

// Handles are [a-z0-9_]; also check with underscores removed so that
// "b_a_d_w_o_r_d" is caught.
export function isObjectionableHandle(handle: string) {
  return isObjectionable(handle) || isObjectionable(handle.replace(/_/g, ''));
}

export const OBJECTIONABLE_HANDLE =
  'That username isn’t allowed. Choose one without offensive words.';
export const OBJECTIONABLE_COMMENT =
  'Please remove offensive words from your comment. Fearville has no tolerance for abusive content.';
