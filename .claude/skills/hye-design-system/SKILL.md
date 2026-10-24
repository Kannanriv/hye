---
name: hye-design-system
description: The hye app's premium design language — tokens, gradients, spacing/radius/type scale, the ui.tsx + premium.tsx component inventory, Reanimated motion rules, haptics map, dark mode and the accessibility checklist. Use when building or reviewing any hye screen or component, or when asked to "make it look premium", "match the design system", "add an animation", "add haptics", "fix dark mode", "check contrast", "which component should I use", or "polish this UI".
---

# hye design system

Calm neutral canvas, white (or deep slate) surfaces, one indigo accent. "Premium" comes from spacing,
springy feedback and restraint — not from colour everywhere. Source of truth:

- `src/theme/tokens.ts` — `palette.light|dark`, `Colors`, `gradients`, `space`, `radius`, `type`, `WIDE_BREAKPOINT` (768)
- `src/theme/useTheme.ts` — `useTheme()` → `{ colors, mode }`, `useIsWide()`, `ThemeProvider`
- `src/components/ui.tsx` — base components; `src/components/premium.tsx` — delight primitives
- `src/components/Screen.tsx` — `Screen` page shell (title, subtitle, back, actions, scroll)

## Tokens

| Scale | Values | Use |
| --- | --- | --- |
| `space` | xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 | Screen gutter `lg`; card padding `lg`; gaps between cards `md`; section breaks `xl` |
| `radius` | sm 8 · md 12 · lg 18 · pill 999 | Cards/sheets/dialogs `lg`; buttons, inputs, inline images `md`; badges `sm`; chips `pill` |
| `type` | title 28/700 · heading 20/700 · subheading 16/600 · body 16/22 · small 14/19 · caption 12/16 | Render through `<Txt variant=…>`; never invent font sizes |

Colours: always `const { colors } = useTheme()` and a `Colors` key (`text`, `textMuted`, `surface`,
`surfaceAlt`, `bg`, `border`, `borderStrong`, `accent`, `accentSoft`, `onAccent`, `success`, `warning`,
`danger`, `onDanger`, `dangerSoft`, `imported`, `importedSoft`, `overlay`, `bubbleMe*`, `bubbleThem`).
The only hard-coded colours allowed: `#fff`/`rgba(0,0,0,x)` on top of photos, video or `gradients.scrim`,
and gradient stops.

## Gradients (`gradients` in tokens.ts)

