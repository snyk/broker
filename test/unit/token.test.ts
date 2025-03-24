import { randomUUID } from 'node:crypto';
import {
  extractBrokerTokenFromUrl,
  hashToken,
  maskToken,
} from '../../lib/hybrid-sdk/common/utils/token';

describe('token', () => {
  describe('hashToken', () => {
    it('should hash input tokens using sha256', async () => {
      const expectedSha256ForEmptyString =
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const expectedSha256ForTokenWord =
        '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0';

      const hashedTokenForEmptyString = hashToken('');
      const hashedTokenForTokenWord = hashToken('token');

      expect(hashedTokenForEmptyString).toEqual(expectedSha256ForEmptyString);
      expect(hashedTokenForTokenWord).toEqual(expectedSha256ForTokenWord);
    });
  });

  describe('maskToken', () => {
    it('should return empty string if token is empty or null', async () => {
      const maskedTokenForEmpty = maskToken('');
      const maskedTokenForNull = maskToken('');

      expect(maskedTokenForEmpty).toEqual('');
      expect(maskedTokenForNull).toEqual('');
    });

    it('should return four first and last characters when masking', async () => {
      const maskedToken = maskToken('12345');
      const maskedUUIDToken = maskToken('aaaabbbb-0160-4126-a00d-ccccccccdddd');

      expect(maskedToken).toEqual('1234-...-2345');
      expect(maskedUUIDToken).toEqual('aaaa-...-dddd');
    });
  });

  describe('extractBrokerTokenFromUrl', () => {
    it('should extract token successfully', async () => {
      const brokerToken = randomUUID();
      const testUri = `/broker/${brokerToken}/rest/of/path`;

      expect(extractBrokerTokenFromUrl(testUri)).toEqual(brokerToken);
    });

    it('should extract token successfully in full url', async () => {
      const brokerToken = randomUUID();
      const testUri = `http://my.hostname/broker/${brokerToken}/rest/of/path`;

      expect(extractBrokerTokenFromUrl(testUri)).toEqual(brokerToken);
    });

    it('should not extract token for other format', async () => {
      const brokerToken = 'invalidToken';
      const testUri = `/broker/${brokerToken}/rest/of/path`;

      expect(extractBrokerTokenFromUrl(testUri)).toBeNull();
    });

    it('should not extract token for other format in full url', async () => {
      const brokerToken = 'invalidToken';
      const testUri = `http://my.hostname/broker/${brokerToken}/rest/of/path`;

      expect(extractBrokerTokenFromUrl(testUri)).toBeNull();
    });
  });
});
