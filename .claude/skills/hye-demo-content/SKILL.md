---
name: hye-demo-content
description: How to write and load realistic, honest demo content for the hye prototype — voice and diversity, demo contacts, verified remote media (picsum, pravatar, video URLs), relative timestamps, believable like/view counts, simulation hooks with cleanup, and Demo labelling. Use when seeding or editing demo posts, photos, reels, stories, chats or comments, writing a demo.ts or simulation.ts, picking placeholder images/videos, or when asked to "make the app feel alive", "add sample data" or "fake some activity".
---

# Demo content for hye

The prototype has no backend, so simulated people make it feel alive. Demo content must be
**warm, varied, believable — and always clearly labelled as simulated.**

## Building blocks

- People: `DEMO_CONTACTS` in `src/state/demo.ts` — ids `c_ava`, `c_rahul`, `c_maya`, `c_leo`, `c_sara`,
  `c_kenji`, `c_priya`, `c_omar`, `c_zoe`, `c_dev`; each `isDemo: true`, `avatarUrl` from `https://i.pravatar.cc/300?img=<n>`, a bio, `following` (Zoe and Dev are not followed).
  Write content consistent with each bio (Maya runs trails and photographs, Omar cooks, Kenji shoots Tokyo streets, Sara bakes, Priya is a doctor who dances…).
- Content: `Post` in `src/domain/types.ts` (`kind` 'text'|'photo'|'reel', `media: PostMedia[]`, `likes`, `reposts`, `comments`, `views`, `audience`, `simulated`).
- Generators: `demoTextPosts`, `demoPhotoPosts`, `demoReels` (`(now: number) => Post[]`) in `src/features/{posts,photos,reels}/demo.ts`, combined by `demoPosts(now)`; chats via `demoExtraChats(user, now)` in `src/features/chats/demo.ts`; all seeded by `demoWorld(user)` on sign-up and by the `hydrate` reducer case for older accounts.
- Canned chat replies: `DEMO_REPLIES` (used by `simulateDemo` in `src/state/store.tsx`).

## Honesty rules (non-negotiable)

1. Every simulated post/comment: `simulated: true` on posts, `authorId` = a demo contact id (never `'me'`), comments from demo ids only.
2. UI shows `<DemoPill />` (`src/components/premium.tsx`) next to every simulated author; its label is "Simulated demo content".
3. Never attribute content to the real user. Seeded chat lines "from me" predate `user.createdAt` and are not counted as real activity.
4. Simulated activity never earns XP/achievements (hye-ethical-gamification) and never triggers notifications.
5. No real public figures, celebrities, politicians, brands, logos, trademarked products, real company names, or real addresses. Places can be generic ("the rooftop place near the station", "Lisbon", "north gate").
6. No sensitive themes (health crises, politics, religion debates, alcohol-heavy, dangerous stunts), no romance bait, nothing targeting minors.

## Voice and diversity

- Short, specific, human: "Second attempt at the rye loaf. The crumb finally opened up 🍞" beats "Loving life!!".
- Mix: everyday moments, small wins, questions to friends, gentle humour, the occasional thoughtful thread. Max ~1 emoji per post on average.
- Spread across cultures, places, ages and interests already in the contact bios; avoid stereotypes (the chef isn't only about food, the founder doesn't only post hustle content).
- Comments respond to the content ("That crumb though!"), not generic "Nice pic".
- Texts ≤ 280 chars (`POST_LIMIT` in `src/features/posts/helpers.ts`); include a few replies (`replyToId`) and quotes (`quoteOfId`) so threads exist.

## Media sources

| Media | Source | Notes |
| --- | --- | --- |
| Photos | `https://picsum.photos/seed/<word>/<w>/<h>` | Stable per seed; pick seeds matching the caption loosely (captions shouldn't claim specifics the photo can't show — "golden hour walk" not "my daughter's 5th birthday") |
| Avatars | Already on contacts (pravatar) | Don't add new real-looking faces elsewhere |
| Video | Only URLs you verified today | Prefer short (≤ 10s, ~1 MB) clips; set `poster` to a picsum image and `aspectRatio` |

Sizes: photos 1080×1350 (4:5, `aspectRatio: 0.8`), 1080×1080 (1), 1080×720 landscape; story frames 1080×1920.
Reels are vertical (`aspectRatio: 9/16`); landscape clips are fine with `contentFit="cover"`.

**Verify every remote URL before committing it.** HEAD requests are unreliable (picsum returns 405 to HEAD), so use a ranged GET following redirects:

```bash
curl -s -L -r 0-1 -o /dev/null -w "%{http_code} %{content_type}\n" "<url>"
# OK = 200 or 206 with image/* or video/*. 403/404/5xx or text/html = don't use.
```

Verified on 2026-10-24: Google's `commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBigger*.mp4` clips now return **403** — don't use them. These returned 206 video/mp4 (Blender open movies / generic test clips, no brands):
`https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4`,
`https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4`,
`https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4`.
Re-check them; hosts change. Media must degrade gracefully offline (placeholder background, no crash).

## Timestamps and numbers

- Always relative to the `now` argument: `new Date(now - minutes * 60_000).toISOString()`. Never hard-code dates; never future timestamps.
- Spread: a few in the last hour, most within 1–48h, some 3–10 days old. Order by recency in the feed, not in the source array.
- `likes`: arrays of demo contact ids (0–8 entries; include `'me'` rarely so some appear pre-liked). Never more ids than contacts exist.
- `views`: plausible for a small circle — text 40–900, photos 60–1.5K, reels 300–25K; vary widely, avoid round numbers (`1287` not `1000`). Display with `compact(n)`.
- Comments 0–5 per post; not every post gets engagement.
- Use deterministic content (fixed arrays) in `demo.ts` so tests and screenshots are stable; randomness belongs only in simulations.

## Simulation hooks (`src/features/<name>/simulation.ts`)

Model: `usePhotosSimulation` in `src/features/photos/simulation.ts` and `simulateDemo` in `src/state/store.tsx`.

- Trigger only from a real user action (you posted, you sent a message) and only when `state.user` exists.
- Only demo, non-blocked contacts react: `state.contacts.filter(c => c.isDemo && !c.blocked)`.
- Keep all `setTimeout` ids in a ref and clear them on unmount; guard callbacks by re-reading latest state via a ref (the post may be deleted).
- Track handled ids so remounts don't replay; only react to fresh items (e.g. created < 2 min ago).
- Pace like humans: first reaction after ~1.5–2s, spread over ~15s; not everyone reacts (`Math.random() < 0.7`).
- Dispatch normal actions (`toggleLike{id, by}`, `addComment`, `addMessages`) with demo ids as `by`/`authorId`.
- No haptics, sounds or notifications for simulated events; no endless loops.

```ts
useEffect(() => {
  const t = timers.current;
  return () => t.forEach(clearTimeout);
}, []);
```

## Checklist

- [ ] `simulated: true` + demo author + `DemoPill` visible
- [ ] Varied, warm, bio-consistent voices; no real people/brands
- [ ] Every URL verified with the ranged curl today
- [ ] Timestamps relative to `now`; counts realistic and varied
- [ ] Simulation gated on user, demo contacts only, timers cleaned up
