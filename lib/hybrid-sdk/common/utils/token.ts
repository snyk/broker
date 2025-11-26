import crypto from 'crypto';

export function hashToken(token: string): string {
  const shasum = crypto.createHash('sha256');
  shasum.update(token);
  return shasum.digest('hex');
}

export function maskToken(token?: string) {
  if (!token || token === '') {
    return '';
  }

  return token.slice(0, 4) + '-...-' + token.slice(-4);
}

export function maskSCMToken(token?: string) {
  if (!token || token === '') {
    return '';
  }

  return token.slice(0, 3) + '****' + token.slice(-3);
}

export const extractBrokerTokenFromUrl = (urlString: string) => {
  const regex = /\/broker\/([a-z0-9-]+)\//;
  return urlString.match(regex)?.[1] ?? null;
};
