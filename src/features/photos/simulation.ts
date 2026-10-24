import { useEffect, useRef } from 'react';

import { newId } from '@/domain/hash';
import { useStore } from '@/state/store';

// After you share a photo, a few demo contacts react to it so the prototype feels alive.
// Everything here comes from simulated people, and the UI labels them with a Demo pill.

const WARM_LINES = [
  'This is beautiful 😍',
  'Love this so much!',
  'What a moment ✨',
  'The light here is perfect',
  'Okay this made my day 💛',
  'Frame-worthy. Seriously.',
  'Miss you! Looks like a great time',
];

/** Posts already handled this session, so remounting the tab never re-runs a simulation. */
const handled = new Set<string>();
const FRESH_MS = 2 * 60_000;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mount once (the Photos tab does). Reacts to photos you share with simulated likes and maybe a comment. */
export function usePhotosSimulation() {
  const { state, dispatch } = useStore();
  const postsRef = useRef(state.posts);
  postsRef.current = state.posts;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const fresh = state.posts.filter(
    p => p.kind === 'photo' && p.authorId === 'me' && !handled.has(p.id) && Date.now() - new Date(p.createdAt).getTime() < FRESH_MS,
  );
  const freshKey = fresh.map(p => p.id).join(',');
  const people = state.contacts.filter(c => c.isDemo && !c.blocked).map(c => c.id);
  const peopleKey = people.join(',');

  useEffect(() => {
    if (!freshKey || !peopleKey) return;
    const ids = freshKey.split(',');
    const pool = peopleKey.split(',');
    for (const postId of ids) {
      handled.add(postId);
      const likers = shuffle(pool).slice(0, 2 + Math.floor(Math.random() * 4));
      likers.forEach((by, i) => {
        // Spread across roughly 15 seconds, first one after a short beat.
        const at = 1800 + i * (13_000 / likers.length) + Math.random() * 1500;
        timers.current.push(setTimeout(() => {
          const post = postsRef.current.find(p => p.id === postId);
          if (post && !post.likes.includes(by)) dispatch({ type: 'toggleLike', id: postId, by });
        }, at));
      });
      if (Math.random() < 0.7) {
        const by = likers[0];
        const text = WARM_LINES[Math.floor(Math.random() * WARM_LINES.length)];
        timers.current.push(setTimeout(() => {
          if (!postsRef.current.some(p => p.id === postId)) return;
          dispatch({ type: 'addComment', id: postId, comment: { id: newId('cmt'), authorId: by, text, createdAt: new Date().toISOString() } });
        }, 6000 + Math.random() * 7000));
      }
    }
  }, [freshKey, peopleKey, dispatch]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
}
