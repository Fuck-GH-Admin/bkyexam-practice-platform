import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const hexPattern = /^[0-9a-f]+$/i;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, keyLength)) as Buffer;

  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  try {
    const parts = encodedHash.split('$');
    if (parts.length !== 3) {
      return false;
    }

    const [scheme, salt, hash] = parts;
    if (
      scheme !== 'scrypt' ||
      !salt ||
      !hash ||
      salt.length % 2 !== 0 ||
      hash.length % 2 !== 0 ||
      !hexPattern.test(salt) ||
      !hexPattern.test(hash)
    ) {
      return false;
    }

    const expectedHash = Buffer.from(hash, 'hex');
    if (expectedHash.length === 0) {
      return false;
    }

    const actualHash = (await scrypt(password, salt, expectedHash.length)) as Buffer;

    return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}
