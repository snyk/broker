import crypto from 'crypto';

export function hashToken(token: string): string {
  const shasum = crypto.createHash('sha256');
  shasum.update(token);
  return shasum.digest('hex');
}

export function maskToken(token) {
  if (!token || token === '') {
    return '';
  }

  return token.slice(0, 4) + '-...-' + token.slice(-4);
}
