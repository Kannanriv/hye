---
name: hye-ethical-gamification
description: Non-negotiable rules for XP, levels, achievements, celebrations and engagement mechanics in hye (posts, photos, reels, chats), plus a review checklist using the Hook Model manipulation matrix. Use when adding or reviewing XP, badges, achievements, levels, streaks, progress bars, celebrations, confetti, "keep users engaged", feed endings, notifications/re-engagement, counters, or any "make it more addictive/sticky/gamified" request.
---

# Ethical gamification in hye

hye rewards **real progress and craft** — never compulsion. If a mechanic works better the more tired,
lonely or anxious someone is, it does not ship. Full ethics background:
`.claude/skills/hooked-ux/references/ethical-boundaries.md` (Manipulation Matrix, dark patterns, checklist).

## Where things live

- State: `AppState.progress` (`Progress { xp, achievements: Achievement[], celebrated: string[] }`) and
  `AppState.delight { haptics, celebrations, gamification }` in `src/domain/types.ts`; defaults all `true` in `initialState` (`src/state/demo.ts`).
- Actions (`src/state/store.tsx`): `awardXp{amount}` (reducer ignores it when `delight.gamification` is off),
  `unlockAchievements{ids}` (dedupes, stamps `unlockedAt`), `markCelebrated{id}` (celebrate once), `delight{patch}`.
- Engine (pure, testable): `src/features/gamification/engine.ts` — `factsFor`, `diminishing`, `xpBreakdown`,
  `computeXp`, `levelFor`, `LEVELS`, `ACHIEVEMENTS`, `newlyUnlocked`, `nextSteps`. Celebration UI:
  `AchievementWatcher` + `useReduceMotion` in `src/features/gamification/useAchievementWatcher.tsx`.
  (These files are owned by the gamification feature; verify current exports before relying on them.)

## The rules

1. **Reward real, user-authored progress.** Count only things the person did: `authorId === 'me' && !p.simulated`,
   messages actually sent after `user.createdAt`, completed imports, profile completion, privacy reviewed, data exported.
   Never reward: time spent, sessions opened, scroll depth, reels watched, likes *received*, follower counts.
2. **Diminishing returns.** Repeated actions earn less each time and cap (`diminishing(count, base, cap)`: 1st post 20, 10th 2, then nothing). Volume must not farm XP.
3. **Derive, don't accumulate.** Prefer computing XP from facts (`computeXp(state)`) so deleting a post or turning gamification off/on can't create or lose phantom points. If you use `awardXp`, make it idempotent per source id.
4. **No loss mechanics.** No streaks that break, no XP decay, no "you'll lose your level", no shame copy ("You missed a day"). Progress only goes up or stays.
5. **No variable-reward slot machines.** Rewards are deterministic and explained: the user can see exactly what earns what (`xpBreakdown`, `nextSteps`). No loot boxes, random bonus XP, mystery badges or "spin" mechanics.
6. **No social comparison.** No leaderboards, no "you're in the top 10% of your friends", no ranking contacts by activity. Achievements are personal and private by default.
7. **Every feed ends.** Posts, Photos and Reels lists end with an `EmptyState`-style **"You're all caught up"** card (with a calm action like "Back to chats" or "Write a post"). No autoplay into an endless queue; no infinite pagination of demo content.
8. **No fake urgency or notification bait.** No countdowns, "3 friends are waiting", red dots for non-messages, or re-engagement pushes tied to XP.
9. **Celebrations are short, rare and skippable.** ≤ 2.5s, tap anywhere to dismiss, shown once per achievement (`markCelebrated`), never for routine actions (a like is not an achievement). One success haptic max.
10. **Delight switches are real.** Check before acting:
    - `state.delight.gamification` false → hide XP, levels, badges, next steps; don't award.
    - `state.delight.celebrations` false → record unlocks silently; no overlay, confetti or sound.
    - `state.delight.haptics` false → handled by `useHaptics()`; never bypass it.
11. **Reduce motion.** When `useReduceMotion()` / Reanimated `useReducedMotion()` is true: no particles, bursts or ring sweeps — static badge + text, or a ≤150ms fade.
12. **Demo activity is not achievement.** Simulated likes/comments from demo contacts never count toward XP or unlocks, and the UI never implies they are real people.
13. **Copy is plain and kind.** "You shared your first photo" not "LEGENDARY!!! 🔥🔥". Explain how to earn; never guilt. See `ux-writing`.

## Acceptable vs rejected mechanics

| Surface | Acceptable | Rejected |
| --- | --- | --- |
| Posts | "First post" badge; small XP for first few posts (diminishing); "Thoughtful reply" for replying to someone else | XP per like received; "post 3 more today" quotas; viral-score meters |
| Photos | "First photo shared"; badge for writing alt-text/captions; double-tap heart burst (respecting reduce motion) | Daily photo streaks; "your friends posted, you didn't"; likes-to-unlock filters |
| Reels | Badge for posting your first reel; end-of-feed card after the last reel | XP for watch time; autoplaying endless reels; "keep watching to level up" |
| Chats | "Started a group"; "Imported your history"; privacy review badge | Reply-speed scores; "Ava is waiting for you" bait; streak flames with friends |
| You | Level ring with a clear "next steps" list; toggles to turn it all off | Friend leaderboards; XP decay; locked core features behind levels |

## Implementation pattern

```tsx
const { state, dispatch } = useStore();
const reduce = useReduceMotion();
if (!state.delight.gamification) return null;           // hide progress UI entirely
// Unlock from facts, celebrate once, respect switches.
const fresh = newlyUnlocked(state, ctx);
if (fresh.length) dispatch({ type: 'unlockAchievements', ids: fresh });
const toCelebrate = fresh.find(id => !state.progress.celebrated.includes(id));
if (toCelebrate && state.delight.celebrations) showCelebration(toCelebrate, { reduce }); // tap to dismiss
if (toCelebrate) dispatch({ type: 'markCelebrated', id: toCelebrate });
```

Engine functions stay pure (`(state, ctx) => value`) so they're covered by jest tests under
`src/features/gamification/__tests__/` (or `src/state/__tests__/` for reducer behaviour).

## Review checklist (run on every gamification change)

Manipulation Matrix (from `hooked-ux/references/ethical-boundaries.md`): would the team use this themselves,
and does it **materially improve the user's life**? Only *Facilitator* (yes/yes) mechanics ship. Anything that
smells like *Dealer* — engagement up, wellbeing flat or down — is rejected.

- [ ] Rewards only user-authored, non-simulated actions; nothing for time spent or likes received.
- [ ] Repeatable actions use diminishing returns with a cap.
- [ ] No streaks, decay, loss, countdowns or guilt copy.
- [ ] No randomness in rewards; earning rules are visible to the user.
- [ ] No comparison with other people.
- [ ] Every feed has an end card; no autoplay chain.
- [ ] `delight.gamification`, `delight.celebrations`, `delight.haptics` all honoured (test each off).
- [ ] Reduce motion honoured; celebration ≤ 2.5s, dismissible, plays once.
- [ ] Screen-reader users get the same info (announce "Achievement unlocked: First photo").
- [ ] Turning gamification off and on again doesn't create or destroy progress.
- [ ] Would you be comfortable explaining this mechanic to the user in one honest sentence?

Related: `hooked-ux`, `behavioral-product-design`, `ux-psychology`, `hye-design-system` (motion/haptics).
