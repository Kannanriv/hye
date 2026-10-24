import { useMemo } from 'react';

import { useStore } from '@/state/store';
import { computeXp, factsFor, GamContext, levelFor } from './engine';
import { useVisitedTabs } from './visited';

/** Derived gamification view of the store: facts, XP and level. */
export function useGamification() {
  const { state } = useStore();
  const visited = useVisitedTabs();
  const ctx = useMemo<GamContext>(() => ({ visited }), [visited]);
  return useMemo(() => {
    const xp = computeXp(state, ctx);
    return { ctx, facts: factsFor(state, ctx), xp, level: levelFor(xp), enabled: state.delight.gamification };
  }, [state, ctx]);
}
