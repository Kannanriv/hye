import { router } from 'expo-router';

import { SplitInbox } from '@/components/SplitInbox';
import { Button, IconButton } from '@/components/ui';

export default function InboxScreen() {
  return (
    <SplitInbox
      title="Inbox"
      tabs={['all', 'unread', 'personal', 'groups', 'connected', 'imported', 'archived']}
      headerActions={
        <>
          <IconButton icon="search" label="Search all messages" onPress={() => router.push('/search')} />
          <IconButton icon="download-outline" label="Import chat history" onPress={() => router.push('/import')} />
          <IconButton icon="create-outline" label="New conversation" color="accent" onPress={() => router.push('/new-chat')} />
        </>
      }
      emptyAction={<Button label="Import a WhatsApp chat" icon="download-outline" compact onPress={() => router.push('/import')} />}
    />
  );
}
