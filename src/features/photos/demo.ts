import type { Comment, Post, PostMedia } from '@/domain/types';

// Simulated photo posts from demo contacts. Every post is flagged `simulated` and shown with a
// Demo pill. Images come from picsum with a fixed seed per post so they stay the same across runs.

type Ratio = 0.8 | 1;
type DemoComment = [authorId: string, text: string, minutesAfter: number];

// Location-style subtitle for demo posts (posts have no location field; this stays demo-only).
const DEMO_PHOTO_PLACES: Record<string, string> = {};

/** Place line for a demo photo post, if it has one. */
export function demoPhotoPlace(postId: string): string | undefined {
  if (!postId.startsWith('ph_')) return undefined;
  if (!Object.keys(DEMO_PHOTO_PLACES).length) demoPhotoPosts(Date.now());
  return DEMO_PHOTO_PLACES[postId];
}

const image = (seed: string, ratio: Ratio): PostMedia => ({
  kind: 'image',
  uri: `https://picsum.photos/seed/${seed}/1080/${ratio === 1 ? 1080 : 1350}`,
  aspectRatio: ratio,
});

function photo(now: number, spec: {
  id: string; by: string; hoursAgo: number; text: string; place: string; seeds: string[]; ratio?: Ratio;
  likes: string[]; comments?: DemoComment[]; views: number; saved?: boolean;
}): Post {
  const created = now - spec.hoursAgo * 3_600_000;
  DEMO_PHOTO_PLACES[spec.id] = spec.place;
  const comments: Comment[] = (spec.comments ?? []).map(([authorId, text, after], i) => ({
    id: `${spec.id}_cm${i}`,
    authorId,
    text,
    createdAt: new Date(Math.min(now - 60_000, created + after * 60_000)).toISOString(),
  }));
  return {
    id: spec.id,
    kind: 'photo',
    authorId: spec.by,
    text: spec.text,
    media: spec.seeds.map(s => image(s, spec.ratio ?? 0.8)),
    createdAt: new Date(created).toISOString(),
    likes: spec.likes,
    reposts: [],
    comments,
    saved: spec.saved ?? false,
    views: spec.views,
    audience: 'contacts',
    simulated: true,
  };
}

