import type { Post } from '@/domain/types';

// Simulated text posts from the demo contacts. Every post is flagged `simulated` and shows a Demo pill.
// Times are relative to `now` so the feed always looks recent (spread over the last ~3 days).

const H = 60;
const D = 24 * H;

type Opts = Partial<Pick<Post, 'likes' | 'reposts' | 'replyToId' | 'quoteOfId' | 'views'>> & { image?: [seed: string, w: number, h: number] };

export function demoTextPosts(now: number): Post[] {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const tp = (id: string, authorId: string, minutesAgo: number, text: string, o: Opts = {}): Post => ({
    id,
    kind: 'text',
    authorId,
    text,
    media: o.image
      ? [{ kind: 'image', uri: `https://picsum.photos/seed/${o.image[0]}/${o.image[1]}/${o.image[2]}`, aspectRatio: o.image[1] / o.image[2] }]
      : [],
    createdAt: at(minutesAgo),
    likes: o.likes ?? [],
    reposts: o.reposts ?? [],
    comments: [],
    replyToId: o.replyToId,
    quoteOfId: o.quoteOfId,
    saved: false,
    views: o.views ?? 120,
    audience: 'everyone',
    simulated: true,
  });

  return [
    tp('tp_ava_1', 'c_ava', 12, 'Redesigned our onboarding to ask for one thing at a time instead of six. Completion went up and support tickets went down. Respect people’s attention and they give it back. #design', {
      likes: ['c_leo', 'c_dev', 'c_maya', 'c_rahul', 'c_zoe'], reposts: ['c_leo', 'c_dev'], views: 1840,
    }),
    tp('tp_omar_1', 'c_omar', 38, 'Slow-cooked lamb with apricots and cinnamon tonight. My grandmother never measured anything, so I’m still reverse-engineering her recipes one Sunday at a time.', {
      image: ['tagine', 1200, 900], likes: ['c_sara', 'c_priya', 'c_ava', 'c_kenji'], views: 960,
    }),
    tp('tp_rahul_1', 'c_rahul', 55, 'Hot take: the best engineering docs are written for the person who joins the team in six months, not for the reviewer today. What’s the best doc you’ve ever read at work?', {
      likes: ['c_leo', 'c_dev', 'c_ava'], reposts: ['c_dev'], views: 2310,
    }),
    tp('tp_leo_r1', 'c_leo', 48, '@rahul The one with a “why we didn’t do X” section. Saved me from re-proposing a rejected idea twice 😅', {
      replyToId: 'tp_rahul_1', likes: ['c_rahul', 'c_ava'], views: 410,
    }),
    tp('tp_ava_r1', 'c_ava', 44, '@rahul A one-page decision log with screenshots. Boring format, priceless six months later.', {
      replyToId: 'tp_rahul_1', likes: ['c_rahul'], views: 320,
    }),
    tp('tp_dev_r1', 'c_dev', 40, '@rahul Runbooks written right after an incident, while the panic is still fresh. Honest and specific.', {
      replyToId: 'tp_rahul_1', likes: ['c_rahul', 'c_leo'], views: 290,
    }),
    tp('tp_rahul_r1', 'c_rahul', 31, '@leo @ava @dev Okay, stealing all three. Starting a “why not” section in our next RFC. #engineering', {
      replyToId: 'tp_rahul_1', likes: ['c_leo', 'c_ava', 'c_dev'], views: 270,
    }),
    tp('tp_maya_1', 'c_maya', 95, '21 km along the coast before sunrise. Legs are jelly, heart is full. #trailrunning', {
      image: ['coastrun', 1200, 800], likes: ['c_zoe', 'c_priya', 'c_sara', 'c_kenji', 'c_ava', 'c_omar'], reposts: ['c_zoe'], views: 1420,
    }),
    tp('tp_kenji_1', 'c_kenji', 2 * H + 10, 'Rain in Shinjuku turns every street into a mirror. I walked for three hours and took eleven photos I like.', {
      image: ['tokyorain', 900, 1200], likes: ['c_zoe', 'c_maya', 'c_ava'], reposts: ['c_zoe'], views: 2780,
    }),
    tp('tp_priya_1', 'c_priya', 3 * H, 'Twelve-hour shift done. Reminder from the ward: drink water, sleep when you can, and call your parents. They miss you more than they say. ❤️', {
      likes: ['c_sara', 'c_omar', 'c_maya', 'c_rahul', 'c_ava', 'c_kenji', 'c_leo'], reposts: ['c_sara', 'c_omar'], views: 3150,
    }),
    tp('tp_sara_1', 'c_sara', 4 * H + 20, 'Day 9 of the new sourdough starter. She has a name now (Doughlores) and a better social life than me. #baking', {
      image: ['sourdough', 1200, 1200], likes: ['c_omar', 'c_priya', 'c_maya', 'c_ava'], views: 1200,
    }),
    tp('tp_omar_r1', 'c_omar', 4 * H, '@sara Feed her rye flour once a week and she’ll love you forever. Doughlores deserves the best.', {
      replyToId: 'tp_sara_1', likes: ['c_sara'], views: 380,
    }),
    tp('tp_priya_r1', 'c_priya', 3 * H + 40, '@sara Doughlores 😂 I need a loaf for the night shift, please and thank you.', {
      replyToId: 'tp_sara_1', likes: ['c_sara', 'c_omar'], views: 340,
    }),
    tp('tp_sara_r1', 'c_sara', 3 * H + 25, '@priya Saturday’s bake has your name on it. @omar rye it is, chef!', {
      replyToId: 'tp_sara_1', likes: ['c_priya', 'c_omar'], views: 260,
    }),
    tp('tp_dev_1', 'c_dev', 5 * H, 'Shipping small beats shipping big. Every release this month was under 200 lines and our rollback count went to zero. #startups', {
      likes: ['c_rahul', 'c_leo'], reposts: ['c_rahul'], views: 4120,
    }),
    tp('tp_dev_q1', 'c_dev', 6 * H, 'This is the whole product playbook in two sentences.', {
      quoteOfId: 'tp_ava_1', likes: ['c_ava', 'c_rahul', 'c_leo'], views: 2010,
    }),
    tp('tp_leo_1', 'c_leo', 7 * H, 'Built a keyboard with silent switches so my flatmate stops leaving passive-aggressive notes. Now I hear my own thoughts. Terrifying. #keyboards', {
      image: ['keyboard', 1200, 800], likes: ['c_rahul', 'c_dev', 'c_kenji'], views: 980,
    }),
    tp('tp_zoe_1', 'c_zoe', 9 * H, 'Country 34: Georgia 🇬🇪 Strangers fed me khachapuri twice before noon. I may never leave.', {
      image: ['tbilisi', 1200, 800], likes: ['c_maya', 'c_kenji', 'c_omar', 'c_ava'], reposts: ['c_maya'], views: 2650,
    }),
    tp('tp_zoe_q1', 'c_zoe', 10 * H, 'Kenji makes me want to book a flight every single time. Tokyo in the rain is on the list now. ✈️', {
      quoteOfId: 'tp_kenji_1', likes: ['c_kenji', 'c_maya'], views: 860,
    }),
    tp('tp_ava_2', 'c_ava', 13 * H, 'Rooftop sunset, cold brew, sketchbook. Some evenings just get everything right.', {
      image: ['rooftop', 1200, 900], likes: ['c_maya', 'c_sara', 'c_zoe', 'c_priya'], views: 1530,
    }),
    tp('tp_maya_2', 'c_maya', 16 * H, 'Lisbon is all hills and tiles and light. Moving here was the best scary decision I’ve made.', {
      likes: ['c_zoe', 'c_ava', 'c_omar'], views: 900,
    }),
    tp('tp_rahul_2', 'c_rahul', 20 * H, 'Gully cricket rematch on Sunday. Last time I was out first ball and I have not emotionally recovered. #cricket', {
      likes: ['c_dev', 'c_priya', 'c_leo'], views: 760,
    }),
    tp('tp_kenji_2', 'c_kenji', 1 * D + 2 * H, 'Film tip: shoot the same street at the same time for a week. The street doesn’t change. You do. #photography', {
      likes: ['c_zoe', 'c_maya', 'c_ava', 'c_leo'], reposts: ['c_zoe', 'c_maya'], views: 3380,
    }),
    tp('tp_priya_2', 'c_priya', 1 * D + 6 * H, 'Bharatanatyam practice after a long week. The body remembers what the mind forgets. 💃', {
      image: ['dance', 900, 1200], likes: ['c_sara', 'c_maya', 'c_ava', 'c_omar'], views: 1290,
    }),
    tp('tp_omar_2', 'c_omar', 1 * D + 9 * H, 'Kitchen rule: taste everything, every time. Recipes are suggestions. Your tongue is the boss.', {
      likes: ['c_sara', 'c_priya'], views: 640,
    }),
    tp('tp_sara_2', 'c_sara', 1 * D + 14 * H, 'Finished a novel at 2am and now I have to go about my day as if nothing happened. Book recommendations welcome. #reading', {
      likes: ['c_priya', 'c_ava', 'c_maya'], views: 870,
    }),
    tp('tp_leo_2', 'c_leo', 1 * D + 20 * H, 'Why did the developer go broke? Because he used up all his cache. I’ll see myself out.', {
      likes: ['c_rahul', 'c_dev', 'c_ava', 'c_sara', 'c_kenji'], reposts: ['c_rahul'], views: 1710,
    }),
    tp('tp_dev_2', 'c_dev', 2 * D + 1 * H, 'Talked to 14 customers this week. Thirteen asked for the same boring feature. Guess what we’re building next.', {
      likes: ['c_rahul', 'c_ava'], views: 2890,
    }),
    tp('tp_ava_3', 'c_ava', 2 * D + 5 * H, 'Design crit tip: start with “what is this screen trying to help someone do?” before anyone says the word “font”.', {
      likes: ['c_leo', 'c_dev'], reposts: ['c_leo'], views: 1340,
    }),
    tp('tp_zoe_2', 'c_zoe', 2 * D + 9 * H, 'Developed a roll from last spring and found a photo of my mum laughing that I don’t remember taking. Film is magic. 🎞️', {
      image: ['filmroll', 1200, 800], likes: ['c_kenji', 'c_maya', 'c_priya', 'c_sara', 'c_ava'], views: 1980,
    }),
    tp('tp_maya_3', 'c_maya', 2 * D + 15 * H, 'Recovery day: long walk, big breakfast, zero guilt. Rest is part of the training.', {
      likes: ['c_priya', 'c_zoe'], views: 580,
    }),
    tp('tp_kenji_3', 'c_kenji', 2 * D + 19 * H, 'Learning to say “sumimasen” in exactly the right tone is the real Tokyo life hack.', {
      likes: ['c_zoe', 'c_leo'], views: 720,
    }),
    tp('tp_rahul_3', 'c_rahul', 2 * D + 22 * H, 'Filter coffee, rain on the window, and a bug that finally makes sense. Good morning, Bengaluru. ☕', {
      image: ['filtercoffee', 1200, 900], likes: ['c_priya', 'c_dev', 'c_ava'], views: 1060,
    }),
    tp('tp_omar_3', 'c_omar', 3 * D - 30, 'Teaching my nephew to make hummus. He added three times the garlic. Honestly? Better than mine.', {
      likes: ['c_sara', 'c_priya', 'c_maya'], views: 830,
    }),
  ];
}
