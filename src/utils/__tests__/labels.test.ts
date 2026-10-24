import { platformForUrl, RETENTION_LABEL } from '../labels';

describe('platformForUrl', () => {
  it.each([
    ['https://www.instagram.com/p/abc/', 'instagram'],
    ['https://instagram.com/user', 'instagram'],
    ['https://x.com/someone/status/1', 'x'],
    ['https://twitter.com/someone', 'x'],
    ['https://mobile.twitter.com/someone', 'x'],
    ['https://www.facebook.com/post/1', 'messenger'],
    ['https://fb.com/1', 'messenger'],
    ['https://t.me/channel', 'telegram'],
    ['https://wa.me/15551234567', 'whatsapp'],
    ['https://chat.whatsapp.com/invite', 'whatsapp'],
    ['HTTPS://WWW.INSTAGRAM.COM/P/ABC', 'instagram'],
    ['https://example.com/?u=instagram.com', 'web'],
    ['https://notinstagram.com/', 'web'],
    ['https://instagram.com.evil.example/', 'web'],
    ['https://box.com/x', 'web'],
    ['instagram.com/no-scheme', 'web'],
    ['', 'web'],
  ])('%s -> %s', (url, expected) => {
    expect(platformForUrl(url)).toBe(expected);
  });
});

describe('RETENTION_LABEL', () => {
  it('has a label for every policy', () => {
    expect(RETENTION_LABEL).toEqual({ off: 'Keep forever', '24h': '24 hours', '7d': '7 days', '90d': '90 days' });
  });
});
