---
name: hye-feature-module
description: Step-by-step recipe for adding a new feature to the hye Expo app — src/features/<name>/ layout, expo-router routes, stack screen and tab registration, AppNavBar icons, store actions and reducer, chunked persistence, honest demo data, jest tests, typecheck/lint and running on the phone. Use when asked to "add a feature", "add a screen/page/tab", "add a store action", "where does state live", "how do I persist X", "write tests for", or when scaffolding anything new in hye.
---

# Adding a feature to hye

Stack: Expo SDK 58, React Native 0.88, expo-router (routes in `src/app`), TypeScript strict, path alias `@/*` → `src/*`.
Runs in **Expo Go**: only use modules already in `package.json`; never install packages. Check versioned docs
(`https://docs.expo.dev/versions/v58.0.0/sdk/<module>.md`) before using an API you're unsure of.

## 1. Folder layout

```
src/features/<name>/
  demo.ts          // (now: number) => Post[] | ... — simulated content, all flagged (see hye-demo-content)
  simulation.ts    // optional hook that makes demo contacts react (timers + cleanup)
  <Thing>Card.tsx  // memoised presentational components
  helpers.ts       // pure functions (easy to unit test)
  __tests__/*.test.ts
src/app/...        // thin route files that compose feature components
```

Rules: route files stay thin; no non-route code in `src/app/` (every file there becomes a screen).
Existing examples: `src/features/posts/` (`PostCard`, `helpers.ts`), `src/features/photos/` (`simulation.ts`,
`MediaCarousel`), `src/features/gamification/` (`engine.ts` pure logic). Shared UI comes from
`src/components/ui.tsx`, `src/components/premium.tsx`, `src/components/Screen.tsx` — see hye-design-system.

## 2. Routes

- Stack page: create `src/app/<route>.tsx` (or `src/app/<route>/[id].tsx`), default-export the screen, then
  register it in `src/app/_layout.tsx` inside the signed-in guard:
  ```tsx
  <Stack.Protected guard={signedIn}>
    …
    <Stack.Screen name="<route>" />                       // or options={{ presentation: 'modal' }}
  </Stack.Protected>
  ```
  Screens outside the guard are only for signed-out users (`welcome`).
- Navigate with `router.push({ pathname: '/settings/[page]', params: { page } })` or `<Link>` from `expo-router`.
  Read params with `useLocalSearchParams()`.
- New tab: add `src/app/(tabs)/<name>.tsx`, then
  1. `src/app/(tabs)/_layout.tsx`: `<Tabs.Screen name="<name>" options={{ title: '<Label>' }} />`
  2. `src/components/AppNavBar.tsx`: add `<name>: ['<icon>-outline', '<icon>']` to `ICONS` (Ionicons names).
  3. Phones only show `PHONE_PRIMARY = ['index', 'posts', 'reels', 'photos', 'you']`; anything else must be reachable from the You tab (wide layouts show all tabs in the sidebar). Don't add a sixth phone tab — link it from You.

## 3. State and actions (`src/state/store.tsx`)

- One reducer, `export function reducer(s: AppState, a: Action)`; `Action` is a discriminated union at the top of the file.
- To add an action:
  1. Add the shape to `AppState` in `src/domain/types.ts` (and a default in `initialState`, `src/state/demo.ts`).
  2. Add a member to `Action`: `| { type: 'myThing'; id: string; patch: Partial<Thing> }`.
  3. Add the `case` returning a new object (immutable updates; reuse `mapPost`/`toggle` helpers for posts).
  4. Dispatch from components: `const { state, dispatch, audit } = useStore(); dispatch({ type: 'myThing', … })`.
- Prefer existing actions first: posts (`addPost`, `patchPost`, `deletePost`, `toggleLike`, `toggleRepost`,
  `toggleSave`, `addComment`, `viewPost`), people (`toggleFollow`, `patchContact`, `addContact`), progress
  (`awardXp`, `unlockAchievements`, `markCelebrated`), settings (`delight`, `theme`, `privacy`, `notifications`, `patchUser`).
