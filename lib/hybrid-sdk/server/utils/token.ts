import { maskToken, hashToken } from '../../common/utils/token';
import { DesensitizedToken } from '../types/token';

export const getDesensitizedToken = (token: string): DesensitizedToken => {
  return { maskedToken: maskToken(token), hashedToken: hashToken(token) };
};
