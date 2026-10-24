import { router } from 'expo-router';

import { SplitInbox } from '@/components/SplitInbox';
import { IconButton } from '@/components/ui';

export default function ArchiveScreen() {
  return (
    <SplitInbox
      title="Archive"
      initialTab="archived"
      tabs={['archived']}
      headerActions={<IconButton icon="search" label="Search all messages" onPress={() => router.push('/search')} />}
    />
  );
}
