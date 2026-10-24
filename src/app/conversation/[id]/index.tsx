import { router, useLocalSearchParams } from 'expo-router';

import { ConversationView } from '@/components/ConversationView';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationView conversationId={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
