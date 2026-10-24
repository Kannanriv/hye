import { useMemo, useRef } from 'react';
import { Share } from 'react-native';

import { useHaptics } from '@/components/premium';
import type { Post } from '@/domain/types';
import { useStore } from '@/state/store';
import type { PhotoCardHandlers } from './PhotoPostCard';
import { storyImages } from './stories';
import { go } from './util';

/** Stable handlers for photo cards (feed and detail), with haptics on meaningful actions. */
export function usePhotoActions(): PhotoCardHandlers {
  const { state, dispatch } = useStore();
  const buzz = useHaptics();
  const postsRef = useRef(state.posts);
  postsRef.current = state.posts;
  const buzzRef = useRef(buzz);
  buzzRef.current = buzz;

  return useMemo<PhotoCardHandlers>(() => {
    const likedByMe = (id: string) => postsRef.current.find(p => p.id === id)?.likes.includes('me') ?? false;
    return {
      onLike: id => {
        buzzRef.current(likedByMe(id) ? 'select' : 'tap');
        dispatch({ type: 'toggleLike', id });
      },
      onDoubleLike: id => {
        buzzRef.current('tap');
        if (!likedByMe(id)) dispatch({ type: 'toggleLike', id });
      },
      onComment: id => go.photo(id, true),
      onShare: (post: Post) => {
        buzzRef.current('select');
        const first = post.media[0]?.uri;
        Share.share({ message: [post.text, first].filter(Boolean).join('\n\n') }).catch(() => undefined);
      },
      onSave: id => {
        buzzRef.current('select');
        dispatch({ type: 'toggleSave', id });
      },
      onOpen: id => go.photo(id),
      onAuthor: authorId => {
        if (storyImages(authorId).length) go.story(authorId);
      },
    };
  }, [dispatch]);
}
