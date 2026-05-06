import {
  BrokerAuthError,
  validateBrokerClientCredentials,
} from '../../../../../../lib/hybrid-sdk/server/auth/authHelpers';
import { makeSingleRawRequestToDownstream } from '../../../../../../lib/hybrid-sdk/http/request';

jest.mock('../../../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({ apiHostname: 'https://api.example.com' })),
}));

jest.mock('../../../../../../lib/hybrid-sdk/http/request', () => ({
  makeSingleRawRequestToDownstream: jest.fn(),
}));

jest.mock('../../../../../../lib/logs/logger', () => ({
  log: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockedRequest = makeSingleRawRequestToDownstream as jest.MockedFunction<
  typeof makeSingleRawRequestToDownstream
>;

describe('validateBrokerClientCredentials', () => {
  process.env.GATEWAY_HOSTNAME = 'https://gateway.example.com';
  process.env.GATEWAY_TLS_OPTION_NAME = 'tlsProperty';
  process.env.GATEWAY_TLS_OPTION_VALUE = 'tlsPropertyValue';

  const identifier = 'conn-token';
  const goodHeaders = {
    authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.abc',
    'x-snyk-broker-client-id': 'client-1',
  };

  const ok201 = { statusCode: 201, headers: {}, body: '' };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('header validation (no upstream call)', () => {
    it('throws BrokerAuthError when Authorization is missing', async () => {
      const promise = validateBrokerClientCredentials(
        { 'x-snyk-broker-client-id': 'c' },
        identifier,
      );
      await expect(promise).rejects.toBeInstanceOf(BrokerAuthError);
      await expect(promise).rejects.toMatchObject({
        message: 'Missing required authorization header.',
      });
      expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('throws when scheme is not Bearer', async () => {
      const promise = validateBrokerClientCredentials(
        {
          authorization: 'Basic xyz',
          'x-snyk-broker-client-id': 'c',
        },
        identifier,
      );
      await expect(promise).rejects.toBeInstanceOf(BrokerAuthError);
      await expect(promise).rejects.toMatchObject({
        message: 'Missing required authorization header.',
      });
      expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('throws when x-snyk-broker-client-id is missing', async () => {
      const promise = validateBrokerClientCredentials(
        { authorization: 'Bearer token' },
        identifier,
      );
      await expect(promise).rejects.toBeInstanceOf(BrokerAuthError);
      await expect(promise).rejects.toMatchObject({
        message: 'Missing required authorization header.',
      });
      expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('throws when JWT after Bearer is empty', async () => {
      const promise = validateBrokerClientCredentials(
        {
          authorization: 'Bearer ',
          'x-snyk-broker-client-id': 'c',
        },
        identifier,
      );
      await expect(promise).rejects.toBeInstanceOf(BrokerAuthError);
      await expect(promise).rejects.toMatchObject({
        message: 'Invalid JWT.',
      });
      expect(mockedRequest).not.toHaveBeenCalled();
    });

    it('rejects with BrokerAuthError instance for catch blocks', async () => {
      await expect(
        validateBrokerClientCredentials({}, identifier),
      ).rejects.toBeInstanceOf(BrokerAuthError);
    });
  });

  describe('upstream validate call', () => {
    it('throws BrokerAuthError when upstream returns non-201', async () => {
      mockedRequest.mockResolvedValue({
        statusCode: 403,
        statusText: 'Forbidden',
        headers: {},
        body: '',
      });

      const promise = validateBrokerClientCredentials(goodHeaders, identifier);
      await expect(promise).rejects.toBeInstanceOf(BrokerAuthError);
      await expect(promise).rejects.toMatchObject({
        message: 'Invalid credentials.',
      });
    });

    it('returns brokerClientId, credentials, and default role on 201', async () => {
      mockedRequest.mockResolvedValue(ok201);

      const result = await validateBrokerClientCredentials(
        goodHeaders,
        identifier,
      );

      expect(result).toEqual({
        brokerClientId: 'client-1',
        credentials: 'eyJhbGciOiJIUzI1NiJ9.abc',
        role: '',
      });
    });

    it('returns role from x-snyk-broker-client-role header', async () => {
      mockedRequest.mockResolvedValue(ok201);

      const result = await validateBrokerClientCredentials(
        { ...goodHeaders, 'x-snyk-broker-client-role': 'secondary' },
        identifier,
      );

      expect(result.role).toBe('secondary');
    });

    it('POSTs to the validate endpoint with correct URL, body, and headers', async () => {
      mockedRequest.mockResolvedValue(ok201);

      await validateBrokerClientCredentials(goodHeaders, identifier);

      expect(mockedRequest).toHaveBeenCalledTimes(1);
      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining(
            `/hidden/brokers/connections/${identifier}/auth/validate`,
          ),
          body: JSON.stringify({
            data: {
              type: 'broker_connection',
              attributes: { broker_client_id: 'client-1' },
            },
          }),
          headers: expect.objectContaining({
            authorization: goodHeaders.authorization,
            'Content-type': 'application/vnd.api+json',
          }),
        }),
      );
    });

    it('accepts lowercase bearer scheme', async () => {
      mockedRequest.mockResolvedValue(ok201);

      const headers = {
        authorization: 'bearer opaque-token',
        'x-snyk-broker-client-id': 'client-1',
      };

      const result = await validateBrokerClientCredentials(headers, identifier);

      expect(result.credentials).toBe('opaque-token');
      expect(mockedRequest).toHaveBeenCalled();
    });

    it('forwards x-forwarded-for on upstream request when present as a string', async () => {
      mockedRequest.mockResolvedValue(ok201);

      await validateBrokerClientCredentials(
        {
          ...goodHeaders,
          'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        },
        identifier,
      );

      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-forwarded-for': '203.0.113.5, 10.0.0.1',
          }),
        }),
      );
    });

    it('does not set x-forwarded-for on upstream request when absent', async () => {
      mockedRequest.mockResolvedValue(ok201);

      await validateBrokerClientCredentials(goodHeaders, identifier);

      const passedHeaders = mockedRequest.mock.calls[0][0].headers as Record<
        string,
        unknown
      >;
      expect(
        Object.prototype.hasOwnProperty.call(passedHeaders, 'x-forwarded-for'),
      ).toBe(false);
    });
  });

  describe('GATEWAY_HEADER_NAME / GATEWAY_HEADER_VALUE', () => {
    let savedGatewayHeaderName: string | undefined;
    let savedGatewayHeaderValue: string | undefined;

    beforeEach(() => {
      savedGatewayHeaderName = process.env.GATEWAY_HEADER_NAME;
      savedGatewayHeaderValue = process.env.GATEWAY_HEADER_VALUE;
    });

    afterEach(() => {
      if (savedGatewayHeaderName === undefined) {
        delete process.env.GATEWAY_HEADER_NAME;
      } else {
        process.env.GATEWAY_HEADER_NAME = savedGatewayHeaderName;
      }
      if (savedGatewayHeaderValue === undefined) {
        delete process.env.GATEWAY_HEADER_VALUE;
      } else {
        process.env.GATEWAY_HEADER_VALUE = savedGatewayHeaderValue;
      }
    });

    it('sends gateway headers on validate request when env vars are set', async () => {
      process.env.GATEWAY_HEADER_NAME = 'x-gateway-secret';
      process.env.GATEWAY_HEADER_VALUE = 'gateway-auth-token';
      mockedRequest.mockResolvedValue(ok201);

      await validateBrokerClientCredentials(goodHeaders, identifier);

      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-gateway-secret': 'gateway-auth-token',
          }),
        }),
      );
      const passedHeaders = mockedRequest.mock.calls[0][0].headers as Record<
        string,
        unknown
      >;
      expect(passedHeaders.authorization).toBe(goodHeaders.authorization);
      expect(passedHeaders['Content-type']).toBe('application/vnd.api+json');
    });

    it('still forwards x-forwarded-for when gateway headers are configured', async () => {
      process.env.GATEWAY_HEADER_NAME = 'x-gateway-secret';
      process.env.GATEWAY_HEADER_VALUE = 'gateway-auth-token';
      mockedRequest.mockResolvedValue(ok201);

      await validateBrokerClientCredentials(
        {
          ...goodHeaders,
          'x-forwarded-for': '198.51.100.2',
        },
        identifier,
      );

      expect(mockedRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-gateway-secret': 'gateway-auth-token',
            'x-forwarded-for': '198.51.100.2',
          }),
        }),
      );
    });
  });
});
