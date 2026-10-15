'use client';
import { createContext, useContext } from 'react';
import { timedActionFetch } from '@/lib/game/action-timing';
export type TableActionFetch = typeof timedActionFetch;
export const TableActions = createContext<TableActionFetch>(timedActionFetch);
export const TableOnline = createContext(true);
export const useTableOnline = () => useContext(TableOnline);
export const useTableActions = () => useContext(TableActions);