export function demoPhotoPosts(now: number): Post[] {
  const p = (spec: Parameters<typeof photo>[1]) => photo(now, spec);
  return [
    p({
      id: 'ph_maya_trail', by: 'c_maya', hoursAgo: 0.6, place: 'Sintra hills, Portugal', views: 412,
      text: 'Sunrise 14k along the ridge. Legs are jelly, heart is full. Thank you to the stranger who shared her orange at the summit 🍊',
      seeds: ['maya-trail-1', 'maya-trail-2', 'maya-trail-3'],
      likes: ['c_ava', 'c_priya', 'c_zoe', 'c_omar', 'c_leo'],
      comments: [['c_priya', 'The light in the second one!! 😍', 12], ['c_ava', 'You make me want to start running. Almost.', 20]],
    }),
    p({
      id: 'ph_omar_tagine', by: 'c_omar', hoursAgo: 2.2, place: 'Home kitchen', views: 388, ratio: 1,
      text: 'Lamb tagine with preserved lemons, my grandmother’s way. Slow food for a slow Sunday. Recipe in the comments if anyone asks nicely.',
      seeds: ['omar-tagine-1', 'omar-tagine-2'],
      likes: ['c_sara', 'c_rahul', 'c_kenji', 'c_maya', 'c_dev', 'c_ava'],
      comments: [['c_sara', 'Asking very nicely 🙏', 9], ['c_omar', 'Sending it to you now, Sara ❤️', 15], ['c_rahul', 'Save me a plate next time!', 40]],
    }),
    p({
      id: 'ph_kenji_neon', by: 'c_kenji', hoursAgo: 4.5, place: 'Shinjuku, Tokyo', views: 640,
      text: 'Rain makes the city honest. Every sign reflected twice.',
      seeds: ['kenji-neon-1', 'kenji-neon-2', 'kenji-neon-3', 'kenji-neon-4'],
      likes: ['c_zoe', 'c_leo', 'c_maya', 'c_dev', 'c_priya', 'c_ava', 'c_rahul'],
      comments: [['c_zoe', 'Film or digital? The grain is gorgeous.', 18], ['c_kenji', 'Digital, but I miss film every day.', 30]],
    }),
    p({
      id: 'ph_ava_rooftop', by: 'c_ava', hoursAgo: 7, place: 'Rooftop, Singapore', views: 295, ratio: 1,
      text: 'Tuesday’s design review ended early, so naturally we ended up here. Golden hour hits different with good people.',
      seeds: ['ava-rooftop-1'],
      likes: ['c_rahul', 'c_leo', 'c_sara'],
      comments: [['c_leo', 'Still thinking about that mango drink', 25]],
    }),
    p({
      id: 'ph_sara_sourdough', by: 'c_sara', hoursAgo: 10, place: 'Sara’s kitchen', views: 270,
      text: 'Loaf number 47. Finally got the ear I’ve been chasing. Patience is an ingredient.',
      seeds: ['sara-bread-1', 'sara-bread-2'],
      likes: ['c_omar', 'c_ava', 'c_priya', 'c_maya'],
      comments: [['c_omar', 'That crumb! Chef’s kiss.', 14], ['c_maya', 'Can I trade you a run for a slice?', 60]],
    }),
    p({
      id: 'ph_priya_rehearsal', by: 'c_priya', hoursAgo: 14, place: 'Dance studio, Kochi', views: 330,
      text: 'Last rehearsal before the showcase. Bharatanatyam has taught me more about discipline than med school ever did.',
      seeds: ['priya-dance-1', 'priya-dance-2', 'priya-dance-3'],
      likes: ['c_maya', 'c_rahul', 'c_sara', 'c_ava', 'c_omar'],
      comments: [['c_rahul', 'Break a leg! (Metaphorically, Dr. Nair.)', 22], ['c_sara', 'So proud of you 💛', 45]],
    }),
    p({
      id: 'ph_zoe_lisbon', by: 'c_zoe', hoursAgo: 19, place: 'Alfama, Lisbon', views: 512,
      text: 'Country 34. Got lost on purpose and found a tiny café with the kindest owner. Tram 28 can wait.',
      seeds: ['zoe-lisbon-1', 'zoe-lisbon-2', 'zoe-lisbon-3'],
      likes: ['c_maya', 'c_kenji', 'c_ava', 'c_dev'],
      comments: [['c_maya', 'You’re in MY city! Coffee tomorrow?', 8], ['c_zoe', 'Yes!! I’ll message you', 20]],
    }),
    p({
      id: 'ph_leo_desk', by: 'c_leo', hoursAgo: 23, place: 'Home office', views: 210, ratio: 1,
      text: 'New keyboard day. It’s not an addiction if the switches are tactile. (It might be an addiction.)',
      seeds: ['leo-desk-1', 'leo-desk-2'],
      likes: ['c_rahul', 'c_dev'],
      comments: [['c_rahul', 'Pun count today: zero. Are you okay?', 30], ['c_leo', 'I’m keying it together', 34]],
    }),
    p({
      id: 'ph_rahul_cricket', by: 'c_rahul', hoursAgo: 27, place: 'Cubbon Park, Bengaluru', views: 305,
      text: 'Sunday cricket with the office crew. We lost by 4 runs and still celebrated like we won the cup.',
      seeds: ['rahul-cricket-1', 'rahul-cricket-2'],
      likes: ['c_ava', 'c_leo', 'c_priya', 'c_dev', 'c_omar'],
      comments: [['c_priya', 'Who dropped the catch? 👀', 50]],
    }),
    p({
      id: 'ph_dev_whiteboard', by: 'c_dev', hoursAgo: 31, place: 'Our tiny office', views: 188, ratio: 1,
      text: 'Six months ago this was a napkin sketch. Today the first 100 people used it. Grateful for a team that cares about the details.',
      seeds: ['dev-office-1'],
      likes: ['c_rahul', 'c_leo', 'c_ava'],
      comments: [['c_ava', 'Huge! Proud to have seen the napkin version.', 35]],
    }),
    p({
      id: 'ph_maya_market', by: 'c_maya', hoursAgo: 36, place: 'Feira da Ladra, Lisbon', views: 266,
      text: 'Saturday market finds: a 70s lens, three postcards, and a conversation with a man who has sold buttons here for 40 years.',
      seeds: ['maya-market-1', 'maya-market-2'],
      likes: ['c_zoe', 'c_kenji', 'c_sara'],
      comments: [['c_kenji', 'Which lens? Show us test shots!', 40]],
    }),
    p({
      id: 'ph_kenji_temple', by: 'c_kenji', hoursAgo: 42, place: 'Kamakura', views: 455,
      text: 'Quiet morning before the crowds. Somewhere a bell, somewhere a crow.',
      seeds: ['kenji-temple-1', 'kenji-temple-2'],
      likes: ['c_zoe', 'c_priya', 'c_maya', 'c_ava', 'c_omar', 'c_sara'],
      comments: [['c_zoe', 'Adding this to my list.', 60]],
    }),
    p({
      id: 'ph_omar_market', by: 'c_omar', hoursAgo: 48, place: 'Spice souk, Dubai', views: 342, ratio: 1,
      text: 'Inspiration shopping. Saffron, sumac, dried limes. My bag smells better than my cologne.',
      seeds: ['omar-spice-1', 'omar-spice-2', 'omar-spice-3'],
      likes: ['c_sara', 'c_priya', 'c_rahul', 'c_zoe'],
      comments: [['c_priya', 'Bring back sumac please 🙏', 15]],
    }),
    p({
      id: 'ph_ava_sketches', by: 'c_ava', hoursAgo: 53, place: 'Studio', views: 199,
      text: 'Paper before pixels, always. Twenty sketches, one good idea, and that’s a great day.',
      seeds: ['ava-sketch-1', 'ava-sketch-2'],
      likes: ['c_leo', 'c_dev', 'c_maya'],
      comments: [['c_dev', 'Sketch 14 is the one. Fight me.', 25]],
    }),
    p({
      id: 'ph_sara_books', by: 'c_sara', hoursAgo: 60, place: 'Corner bookshop', views: 176, ratio: 1,
      text: 'Rainy day haul. Two novels, one cookbook, zero regrets. What are you reading this week?',
      seeds: ['sara-books-1'],
      likes: ['c_priya', 'c_ava', 'c_zoe'],
      comments: [['c_priya', 'Just finished a lovely one about a lighthouse keeper. Will lend it!', 30], ['c_ava', 'Re-reading my favourite comfort book ☕', 70]],
    }),
    p({
      id: 'ph_zoe_film', by: 'c_zoe', hoursAgo: 66, place: 'Somewhere in the Alps', views: 380,
      text: 'Developed a roll from last spring. Film makes you wait, and the wait makes it sweeter.',
      seeds: ['zoe-film-1', 'zoe-film-2', 'zoe-film-3', 'zoe-film-4'],
      likes: ['c_kenji', 'c_maya', 'c_leo', 'c_ava', 'c_priya'],
      comments: [['c_kenji', 'Frame 3 is a postcard.', 45]],
    }),
    p({
      id: 'ph_priya_chai', by: 'c_priya', hoursAgo: 72, place: 'Hospital canteen', views: 222, ratio: 1,
      text: 'Night shift done. Chai with the best nurses in the world. Small breaks, big gratitude.',
      seeds: ['priya-chai-1'],
      likes: ['c_rahul', 'c_sara', 'c_omar', 'c_maya'],
      comments: [['c_omar', 'Thank you for what you do 🙏', 20]],
    }),
    p({
      id: 'ph_rahul_monsoon', by: 'c_rahul', hoursAgo: 80, place: 'Coorg', views: 290,
      text: 'Weekend escape. No laptop, three cups of coffee from the estate, and the loudest rain I’ve ever heard.',
      seeds: ['rahul-coorg-1', 'rahul-coorg-2', 'rahul-coorg-3'],
      likes: ['c_priya', 'c_dev', 'c_kenji'],
      comments: [['c_dev', 'No laptop?? Who are you', 55]],
    }),
    p({
      id: 'ph_leo_hike', by: 'c_leo', hoursAgo: 88, place: 'Serra do Mar', views: 160,
      text: 'Touched grass, as instructed by my friends. Can confirm: grass is nice.',
      seeds: ['leo-hike-1', 'leo-hike-2'],
      likes: ['c_ava', 'c_maya', 'c_rahul'],
      comments: [['c_maya', 'Proud of you 😂', 18]],
    }),
    p({
      id: 'ph_dev_sunset', by: 'c_dev', hoursAgo: 96, place: 'Juhu beach, Mumbai', views: 240, ratio: 1,
      text: 'Took a walk instead of a meeting. Best decision of the week.',
      seeds: ['dev-sunset-1'],
      likes: ['c_ava', 'c_rahul', 'c_priya', 'c_zoe'],
    }),
    p({
      id: 'ph_maya_portrait', by: 'c_maya', hoursAgo: 104, place: 'Lagos, Nigeria', views: 410,
      text: 'Home for a week. Took portraits of my aunties and they all demanded retakes. Every single one is perfect.',
      seeds: ['maya-home-1', 'maya-home-2', 'maya-home-3'],
      likes: ['c_priya', 'c_sara', 'c_zoe', 'c_omar', 'c_ava', 'c_kenji'],
      comments: [['c_sara', 'This made me smile so much', 40], ['c_zoe', 'The colours, Maya!', 90]],
    }),
    p({
      id: 'ph_omar_bread', by: 'c_omar', hoursAgo: 112, place: 'Family bakery', views: 205,
      text: 'Fresh khubz from the clay oven at my uncle’s bakery. Some smells are memories.',
      seeds: ['omar-bread-1', 'omar-bread-2'],
      likes: ['c_sara', 'c_maya'],
      comments: [['c_sara', 'Teach me your ways', 35]],
    }),
    p({
      id: 'ph_kenji_cat', by: 'c_kenji', hoursAgo: 118, place: 'Yanaka, Tokyo', views: 530, ratio: 1,
      text: 'The neighbourhood’s most famous resident agreed to one photo. Then left without saying goodbye.',
      seeds: ['kenji-cat-1'],
      likes: ['c_zoe', 'c_ava', 'c_leo', 'c_priya', 'c_sara', 'c_dev', 'c_maya', 'c_rahul'],
      comments: [['c_leo', 'A true celebri-cat', 20], ['c_ava', 'Iconic behaviour', 33]],
    }),
  ];
}

/** Story images per demo contact for the stories row. 3–5 portrait images each. */
export function demoStories(): Record<string, string[]> {
  const story = (who: string, n: number) =>
    Array.from({ length: n }, (_, i) => `https://picsum.photos/seed/story-${who}-${i + 1}/1080/1920`);
  return {
    c_maya: story('maya', 4),
    c_kenji: story('kenji', 5),
    c_ava: story('ava', 3),
    c_omar: story('omar', 4),
    c_zoe: story('zoe', 5),
    c_priya: story('priya', 3),
    c_sara: story('sara', 3),
    c_rahul: story('rahul', 4),
    c_leo: story('leo', 3),
  };
}
