import {
  ChartBar,
  BookOpen,
  CircleCheck,
  Clock,
  EyeOff,
  Hand,
  CircleHelp,
  History,
  ListChecks,
  MessageSquare,
  Moon,
  NotebookPen,
  Armchair,
  ScrollText,
  Settings,
  Sparkles,
  SunMoon,
  CircleUser,
  UserPlus,
  SquareUser,
  Users,
  IdCard,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Illustration } from '@/lib/tutorials/types';

const ICONS: Record<Illustration, LucideIcon> = {
  welcome: Sparkles,
  seat: Armchair,
  appearance: CircleUser,
  invite: UserPlus,
  script: ScrollText,
  character: EyeOff,
  flow: ListChecks,
  clock: Clock,
  'day-night': SunMoon,
  night: Moon,
  nominate: Hand,
  vote: CircleCheck,
  notes: NotebookPen,
  messages: MessageSquare,
  help: CircleHelp,
  settings: Settings,
  rules: BookOpen,
  recap: History,
  friends: Users,
  stats: ChartBar,
  profile: IdCard,
  account: SquareUser,
  done: BadgeCheck,
};

// Decorative: the step's title and text carry the meaning.
export function TutorialIllustration({ name }: { name: Illustration }) {
  const Icon = ICONS[name];
  return (
    <div className={`tutorial-illustration art-${name}`} aria-hidden="true">
      <svg className="tutorial-moon" viewBox="0 0 120 64" focusable="false">
        <circle cx="96" cy="16" r="9" />
        <path d="M0 64 L18 46 L30 54 L46 36 L62 50 L80 40 L98 52 L120 42 L120 64 Z" />
      </svg>
      <Icon strokeWidth={1.6} />
    </div>
  );
}
