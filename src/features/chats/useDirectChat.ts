import { useCallback } from 'react';

import { newId } from '@/domain/hash';
import type { Conversation } from '@/domain/types';
import { useStore } from '@/state/store';

/** Returns a function that finds (unarchiving if needed) or creates the 1:1 chat with a contact and returns its id. */
export function useDirectChat() {
  const { state, dispatch } = useStore();
  return useCallback(
    (contactId: string): string | null => {
      const existing = state.conversations.find(c => c.kind === 'direct' && c.origin === 'native' && c.members.some(m => m.contactId === contactId));
      if (existing) {
        if (existing.archived) dispatch({ type: 'patchConversation', id: existing.id, patch: { archived: false } });
        return existing.id;
      }
      const contact = state.contacts.find(c => c.id === contactId);
      if (!contact) return null;
      const now = new Date().toISOString();
      const conv: Conversation = {
        id: newId('cv'), kind: 'direct', origin: 'native', source: 'hye', title: contact.displayName,
        members: [{ contactId: 'me', role: 'admin' }, { contactId, role: 'member' }], createdAt: now, lastActivityAt: now, lastReadAt: now,
        pinned: false, muted: false, archived: false, markedUnread: false, retention: state.privacy.defaultRetention,
      };
      dispatch({ type: 'upsertConversation', conversation: conv });
      return conv.id;
    },
    [state.conversations, state.contacts, state.privacy.defaultRetention, dispatch],
  );
}
