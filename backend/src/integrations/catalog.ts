import type { SourcePlatform } from '../common/domain.js';

// Integration capability matrix — server copy of ../../../src/integrations/catalog.ts.
// Keep the two in sync. This is a product statement, not a live connection status: no
// external account can be connected yet. Provider policies change; re-verify each entry
// against the provider's current developer terms before building an integration.

export type CapabilityStatus =
  | 'available'      // works today
  | 'planned'        // feasible through official APIs, not built yet
  | 'business-only'  // official API exists only for business / professional accounts
  | 'unavailable';   // no approved way for a third-party app to do this for personal accounts

export interface Capability {
  label: string;
  status: CapabilityStatus;
  note: string;
}

export interface IntegrationInfo {
  platform: Exclude<SourcePlatform, 'hye'>;
  name: string;
  summary: string;
  capabilities: Capability[];
  alternatives: string[];
}

export const INTEGRATIONS: readonly IntegrationInfo[] = [
  {
    platform: 'whatsapp',
    name: 'WhatsApp',
    summary: 'Bring your chat history over using WhatsApp’s own “Export chat” feature. hye never signs in to WhatsApp or reads its encrypted data.',
    capabilities: [
      { label: 'Import chat history', status: 'available', note: 'Upload a .txt or .zip from WhatsApp → Chat → More → Export chat.' },
      { label: 'Live inbox for personal accounts', status: 'unavailable', note: 'WhatsApp does not offer an API for reading personal chats.' },
      { label: 'Business messaging', status: 'business-only', note: 'The WhatsApp Business Platform (Cloud API) is for verified businesses.' },
    ],
    alternatives: ['Import an exported chat', 'Open a chat in WhatsApp with a wa.me link'],
  },
  {
    platform: 'telegram',
    name: 'Telegram',
    summary: 'Telegram Desktop can export chats as JSON. A Telegram importer is next on our roadmap.',
    capabilities: [
      { label: 'Import chat history', status: 'planned', note: 'Telegram Desktop → Settings → Advanced → Export Telegram data (JSON).' },
      { label: 'Live inbox for personal accounts', status: 'unavailable', note: 'Not offered through the Bot API. We won’t ask for your Telegram login.' },
      { label: 'Bots and channels', status: 'planned', note: 'Possible through the official Bot API for bots you own.' },
    ],
    alternatives: ['Export from Telegram Desktop and import later', 'Open chats with t.me links'],
  },
  {
    platform: 'instagram',
    name: 'Instagram',
    summary: 'Messaging APIs cover professional accounts only. Personal DMs can be downloaded from Accounts Center.',
    capabilities: [
      { label: 'Direct messages', status: 'business-only', note: 'Instagram Messaging API requires a professional account and app review.' },
      { label: 'Import message history', status: 'planned', note: 'From “Download your information” (JSON).' },
      { label: 'Feed and posts', status: 'unavailable', note: 'No API gives third-party apps a personal home feed.' },
    ],
    alternatives: ['Save post links to your Social Feed', 'Download your information and import later'],
  },
  {
    platform: 'messenger',
    name: 'Messenger',
    summary: 'The Messenger Platform is for Facebook Pages. Personal chats can be downloaded from Accounts Center.',
    capabilities: [
      { label: 'Page inbox', status: 'business-only', note: 'Messenger Platform supports conversations with Pages you manage.' },
      { label: 'Personal chats', status: 'unavailable', note: 'No API for personal Messenger inboxes.' },
      { label: 'Import message history', status: 'planned', note: 'From “Download your information” (JSON).' },
    ],
    alternatives: ['Download your information and import later'],
  },
  {
    platform: 'x',
    name: 'X',
    summary: 'X offers APIs on paid tiers with strict limits. We’ll only build what the terms allow.',
    capabilities: [
      { label: 'Direct messages', status: 'planned', note: 'Depends on API tier and user-granted OAuth scopes.' },
      { label: 'Posts you’re allowed to see', status: 'planned', note: 'Limited by API tier and rate limits.' },
      { label: 'Import archive', status: 'planned', note: 'From “Download an archive of your data”.' },
    ],
    alternatives: ['Save post links to your Social Feed'],
  },
  {
    platform: 'email',
    name: 'Email',
    summary: 'Email is open by design. Gmail and Microsoft accounts can connect with OAuth, so we never see your password.',
    capabilities: [
      { label: 'Inbox (Gmail, Outlook)', status: 'planned', note: 'OAuth with read scopes you approve; needs the hye backend.' },
      { label: 'Other providers (IMAP)', status: 'planned', note: 'App passwords only, stored encrypted, revocable any time.' },
    ],
    alternatives: ['Forward important emails to yourself in hye'],
  },
];
