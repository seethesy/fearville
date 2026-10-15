'use client';
import { UiText } from '@/components/ui-text';
import AppLink from '@/components/app-link';
import { MessageBadge } from '@/components/message-badge';
import {
  Play,
  Users,
  MessageSquare,
  BookOpen,
  Settings,
  Radio,
} from 'lucide-react';
import { TEAM_ORDER, TEAM_NAMES } from '@/lib/game/types';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpMenu } from '@/components/tutorials/help-menu';
import { type TableContext } from './display.tsx';
export function TableNavigation({ game }: Pick<TableContext, 'game'>) {
  return (
    <TabsList className="table-tabs" aria-label="Game navigation">
      <TabsTrigger value="flow">
        <Play aria-hidden="true" />
        <span>
          <UiText id={game.phase === 'lobby' ? 'lobby.tab' : 'flow.tab'} />
        </span>
      </TabsTrigger>
      {game.phase === 'lobby' && !game.host ? (
        <>
          <TabsTrigger value="cosmetic" data-tutorial="tab-cosmetic">
            <Users aria-hidden="true" />
            <span>Cosmetic</span>
          </TabsTrigger>
          <TabsTrigger value="recap">
            <BookOpen aria-hidden="true" />
            <span>Session Recap</span>
          </TabsTrigger>
        </>
      ) : (
        <>
          <TabsTrigger value="seats" data-tutorial="tab-notes">
            <Users aria-hidden="true" />
            <span>{game.host ? 'Seats' : 'Notes'}</span>{' '}
            <span className="count">{game.players.length}</span>
          </TabsTrigger>
          <TabsTrigger value="messages" data-tutorial="tab-messages">
            <MessageSquare aria-hidden="true" />
            <span>Messages</span>{' '}
            <MessageBadge key={game.code + game.me} game={game} />
          </TabsTrigger>
        </>
      )}
      {game.host && (
        <TabsTrigger value="recap">
          <BookOpen aria-hidden="true" />
          <span>Session Recap</span>
        </TabsTrigger>
      )}
      <TabsTrigger
        value="script"
        aria-label="Rules & roles"
        data-tutorial="tab-rules"
      >
        <BookOpen aria-hidden="true" />
        <span>Rules</span>
      </TabsTrigger>
      {game.host && (
        <TabsTrigger value="control" data-tutorial="tab-control">
          <Settings aria-hidden="true" />
          <span>Controls</span>
        </TabsTrigger>
      )}
    </TabsList>
  );
}
export function TableHeader({
  game,
  name,
  online,
  setSettingsOpen,
  ownGuide,
}: Pick<
  TableContext,
  'game' | 'name' | 'online' | 'setSettingsOpen' | 'ownGuide'
>) {
  return (
    <header className="brand table-header">
      <AppLink href="/" className="table-wordmark">
        Fearville
      </AppLink>
      <span className="table-identity">
        {game.host ? 'STORYTELLER' : name(game.me)}
      </span>
      <span className="table-script">{game.scriptName}</span>
      {game.roleDistribution && (
        <span className="table-setup">
          <strong>
            {game.customRoleDistribution ? 'Custom' : 'Standard'} setup ·{' '}
            <UiText
              id="lobby.players"
              values={{ count: game.players.length }}
            />
          </strong>
          <small>
            {TEAM_ORDER.filter(
              (t) => t !== 'traveler' || game.script === 'horrors',
            )
              .map(
                (t) =>
                  `${game.roleDistribution![t]} ${game.roleDistribution![t] === 1 ? TEAM_NAMES[t].replace(/s$/, '') : TEAM_NAMES[t]}`,
              )
              .join(' · ')}
          </small>
        </span>
      )}
      <span className="connection">
        <Radio size={14} aria-hidden="true" />{' '}
        {online ? 'Live updates' : 'Reconnecting…'}
      </span>
      <span className="table-population">
        <UiText id="lobby.players" values={{ count: game.players.length }} /> ·{' '}
        {game.players.filter((p) => p.alive).length} alive
      </span>
      <button
        className="icon-button table-settings"
        data-tutorial="table-settings"
        aria-label="Settings"
        title="Settings"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings aria-hidden="true" />
      </button>
      <HelpMenu
        host={game.host}
        seated={!game.host && !game.sandboxHost}
        tipSession={`${game.code}:${game.me}`}
        code={game.code}
        ownGuides={ownGuide ? [ownGuide] : []}
      />
    </header>
  );
}