- Ids: `newId('<prefix>')` from `src/domain/hash.ts`. Timestamps: ISO strings.
- Privacy-relevant actions: also call `audit(action, detail)` (labels in `src/utils/labels.ts` `auditLabel`).
- Derived data goes in pure selectors (`src/state/selectors.ts` style) + `useMemo`, not in state.
- Feature-local ephemeral state (e.g. seen stories, visited tabs) can live in a module-level store inside the feature (see `src/features/photos/stories.ts`) — but anything the user would expect after restart belongs in `AppState`.
- Accounts created before a new slice existed: `hydrate` merges `{ ...initialState, ...saved }` (in `loadState`), so new top-level keys get defaults automatically; migrate nested data in the `hydrate` case.

## 4. Persistence (`src/state/persistence.ts`)

Automatic: `StoreProvider` debounces `saveState` 400ms after every change. Storage is chunked —
one meta record (`hye/v2/meta`, everything except messages) + message chunks of 1500 per conversation
(`hye/v2/msgs/<conv>/<i>`), written only when changed (by reference). Implications:
- Keep `AppState` JSON-serialisable (no Dates, Maps, functions).
- Everything that isn't `messages` lives in the meta row, which has a ~2 MB practical limit on Android — don't store media blobs or unbounded logs there (cap lists like `audit` is capped at 500).
- Need durability before continuing (e.g. between import batches)? `await flush()` from `useStore()`.
- `wipeAll()` clears storage, files and demo timers — new caches must be cleared by `clearStorage`/`clearAppFiles`.

## 5. Demo data honesty

Every simulated item: `simulated: true`, authored by a demo contact (`isDemo: true`, from `DEMO_CONTACTS`),
and the UI shows `<DemoPill />` beside the author. Seed new content via your `demo.ts` and wire it into
`demoPosts()`/`demoWorld()` in `src/state/demo.ts` (owner permitting). Simulations run only when `state.user`
exists, clean up timers on unmount, and never touch real (non-demo) contacts. Details: hye-demo-content.

## 6. Quality bar

- Lists: `FlatList` with stable `keyExtractor`, `memo` rows, `useCallback` handlers, tuned `windowSize`/`initialNumToRender`; every feed ends with an end card (hye-ethical-gamification).
- Accessibility and theming per hye-design-system; copy per `ux-writing`.
- Light + dark both checked; wide layout (`useIsWide()`) doesn't break.

## 7. Tests

jest-expo (`"preset": "jest-expo"` in `package.json`, `.claude/` ignored). Put tests next to code in `__tests__/`:
`src/state/__tests__/reducer.test.ts`, `src/state/__tests__/selectors.test.ts`, `src/domain/import/__tests__/*`.
Pattern for reducer tests:

```ts
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { initialState } from '../demo';
import { reducer } from '../store';
const NOW = Date.parse('2026-10-24T12:00:00.000Z');
beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(NOW); });
afterAll(() => jest.useRealTimers());
it('likes a post', () => {
  const s = reducer({ ...initialState, posts: [post] }, { type: 'toggleLike', id: post.id });
  expect(s.posts[0].likes).toContain('me');
});
```

Keep logic pure (helpers/engine) so it's testable without rendering.

## 8. Commands

```bash
npx tsc --noEmit          # npm run typecheck — must be clean for your files
npx jest                  # npm test; single file: npx jest src/state/__tests__/reducer.test.ts
npx expo lint             # npm run lint — if it offers to install/configure ESLint, decline (no new packages)
npm run e2e:web           # Playwright web journeys (port 8081)
```

Don't run `expo start` on port 8082 unless you are the one driving the phone — it's reserved for the
user's device. To run on the phone, follow the `hye-run-on-phone` skill (`npm run phone`, `adb reverse tcp:8082 tcp:8082`).

## Checklist

- [ ] Feature code in `src/features/<name>/`, thin route in `src/app/`
- [ ] Route registered in `src/app/_layout.tsx` (or tab in `(tabs)/_layout.tsx` + `ICONS` in `AppNavBar.tsx`)
- [ ] New state typed in `types.ts`, defaulted in `initialState`, action in the `Action` union + reducer case
- [ ] Serializable, bounded state; caches cleared on wipe
- [ ] Demo content flagged + `DemoPill`; simulations cleaned up
- [ ] Tests for pure logic and reducer cases; `tsc` clean
