const test = require('node:test');
const assert = require('node:assert/strict');
const { gmailVariantRegex } = require('../lib/emailMatch');

const same = (registered, fromGoogle) => assert.ok(gmailVariantRegex(fromGoogle).test(registered), `${registered} should match ${fromGoogle}`);
const differ = (registered, fromGoogle) => assert.ok(!gmailVariantRegex(fromGoogle).test(registered), `${registered} must NOT match ${fromGoogle}`);

test('every spelling of one Gmail mailbox matches', () => {
  same('john.doe@gmail.com', 'johndoe@gmail.com');
  same('johndoe@gmail.com', 'john.doe@gmail.com');
  same('johndoe+gym@gmail.com', 'johndoe@gmail.com');
  same('j.o.h.n.d.o.e@gmail.com', 'johndoe@gmail.com');
  same('johndoe@googlemail.com', 'johndoe@gmail.com');
  same('johndoe@gmail.com', 'johndoe@gmail.com');
});

test('different mailboxes never match', () => {
  differ('johndoe2@gmail.com', 'johndoe@gmail.com');
  differ('xjohndoe@gmail.com', 'johndoe@gmail.com');
  differ('johndoe@gmail.com.evil.com', 'johndoe@gmail.com');
  differ('johndoe@yahoo.com', 'johndoe@gmail.com');
  differ('john-doe@gmail.com', 'johndoe@gmail.com');
});

test('non-Gmail addresses and junk are left to the exact-match rule', () => {
  assert.equal(gmailVariantRegex('me@company.com'), null);
  assert.equal(gmailVariantRegex('me@outlook.com'), null);
  assert.equal(gmailVariantRegex(''), null);
  assert.equal(gmailVariantRegex(null), null);
  assert.equal(gmailVariantRegex('+@gmail.com'), null);
  assert.equal(gmailVariantRegex('a@b@gmail.com'), null);
});

test('special characters are escaped, not interpreted', () => {
  const rx = gmailVariantRegex('a(b)*@gmail.com');
  assert.ok(rx.test('a(b)*@gmail.com'));
  assert.ok(!rx.test('ab@gmail.com'));
});

test('a very long local part cannot be used for regex abuse', () => {
  assert.equal(gmailVariantRegex(`${'a'.repeat(65)}@gmail.com`), null);
  const t = Date.now(); gmailVariantRegex(`${'a'.repeat(64)}@gmail.com`).test(`${'a'.repeat(64)}!@gmail.com`);
  assert.ok(Date.now() - t < 50);
});
