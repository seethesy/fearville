'use client';
import { useTableState } from './page/state';
import { tableDisplay } from './page/display';
import { TableScreen } from './page/screen';
import { TableEntry } from './page/entry';

export default function Table() {
  const state = useTableState();
  if (!state.game || state.authError) return <TableEntry {...state} />;
  return <TableScreen {...tableDisplay({ ...state, game: state.game })} />;
}
