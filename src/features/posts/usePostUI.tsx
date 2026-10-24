import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Share } from 'react-native';

import { useHaptics } from '@/components/premium';
import { ActionSheet, ConfirmDialog } from '@/components/ui';
import type { Post } from '@/domain/types';
import { useStore } from '@/state/store';
import { Author, UNKNOWN_AUTHOR, openCompose, openPost, useAuthors } from './helpers';
import type { PostHandlers } from './PostCard';
import { ProfilePeek } from './ProfilePeek';
import { useToast } from './Toast';

/**
 * Everything a screen needs to show interactive posts: stable handlers for PostCard, plus the
 * overlays they open (long-press menu, delete confirmation, profile peek, toast).
 */
export function usePostUI(opts: { onDeleted?: (id: string) => void; toastTop?: number } = {}) {
  const { state, dispatch } = useStore();
  const authors = useAuthors(state);
  const buzz = useHaptics();
  const [toast, showToast] = useToast(opts.toastTop);

  const stateRef = useRef(state);
  stateRef.current = state;
  const authorsRef = useRef(authors);
  authorsRef.current = authors;
  const onDeletedRef = useRef(opts.onDeleted);
  onDeletedRef.current = opts.onDeleted;

  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);

  const find = (id: string): Post | undefined => stateRef.current.posts.find(p => p.id === id);

  const h: PostHandlers = useMemo(() => ({
    open: id => openPost(id),
    avatar: authorId => { buzz('select'); setPeekId(authorId); },
    mention: handle => {
      const a = [...authorsRef.current.values()].find(x => x.handle.toLowerCase() === handle.toLowerCase());
      if (a) { buzz('select'); setPeekId(a.id); }
    },
    menu: id => { buzz('heavy'); setMenuId(id); },
    reply: id => openCompose({ replyTo: id }),
    like: id => {
      const p = find(id);
      buzz(p?.likes.includes('me') ? 'select' : 'tap');
      dispatch({ type: 'toggleLike', id });
    },
    repost: id => {
      const p = find(id);
      buzz(p?.reposts.includes('me') ? 'select' : 'success');
      dispatch({ type: 'toggleRepost', id });
    },
    save: id => {
      const p = find(id);
      buzz('select');
      dispatch({ type: 'toggleSave', id });
      showToast(p?.saved ? 'Removed from bookmarks' : 'Saved to bookmarks', p?.saved ? 'bookmark-outline' : 'bookmark');
    },
    share: id => {
      const p = find(id);
      if (!p) return;
      const a = authorsRef.current.get(p.authorId) ?? UNKNOWN_AUTHOR;
      Share.share({ message: `“${p.text}”\n— ${a.name} (@${a.handle}) on hye` }).catch(() => undefined);
    },
  }), [buzz, dispatch, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const menuPost = menuId ? state.posts.find(p => p.id === menuId) : undefined;
  const menuAuthor: Author = menuPost ? authors.get(menuPost.authorId) ?? UNKNOWN_AUTHOR : UNKNOWN_AUTHOR;
  const confirmPost = confirmId ? state.posts.find(p => p.id === confirmId) : undefined;
  const replyCount = confirmPost ? state.posts.filter(p => p.replyToId === confirmPost.id).length : 0;

  const overlays = (
    <>
      <ActionSheet
        visible={!!menuPost}
        onClose={() => setMenuId(null)}
        title={menuPost ? `${menuAuthor.name}'s post` : undefined}
        actions={menuPost ? [
          {
            label: 'Copy text', icon: 'copy-outline', hidden: !menuPost.text,
            onPress: () => { Clipboard.setStringAsync(menuPost.text).then(() => showToast('Copied to clipboard'), () => undefined); },
          },
          { label: 'Reply', icon: 'chatbubble-outline', onPress: () => openCompose({ replyTo: menuPost.id }) },
          { label: 'Quote post', icon: 'create-outline', onPress: () => openCompose({ quote: menuPost.id }) },
          { label: `View ${menuPost.authorId === 'me' ? 'your' : `${menuAuthor.name.split(' ')[0]}'s`} profile`, icon: 'person-circle-outline', onPress: () => setTimeout(() => setPeekId(menuPost.authorId), 320) },
          // Wait for the sheet to slide away before opening the dialog (two modals at once misbehave on iOS).
          { label: 'Delete post', icon: 'trash-outline', danger: true, hidden: menuPost.authorId !== 'me', onPress: () => setTimeout(() => setConfirmId(menuPost.id), 320) },
        ] : []}
      />
      <ConfirmDialog
        visible={!!confirmPost}
        title="Delete this post?"
        body={`It will be removed from your profile and everyone's feeds. ${replyCount ? `${replyCount === 1 ? 'The 1 reply' : `The ${replyCount} replies`} will stay, marked as replying to a deleted post. ` : ''}This can't be undone.`}
        confirmLabel="Delete post"
        destructive
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (!confirmPost) return;
          dispatch({ type: 'deletePost', id: confirmPost.id });
          buzz('warning');
          setConfirmId(null);
          showToast('Post deleted', 'trash-outline');
          onDeletedRef.current?.(confirmPost.id);
        }}
      />
      <ProfilePeek author={peekId ? authors.get(peekId) ?? null : null} onClose={() => setPeekId(null)} onOpenPost={openPost} />
      {toast}
    </>
  );

  return { h, overlays, authors, showToast };
}