- `brand` (indigo → violet → pink): primary CTA (`GradientButton`), unseen story rings (`PhotoAvatar ring`), celebrations, level/XP rings. One gradient CTA per screen.
- `sunset`, `ocean`: decorative only (badges, rings, celebration accents). **White text fails AA on them** (#fff on #F59E0B = 2.15:1, on #0EA5E9 = 2.77:1) — never pass them to `GradientButton` with a label.
- `scrim`: bottom-of-media fade so white captions/counters are readable on photos and reels.
- Never: gradient backgrounds on cards, list rows, headers, text, or more than one gradient element competing in view.

## Component inventory — pick before you build

| Need | Use | Notes |
| --- | --- | --- |
| Any text | `Txt` (ui) | `variant`, `color` is a `Colors` key; title/heading get `accessibilityRole="header"` |
| Standard action | `Button` (ui) | variants primary/secondary/ghost/danger, `loading`, `compact` (40pt — add hitSlop) |
| The one hero CTA | `GradientButton` (premium) | brand gradient, 50pt, haptic `tap` built in |
| Icon-only action | `IconButton` (ui) | 44pt, `label` required (becomes accessibilityLabel) |
| Custom tappable (cards, tiles, like) | `PressableScale` (premium) | spring to `scaleTo` (0.96), optional `haptic` |
| Filter/segment | `Chip` (ui) | 34pt tall — add `hitSlop={{ top: 5, bottom: 5 }}` in dense rows |
| Text input | `TextField` (ui) | `label`, `error` |
| Status label | `Tag` (ui) | tone muted/accent/warning/success/danger |
| Person (no photo) | `Avatar` (ui) | initials, colour from name, `group` |
| Person with photo / story | `PhotoAvatar` (premium) | `uri`, `ring`, `seen` (grey ring) |
| Simulated content marker | `DemoPill` (premium) | mandatory next to every simulated author |
| Big counts | `compact(n)` (premium) | 1.2K / 3.4M; announce the full number in labels |
| Container | `Card` (ui) | radius lg, hairline border, `surface` |
| Settings-style list | `Row`, `ToggleRow`, `SectionTitle`, `Divider` (ui) | Row min 56pt |
| Empty / end of list | `EmptyState` (ui) | icon + title + body + optional action |
| Inline notice | `Banner` (ui) | tone info/imported/warning/danger, `accessibilityRole="summary"` |
| Confirm destructive | `ConfirmDialog` (ui) | `confirmLabel` names the exact outcome |
| Long-press menu | `ActionSheet` (ui) | actions with icon, `danger`, `hidden` |
| Custom bottom sheet | `SheetFrame` (ui) | backdrop is a sibling so screen readers reach content |
| Page shell | `Screen` | `back` for stack pages; `scroll={false}` when the child is a FlatList |
| Platform badge | `SourceBadge`, `platformLabel` (ui) | imported/connected content |

Add a new shared primitive to `premium.tsx`/`ui.tsx` only if two or more features need it; otherwise keep it in `src/features/<name>/`.

## Motion (react-native-reanimated 4)

- Press feedback: `PressableScale` springs (`damping 18, stiffness 320` in, `damping 14, stiffness 260` out). Reuse it; don't hand-roll opacity presses for premium surfaces.
- Entrances: `entering={FadeInDown.springify()}` / `FadeInUp.delay(150 + i * 80)` as in `src/app/welcome.tsx`. Stagger ≤ 80ms per item, cap the stagger at ~6 items.
- Durations: micro feedback 120–200ms, content transitions 200–300ms, celebrations ≤ 2.5s total and skippable (tap to dismiss).
- Animate only `transform` and `opacity`. No layout-thrashing width/height loops; no infinite pulsing on idle screens.
- Media loading: `expo-image` with `transition={150}–{250}` and a `surfaceAlt` placeholder background.
- Reduce motion: honour it everywhere. Read it with `useReducedMotion()` from `react-native-reanimated`, or `AccessibilityInfo.isReduceMotionEnabled()` + `reduceMotionChanged` listener (see `useReduceMotion` in `src/features/gamification/useAchievementWatcher.tsx`). When on: no particles/bursts/parallax, replace springs with ≤150ms fades or instant changes; layout animations can use `.reduceMotion(ReduceMotion.System)`.
- Celebrations also require `state.delight.celebrations` (see hye-ethical-gamification).

## Haptics map (`useHaptics()` → `buzz(kind: HapticKind)`)

`useHaptics` already no-ops on web and when `state.delight.haptics` is off — always go through it, never call `expo-haptics` directly.

| Kind | When |
| --- | --- |
| `tap` | Primary button press, send message/post, open composer, pick a person |
| `select` | Toggle like/repost/save/follow, change chip/tab/segment, pick a reaction, page snap in reels |
| `success` | Something durable finished: post published, import completed, achievement unlocked, verified code |
| `warning` | Validation failure, blocked action, about to do something destructive |
| `heavy` | Rare: long-press opening a context menu. Never on scroll or repeated events |

At most one haptic per user action; never on timers, simulated events or incoming demo activity.

## Dark mode

- Theme comes from `state.theme` ('system' | 'light' | 'dark'); `ThemeProvider` resolves it. Test both via Settings › Appearance.
- Never branch on `mode` for colours you can get from `colors`; branch only for imagery (e.g. `StatusBar style`).
- Elevation: light uses soft shadow (`shadowOpacity` ≤ 0.08, radius 12) + hairline border; dark relies on `surface` vs `bg` contrast and hairline `border` — drop shadows are invisible there.

## Accessibility checklist

Token pairs verified (WCAG AA ≥ 4.5:1): light — text/surface 17.9, textMuted/surface 5.96, textMuted/surfaceAlt 5.22,
accent/surface 6.29, onAccent/accent 6.29, imported/importedSoft 6.37, warning/importedSoft 4.51, danger/dangerSoft 5.30,
onDanger/danger 6.47, success/surface 5.48; dark — text/surface 14.7, textMuted/surface 6.99, accent/surface 6.51,
onAccent/accent 7.14, danger/dangerSoft 5.75. White on brand stops: 6.29 / 5.70 / 4.60. Stick to these pairs.

- [ ] Every interactive element has `accessibilityRole` + `accessibilityLabel` (`IconButton` needs `label`).
- [ ] Touch targets ≥ 44×44pt (use `hitSlop` for 34pt `Chip`s and 40pt compact buttons).
- [ ] State is announced: `accessibilityState={{ selected, disabled }}`; counts in words ("12 likes", not "12").
- [ ] Gestures have a button equivalent (double-tap like → like button; swipe → menu action).
- [ ] Text over media sits on `gradients.scrim` or a dark overlay.
- [ ] Images: `accessibilityLabel` describing content, or `accessible={false}` if decorative.
- [ ] Reduce motion respected; nothing flashes > 3×/s.
- [ ] Layout survives 200% font scale (no fixed heights on text containers).

## Do / Don't

```tsx
// DO: tokens, theme colours, shared primitives, labelled counts
const { colors } = useTheme();
<PressableScale haptic="select" accessibilityRole="button"
  accessibilityLabel={liked ? `Unlike. ${n} likes` : `Like. ${n} likes`}
  accessibilityState={{ selected: liked }} onPress={onLike} hitSlop={8}>
  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.danger : colors.textMuted} />
</PressableScale>
<Txt variant="small" color="textMuted">{compact(n)}</Txt>

// DON'T: hard-coded colours, raw sizes, unlabelled touchables, direct haptics
<TouchableOpacity onPress={onLike}><Text style={{ color: '#999', fontSize: 13 }}>♥ {n}</Text></TouchableOpacity>
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
```

```tsx
// DO: a card
<Card style={{ padding: space.lg, gap: space.md }}>…</Card>
// DON'T: gradient card backgrounds or radius 24 one-offs
<LinearGradient colors={gradients.brand} style={{ borderRadius: 24 }}>…</LinearGradient>
```

Related skills: `ui-ux-pro-max` (React Native rules), `ux-writing` (copy), `hye-ethical-gamification` (celebrations).
