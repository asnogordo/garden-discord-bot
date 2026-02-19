const test = require('node:test');
const assert = require('node:assert/strict');

const { createWarningMessageEmbed } = require('../src/embeds');

const EMBED_FIELD_NAME_LIMIT = 256;
const EMBED_FIELD_VALUE_LIMIT = 1024;

test('createWarningMessageEmbed clamps dynamic fields to Discord limits', () => {
  const veryLong = 'x'.repeat(6000);
  const embed = createWarningMessageEmbed(
    veryLong,
    veryLong,
    veryLong,
    veryLong,
    '123456789012345678',
    veryLong,
    new Set(['chan-1', 'chan-2', 'chan-3']),
    veryLong,
    999,
    veryLong
  );

  const payload = embed.toJSON();
  assert.ok(Array.isArray(payload.fields));
  assert.ok(payload.fields.length > 0);

  for (const field of payload.fields) {
    assert.ok(field.name.length <= EMBED_FIELD_NAME_LIMIT, `Field name too long: ${field.name.length}`);
    assert.ok(field.value.length <= EMBED_FIELD_VALUE_LIMIT, `Field value too long: ${field.value.length}`);
  }
});

test('createWarningMessageEmbed keeps removed message wrapped in spoiler tags', () => {
  const embed = createWarningMessageEmbed(
    '2026-01-01',
    '2026-01-01',
    'Display',
    'username',
    '123456789012345678',
    'RoleA',
    new Set(['chan-1']),
    'secret message',
    1,
    'signal'
  );

  const payload = embed.toJSON();
  const removedMessageField = payload.fields.find(field => field.name === 'Removed Message (click to expand)');
  assert.ok(removedMessageField);
  assert.ok(removedMessageField.value.startsWith('||'));
  assert.ok(removedMessageField.value.endsWith('||'));
});
