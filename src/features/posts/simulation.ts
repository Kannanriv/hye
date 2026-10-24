import { useEffect, useRef } from 'react';

import { newId } from '@/domain/hash';
import type { Post } from '@/domain/types';
import { useStore } from '@/state/store';
import { pick, randInt, sample } from './helpers';

// Demo "network" for the Posts tab. Everything produced here is flagged `simulated: true`
// and authored by a demo contact, so the UI can label it with a Demo pill.

const LINES = [
  'Made chai for the whole office today. Productivity unclear, morale excellent. ☕',
  'Small win: finally fixed the squeaky door. I feel like an engineer of the highest order.',
  'Watched the sunrise from the balcony. Highly recommend, zero subscription fees. 🌅',
  'Reminder that it’s okay to take the slow route home sometimes.',
  'Tried a new bakery on the corner. The cardamom bun changed my week. #food',
  'Called an old friend just to say hi. Forty minutes later we’re planning a trip.',
  'Rainy afternoon, good playlist, nowhere to be. Perfect.',
  'Our team shipped a feature today that started as a napkin sketch. Proud of these people. #teamwork',
  'If you’re reading this: drink some water and unclench your jaw. 💧',
  'Learned three words of Portuguese today. Used all three at the market. Victory.',
  'My plants are thriving and I take full credit, despite doing nothing differently.',
  'Cooking tip: toast your spices first. Your kitchen will smell like a hug. #cooking',
  'Took the long way through the park and saw a dog wearing tiny boots. Day made. 🐕',
  'The best meetings are the ones that become a quick message instead.',
  'Reading on the train again instead of scrolling. Ten pages a day adds up. #reading',
  'Grateful for friends who send voice notes that start with “okay so, quick story” and last eight minutes.',
  'Today’s goal: one thing done well instead of ten things done badly.',
  'Fresh notebook, fresh pen, fresh start. Monday energy on a Thursday.',
  'Just taught my mum how to send a voice message. She has sent me eleven since.',
  'The view from the hill at golden hour never gets old. #photography',
  'Started a tiny herb garden on the window sill. Basil is winning. 🌿',
  'Hot soup, cold evening, good company. That’s the whole post.',
  'Pair-programmed with a junior dev today and learned more than I taught. #engineering',
  'Somebody left a “you’ve got this” sticky note on the lift mirror. Whoever you are: thank you.',
  'Weekend plan: absolutely nothing, executed with precision.',
  'Kids next door set up a lemonade stand. Best business pitch I’ve heard all year. 🍋',
  'Finished a 1000-piece puzzle. Two pieces missing. Character building.',
  'New running shoes and suddenly I’m a person who goes running. Let’s see how long this lasts. #running',
  'Shoutout to everyone who says thank you to the bus driver.',
  'Found my grandfather’s old camera in a drawer. It still works. Developing the first roll this week. 🎞️',
  'Wrote a thank-you letter by hand today. Forgot how good that feels.',
  'Late-night idea: what if meetings had a soundtrack. Okay going to sleep now.',
  'Rebuilt my morning routine around a 10 minute walk. Head is so much clearer. #wellbeing',
  'Street musician played my favourite song on the way to work. Coincidence? I think not. 🎶',
  'The secret ingredient is always more garlic than the recipe says. #cooking',
  'Saw a double rainbow from the office window. Whole floor went quiet for a moment. 🌈',
  'Proud of my sister, who passed her driving test on the third try. Persistence!',
  'Today I’m grateful for good coffee, clean code and people who reply “on it” within a minute.',
  'Spent the evening fixing a friend’s bike. We are both now experts. Probably.',
  'A stranger complimented my jacket and I will be thinking about it for a week.',
  'Bought flowers for no reason. Turns out that’s the best reason. 💐',
  'Mountains this weekend. Phone stays in the bag. See you on Monday. ⛰️',
];

const REPLIES = [
  'Love this! 🙌',
  'This made my day, thank you for sharing.',
  'So true. Needed to read this today.',
  'Haha, yes! Exactly this.',
  'Okay this is great. Tell me more!',
  'Couldn’t agree more 💯',
  'Saving this one.',
  'You always find the good in things ✨',
  'Big same.',
  'Ha! Can relate.',
];

