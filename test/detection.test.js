const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BASE_ROLE_IDS = process.env.BASE_ROLE_IDS || 'base_role';

const {
  containsUrlShortener,
  detectUrlObfuscation,
  hasDeceptiveUrl
} = require('../src/messageHandlers');

test('containsUrlShortener detects shorteners with protocol', () => {
  assert.equal(containsUrlShortener('Check this https://bit.ly/abc123'), true);
});

test('containsUrlShortener detects shorteners without protocol', () => {
  assert.equal(containsUrlShortener('use bit.ly/abc123 now'), true);
});

test('containsUrlShortener ignores normal URLs', () => {
  assert.equal(containsUrlShortener('official docs https://garden.finance/docs'), false);
});

test('detectUrlObfuscation flags broken scheme formatting', () => {
  const result = detectUrlObfuscation('h t t p s : //evil.com/airdrop');
  assert.equal(result.isObfuscated, true);
  assert.equal(result.hasLineBreaksInUrl || result.hasBrokenScheme, true);
});

test('detectUrlObfuscation allows clean allowed-domain URLs', () => {
  const result = detectUrlObfuscation('https://garden.finance/blog');
  assert.equal(result.isObfuscated, false);
});

test('hasDeceptiveUrl flags lookalike domains', () => {
  assert.equal(hasDeceptiveUrl('Claim now: https://dlscord.com/airdrop'), true);
});

test('hasDeceptiveUrl still flags malicious URL when mixed with allowed URL', () => {
  const content = 'Safe: https://garden.finance docs, scam: https://dlscord.com/claim';
  assert.equal(hasDeceptiveUrl(content), true);
});

test('hasDeceptiveUrl allows only trusted domains', () => {
  const content = 'https://garden.finance and https://x.com/gardenfinance';
  assert.equal(hasDeceptiveUrl(content), false);
});
