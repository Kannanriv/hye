import { router } from 'expo-router';

import { SplitInbox } from '@/components/SplitInbox';
import { Button, IconButton } from '@/components/ui';

/** Conversations that live in hye itself (no imported or connected sources). */
export default function MessagesScreen() {
  return (
    <SplitInbox
      title="Messages"
      nativeOnly
      tabs={['all', 'unread', 'personal', 'groups']}
      headerActions={<IconButton icon="create-outline" label="New conversation" color="accent" onPress={() => router.push('/new-chat')} />}
      emptyAction={<Button label="Start a conversation" icon="create-outline" compact onPress={() => router.push('/new-chat')} />}
    />
  );
}
