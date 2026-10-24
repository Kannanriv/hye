import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const sha256 = (input: string | Buffer): Buffer => createHash('sha256').update(input).digest();
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
