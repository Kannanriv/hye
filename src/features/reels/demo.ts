import type { Comment, Post } from '@/domain/types';

// Simulated reels from demo contacts. Every clip URL below was checked to return HTTP 200
// (samplelib.com, test-videos.co.uk and MDN's CC0 sample clips). Posters come from picsum.

const SAMPLELIB = (s: number) => `https://samplelib.com/preview/mp4/sample-${s}s.mp4`;
const TEST_VIDEOS = (path: string) => `https://test-videos.co.uk/vids/${path}`;
const MDN = (name: string) => `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/${name}.mp4`;
const poster = (seed: string) => `https://picsum.photos/seed/${seed}/720/1280`;

const ALL = ['c_ava', 'c_rahul', 'c_maya', 'c_leo', 'c_sara', 'c_kenji', 'c_priya', 'c_omar', 'c_zoe', 'c_dev'];

interface Seed {
  id: string;
  authorId: string;
  text: string;
  video: string;
  poster: string;
  minutesAgo: number;
  likers: number;
  views: number;
  comments: [string, string, number][]; // authorId, text, minutesAgo
}

const SEEDS: Seed[] = [
  {
    id: 'reel_demo_1', authorId: 'c_maya', text: 'Golden hour on the ridge trail. Legs: gone. Heart: full 🌄 #trailrunning #sundayrun',
    video: SAMPLELIB(10), poster: poster('ridge'), minutesAgo: 35, likers: 8, views: 48_200,
    comments: [['c_sara', 'The light here is unreal', 30], ['c_leo', 'Saturday crew needs to do this one', 22]],
  },
  {
    id: 'reel_demo_2', authorId: 'c_omar', text: 'Ten seconds of calm before the dinner rush. Jellyfish energy only 🪼 #kitchenlife #breathe',
    video: TEST_VIDEOS('jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4'), poster: poster('jelly'), minutesAgo: 80, likers: 6, views: 21_700,
    comments: [['c_priya', 'Needed this today 🙏', 70]],
  },
  {
    id: 'reel_demo_3', authorId: 'c_kenji', text: 'Walked the old harbour at dawn. No filter, just patience. #streetphotography #slowmornings',
    video: SAMPLELIB(15), poster: poster('harbour'), minutesAgo: 60 * 3, likers: 9, views: 63_900,
    comments: [['c_zoe', 'That last frame 😮', 150], ['c_ava', 'Wallpaper material', 120], ['c_dev', 'How early did you get up for this?', 100]],
  },
  {
    id: 'reel_demo_4', authorId: 'c_leo', text: 'Weekend side project: an animated bunny for my keyboard firmware boot screen. Yes, really. #maker #bunny',
    video: TEST_VIDEOS('bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'), poster: poster('bunny'), minutesAgo: 60 * 5, likers: 5, views: 17_300,
    comments: [['c_rahul', 'This is peak Leo', 290], ['c_ava', 'Ship it 🐰', 270]],
  },
  {
    id: 'reel_demo_5', authorId: 'c_priya', text: 'Practising for Saturday’s showcase. One more run-through and then chai ☕💃 #dance #rehearsal',
    video: MDN('friday'), poster: poster('stage'), minutesAgo: 60 * 8, likers: 10, views: 92_400,
    comments: [['c_maya', 'Front row, saving seats!', 460], ['c_sara', 'You’re going to be brilliant', 430]],
  },
  {
    id: 'reel_demo_6', authorId: 'c_zoe', text: 'Shot this on a 20-year-old camcorder at the market in Lisbon. Grain is a feature. #filmlook #travel',
    video: SAMPLELIB(20), poster: poster('lisbon'), minutesAgo: 60 * 14, likers: 7, views: 35_800,
    comments: [['c_kenji', 'The colours though', 800]],
  },
  {
    id: 'reel_demo_7', authorId: 'c_sara', text: 'Spring is here and so is the first loaf with flowers on top 🌸 #sourdough #bakingathome',
    video: MDN('flower'), poster: poster('blossom'), minutesAgo: 60 * 20, likers: 9, views: 27_600,
    comments: [['c_omar', 'Respect. Recipe please?', 1150], ['c_priya', 'Too pretty to eat', 1100]],
  },
  {
    id: 'reel_demo_8', authorId: 'c_dev', text: 'Movie night with the team after shipping v2. Popcorn budget: approved 🍿 #teamwork #shipit',
    video: TEST_VIDEOS('sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4'), poster: poster('cinema'), minutesAgo: 60 * 26, likers: 4, views: 12_900,
    comments: [['c_rahul', 'Congrats on the launch!', 1500]],
  },
  {
    id: 'reel_demo_9', authorId: 'c_ava', text: 'Rooftop sunset, take three. The pigeons insisted on a cameo 🕊️ #rooftop #citylights',
    video: SAMPLELIB(5), poster: poster('rooftop'), minutesAgo: 60 * 30, likers: 8, views: 41_100,
    comments: [['c_leo', 'Pigeon is the real star', 1780], ['c_zoe', 'Take me there', 1760]],
  },
  {
    id: 'reel_demo_10', authorId: 'c_rahul', text: 'Thirty seconds of the long drive home. Cricket highlights on the radio, of course 🏏 #roadtrip #weekendvibes',
    video: SAMPLELIB(30), poster: poster('highway'), minutesAgo: 60 * 44, likers: 6, views: 19_400,
    comments: [['c_dev', 'Drive safe!', 2600]],
  },
];

/** Deterministic pick of likers so counts are stable between launches. */
function likersFor(authorId: string, n: number, offset: number): string[] {
  const others = ALL.filter(id => id !== authorId);
  return Array.from({ length: Math.min(n, others.length) }, (_, i) => others[(i + offset) % others.length]);
}

export function demoReels(now: number): Post[] {
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  return SEEDS.map((s, i) => {
    const comments: Comment[] = s.comments.map(([authorId, text, m], j) => ({ id: `${s.id}_c${j}`, authorId, text, createdAt: iso(m) }));
    return {
      id: s.id,
      kind: 'reel',
      authorId: s.authorId,
      text: s.text,
      media: [{ kind: 'video', uri: s.video, poster: s.poster, aspectRatio: 16 / 9 }],
      createdAt: iso(s.minutesAgo),
      likes: likersFor(s.authorId, s.likers, i),
      reposts: [],
      comments,
      saved: false,
      views: s.views,
      audience: 'everyone',
      simulated: true,
    };
  });
}
