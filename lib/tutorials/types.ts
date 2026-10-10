// Tutorials are plain data. The engine, overlay, Help menu and the iPhone app
// all read the same definitions, so later tickets only add content.

export type TutorialKind = 'walkthrough' | 'section' | 'tour' | 'guide';
// player: seated players only (never the Storyteller). host: Storyteller only.
export type TutorialAudience = 'player' | 'host' | 'all';
export type Platform = 'web' | 'ios';
// Tabs on the iPhone client (GameView).
export type IosTab = 'game' | 'seats' | 'messages' | 'script' | 'controls';
// Decorative illustration shown on a step. Web draws an icon tile; iPhone
// maps each to an SF Symbol (see IOS_SYMBOLS).
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
  illustration?: Illustration;
  // Limit a step to one platform (default: both).
  platforms?: Platform[];
  // iPhone overrides: different wording for the native layout, and the tab to
  // open while the step is showing.
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
