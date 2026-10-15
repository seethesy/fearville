// Tutorials are plain data shared by the web UI in browsers and mobile shells.
// Legacy ios platform metadata is retained for saved IDs and API compatibility.
// Shells use the web platform; new content belongs in the shared web UI.

import type { RiteDiagram } from './diagrams.ts';

export type TutorialKind = 'walkthrough' | 'section' | 'tour' | 'guide';
// player: seated players only (never the Storyteller). host: Storyteller only
// (the tour and Storyteller-only sections; never requested for players).
export type TutorialAudience = 'player' | 'host' | 'all';
export type Platform = 'web' | 'ios';
// Retired native tab names retained as legacy tutorial metadata.
export type IosTab = 'game' | 'seats' | 'messages' | 'script' | 'controls';
// Decorative illustration shown as an icon tile in the shared web UI.
export type Illustration =
  | 'welcome'
  | 'seat'
  | 'appearance'
  | 'invite'
  | 'script'
  | 'character'
  | 'flow'
  | 'clock'
  | 'day-night'
  | 'night'
  | 'nominate'
  | 'vote'
  | 'notes'
  | 'messages'
  | 'help'
  | 'settings'
  | 'rules'
  | 'recap'
  | 'friends'
  | 'stats'
  | 'profile'
  | 'account'
  | 'done';

export interface TutorialStep {
  title: string;
  body: string;
  // Web: the value of a `data-tutorial` attribute to spotlight. A missing
  // target shows the step as a centered card.
  target?: string;
  // Web: the tab to open while this step shows (overrides the tutorial's
  // `tab`). Lets a tour walk across tabs.
  tab?: string;
  illustration?: Illustration;
  // Night Rite guides: an explanatory drawing shown instead of the icon tile.
  diagram?: RiteDiagram;
  // Limit a step to one platform (default: both).
  platforms?: Platform[];
  // Legacy native wording/tab overrides, retained for compatibility.
  ios?: { body?: string; title?: string; tab?: IosTab };
}

export interface Tutorial {
  id: string;
  kind: TutorialKind;
  title: string;
  // One line shown in Help.
  summary: string;
  audience: TutorialAudience;
  // Section tutorials: the section that triggers them on first open.
  section?: string;
  // Web tab to open before the first step (section tutorials and replays).
  tab?: string;
  // Tutorials that form one experience. Skipping any member marks every
  // member seen; replaying the first member replays the whole group.
  group?: string;
  // Completing this tutorial also marks these ids seen (never on skip).
  covers?: string[];
  platforms?: Platform[];
  steps: TutorialStep[];
}

export type SeenStatus = 'completed' | 'skipped';
export interface SeenItem {
  id: string;
  status: SeenStatus;
}