const IMAGE_SEEDS = ['morninglight', 'citywalk', 'greenpark', 'harbour', 'bookshop', 'teatime', 'hilltop', 'bicycle', 'market', 'seaside'];

/** Max simulated posts per app session, so the demo feed stays calm and finite. */
const MAX_PER_SESSION = 12;

/**
 * Mount once at the root. While signed in it publishes a short post from a random followed demo
 * contact every 25–45s, and reacts to the user's own posts with a few likes (and sometimes a reply).
 */
export function usePostsSimulation() {
  const { state, dispatch } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const signedIn = !!state.user;

  // 1. Followed demo contacts publish now and then.
  useEffect(() => {
    if (!signedIn) return;
    let published = 0;
    let timer: ReturnType<typeof setTimeout>;
    const publish = () => {
      const s = stateRef.current;
      const people = s.contacts.filter(c => c.isDemo && c.following && !c.blocked);
      if (!people.length) return;
      const author = pick(people);
      const recent = new Set(s.posts.slice(0, 80).map(p => p.text));
      const fresh = LINES.filter(l => !recent.has(l));
      const text = pick(fresh.length ? fresh : LINES);
      const withImage = Math.random() < 0.25;
      const w = 1200;
      const hgt = pick([800, 900, 1200]);
      const others = s.contacts.filter(c => c.isDemo && c.id !== author.id).map(c => c.id);
      const post: Post = {
        id: newId('post'),
        kind: 'text',
        authorId: author.id,
        text,
        media: withImage ? [{ kind: 'image', uri: `https://picsum.photos/seed/${pick(IMAGE_SEEDS)}${randInt(1, 999)}/${w}/${hgt}`, aspectRatio: w / hgt }] : [],
        createdAt: new Date().toISOString(),
        likes: sample(others, randInt(0, 3)),
        reposts: [],
        comments: [],
        saved: false,
        views: randInt(8, 140),
        audience: 'everyone',
        simulated: true,
      };
      dispatch({ type: 'addPost', post });
      published += 1;
    };
    const schedule = () => {
      timer = setTimeout(() => {
        publish();
        if (published < MAX_PER_SESSION) schedule();
      }, randInt(25_000, 45_000));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [signedIn, dispatch]);

  // 2. Reactions to the user's own posts.
  const known = useRef<Set<string> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  useEffect(() => {
    if (!signedIn) {
      known.current = null;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      return;
    }
    const mine = state.posts.filter(p => p.authorId === 'me' && p.kind === 'text');
    // First run after sign-in/hydrate: existing posts are history, not news.
    if (!known.current) {
      known.current = new Set(mine.map(p => p.id));
      return;
    }
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
      timers.current.add(t);
    };
    const exists = (id: string) => stateRef.current.posts.find(p => p.id === id);

    for (const p of mine) {
      if (known.current.has(p.id)) continue;
      known.current.add(p.id);
      const people = stateRef.current.contacts.filter(c => c.isDemo && !c.blocked);
      const followed = people.filter(c => c.following);
      const likers = sample(followed.length ? followed : people, randInt(1, 3));
      likers.forEach(c => later(randInt(1_500, 10_000), () => {
        const cur = exists(p.id);
        if (cur && !cur.likes.includes(c.id)) dispatch({ type: 'toggleLike', id: p.id, by: c.id });
      }));
      [3_000, 7_000, 12_000].forEach(ms => later(ms + randInt(0, 1500), () => {
        const cur = exists(p.id);
        if (cur) dispatch({ type: 'patchPost', id: p.id, patch: { views: cur.views + randInt(2, 9) } });
      }));
      if (!p.replyToId && Math.random() < 0.35 && likers.length) {
        const replier = likers[0];
        later(randInt(6_000, 12_000), () => {
          if (!exists(p.id)) return;
          dispatch({
            type: 'addPost',
            post: {
              id: newId('post'), kind: 'text', authorId: replier.id, text: pick(REPLIES), media: [],
              createdAt: new Date().toISOString(), likes: [], reposts: [], comments: [], replyToId: p.id,
              saved: false, views: randInt(1, 12), audience: 'everyone', simulated: true,
            },
          });
        });
      }
    }
  }, [state.posts, signedIn, dispatch]);
}
