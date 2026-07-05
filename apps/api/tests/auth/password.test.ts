import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password';

describe('password hashing', () => {
  it('does not store the plaintext password', async () => {
    const hash = await hashPassword('secret');

    expect(hash).not.toBe('secret');
  });

  it('verifies the original password', async () => {
    const hash = await hashPassword('secret');

    await expect(verifyPassword('secret', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('secret');

    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('returns false for malformed hashes', async () => {
    await expect(verifyPassword('secret', 'not-a-valid-hash')).resolves.toBe(false);
  });

  it('returns false for hashes with extra fields', async () => {
    const hash = await hashPassword('secret');

    await expect(verifyPassword('secret', `${hash}$extra`)).resolves.toBe(false);
  });
});
