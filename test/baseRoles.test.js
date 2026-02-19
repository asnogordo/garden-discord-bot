const test = require('node:test');
const assert = require('node:assert/strict');

function loadHasBaseRolesOnly(baseRoleIdsEnv) {
  process.env.BASE_ROLE_IDS = baseRoleIdsEnv;

  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/utils')];

  return require('../src/utils').hasBaseRolesOnly;
}

function buildMember({ guildId, roleIds = [] }) {
  const roles = new Map();

  // @everyone role
  roles.set(guildId, { id: guildId, name: '@everyone' });

  for (const roleId of roleIds) {
    roles.set(roleId, { id: roleId, name: roleId });
  }

  return {
    guild: { id: guildId },
    roles: { cache: roles }
  };
}

test('hasBaseRolesOnly returns true when member has only configured base roles', () => {
  const hasBaseRolesOnly = loadHasBaseRolesOnly('base_role,helper_role');
  const member = buildMember({
    guildId: 'guild_1',
    roleIds: ['base_role', 'helper_role']
  });

  assert.equal(hasBaseRolesOnly(member), true);
});

test('hasBaseRolesOnly returns false when member has non-base role', () => {
  const hasBaseRolesOnly = loadHasBaseRolesOnly('base_role,helper_role');
  const member = buildMember({
    guildId: 'guild_1',
    roleIds: ['base_role', 'vip_role']
  });

  assert.equal(hasBaseRolesOnly(member), false);
});

test('hasBaseRolesOnly returns false for members with no configured base role assignments', () => {
  const hasBaseRolesOnly = loadHasBaseRolesOnly('base_role,helper_role');
  const member = buildMember({
    guildId: 'guild_1',
    roleIds: []
  });

  assert.equal(hasBaseRolesOnly(member), false);
});
