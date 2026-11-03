import httpMocks from 'node-mocks-http';
import primus from 'primus';
import {
  getConfig,
  setConfig,
} from '../../../../lib/hybrid-sdk/common/config/config';
import { hashToken } from '../../../../lib/hybrid-sdk/common/utils/token';
import { getInterpolatedRequest } from '../../../../lib/hybrid-sdk/interpolateRequestWithConfigData';
import { websocketConnectionSelectorMiddleware } from '../../../../lib/hybrid-sdk/client/routesHandler/websocketConnectionMiddlewares';
import { scopeCraCallbackUrl } from '../../../../lib/hybrid-sdk/common/utils/craCallbackRouting';
import { log as logger } from '../../../../lib/logs/logger';

describe('Container registry routing', () => {
  const originalConfig = getConfig();
  const connections = {
    first: {
      type: 'docker-hub',
      identifier: 'broker-token-a',
      CR_AGENT_URL: 'http://agent-a',
      BROKER_CLIENT_URL: 'http://broker-client',
      CR_CREDENTIALS: 'credentials-a',
    },
    second: {
      type: 'docker-hub',
      identifier: 'broker-token-b',
      CR_AGENT_URL: 'http://agent-b',
      BROKER_CLIENT_URL: 'http://broker-client',
      CR_CREDENTIALS: 'credentials-b',
    },
  };
  const config = {
    universalBrokerEnabled: true,
    connections,
    CRA_COMPATIBLE_TYPES: ['docker-hub', 'ecr'],
    brokerClientConfiguration: {
      common: { default: {}, required: {} },
      'docker-hub': { default: {} },
    },
  };
  const sockets = Object.values(connections).flatMap((connection) =>
    ['primary', 'secondary'].map((role) => ({
      identifier: connection.identifier,
      supportedIntegrationType: connection.type,
      role,
      readyState: primus.Spark.OPEN,
    })),
  );
  const parameter = 'snyk-broker-connection';

  beforeEach(() => setConfig(structuredClone(config)));
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => setConfig(originalConfig));

  function route(url: string, availableSockets = sockets) {
    const req = httpMocks.createRequest({ method: 'POST', url });
    req.requestId = 'container-registry-callback-request';
    const res = httpMocks.createResponse();
    res.locals.websocketConnections = availableSockets;
    const next = jest.fn();
    websocketConnectionSelectorMiddleware(req, res, next);
    return { req, res, next };
  }

  function scan(identifier: string | null, callbackPath: string) {
    const payload = {
      url: '/scan',
      headers: {
        'x-broker-var-sub': 'x-snyk-source-credentials',
        'x-snyk-source-credentials': '${CR_CREDENTIALS}',
      },
      body: JSON.stringify({
        callbacks: {
          resultUrl: '${BROKER_CLIENT_URL}' + callbackPath,
          doneUrl: '${BROKER_CLIENT_URL}/api/v2/import/done',
          token: 'callback-token',
        },
        BROKER_VAR_SUB: ['callbacks.resultUrl', 'callbacks.doneUrl'],
      }),
    };
    const request = getInterpolatedRequest(
      identifier,
      {
        method: 'POST',
        origin: '${CR_AGENT_URL}',
        connectionType: 'docker-hub',
      },
      payload,
      {},
      getConfig(),
      'downstream',
    );
    return { request, payload, callbacks: JSON.parse(payload.body).callbacks };
  }

  describe('scan requests', () => {
    it('uses downstream context configuration and logs its connection identifier', () => {
      const debug = jest.spyOn(logger, 'debug').mockImplementation();
      getConfig().brokerClientConfiguration['docker-hub'].default.CR_AGENT_URL =
        '';
      getConfig().connections.second.contexts = {
        configured: { CR_AGENT_URL: 'http://context-agent' },
      };
      const request = getInterpolatedRequest(
        connections.second.identifier,
        { method: 'POST', origin: '${CR_AGENT_URL}' },
        {
          url: '/scan',
          headers: { 'x-snyk-broker-context-id': 'configured' },
        },
        {},
        getConfig(),
        'downstream',
      );
      expect(request.url).toBe('http://context-agent/scan');
      expect(debug).toHaveBeenCalledWith(
        {
          url: '/scan',
          connectionIdentifier: connections.second.identifier,
          contextId: 'configured',
        },
        'Using specific context for request.',
      );
    });

    it.each(['unknown', 'disabled'])(
      'rejects a downstream request with a %s context',
      (contextId) => {
        getConfig().connections.second.contexts = {
          disabled: { isDisabled: true },
        };
        expect(() =>
          getInterpolatedRequest(
            connections.second.identifier,
            { method: 'POST', origin: '${CR_AGENT_URL}' },
            {
              url: '/scan',
              headers: { 'x-snyk-broker-context-id': contextId },
            },
            {},
            getConfig(),
            'downstream',
          ),
        ).toThrow(`Unable to find context ${contextId}`);
      },
    );

    it.each(Object.values(connections))(
      'uses $identifier configuration and scopes its callbacks',
      (connection) => {
        const { request, payload, callbacks } = scan(
          connection.identifier,
          '/api/v2/import/result?job=one%20two',
        );
        expect(request.url).toBe(connection.CR_AGENT_URL + '/scan');
        expect(payload.headers['x-snyk-source-credentials']).toBe(
          connection.CR_CREDENTIALS,
        );
        for (const callback of [callbacks.resultUrl, callbacks.doneUrl]) {
          expect(new URL(callback).searchParams.get(parameter)).toBe(
            hashToken(connection.identifier),
          );
          expect(callback).not.toContain(connection.identifier);
        }
        expect(new URL(callbacks.resultUrl).searchParams.get('job')).toBe(
          'one two',
        );
        expect(callbacks.token).toBe('callback-token');
        expect(JSON.parse(payload.body)).not.toHaveProperty('BROKER_VAR_SUB');
      },
    );

    it('preserves a single connection callback URL', () => {
      setConfig({ ...config, connections: { first: connections.first } });
      const { callbacks } = scan(
        connections.first.identifier,
        '/api/v2/import/result?job=123',
      );
      expect(callbacks.resultUrl).toBe(
        'http://broker-client/api/v2/import/result?job=123',
      );
    });

    it('preserves Classic interpolation and callback URLs', () => {
      setConfig({ ...connections.first, universalBrokerEnabled: false });
      const { request, callbacks, payload } = scan(
        null,
        '/api/v2/import/result',
      );
      expect(request.url).toBe('http://agent-a/scan');
      expect(callbacks.resultUrl).toBe(
        'http://broker-client/api/v2/import/result',
      );
      expect(payload.headers['x-snyk-source-credentials']).toBe(
        'credentials-a',
      );
    });
  });

  describe('callback URL preservation', () => {
    it('routes an AppRisk callback with its version query intact', () => {
      const callbackPath = '/rest/scan/result?version=2024-10-15';
      const { callbacks } = scan(connections.second.identifier, callbackPath);
      expect(callbacks.resultUrl).toBe(
        `http://broker-client${callbackPath}&${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
      );
      const { req, res, next } = route(
        callbacks.resultUrl.slice('http://broker-client'.length),
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket.identifier).toBe(
        connections.second.identifier,
      );
      expect(req.url).toBe(callbackPath);
    });

    it.each([
      '/api/v2/import/result',
      '/api/v2/import/result?',
      '/api/v2/import/result?job=one%20two&job=one+two',
      '/api/v2/import/result?x=%2f&x=%2F&literal=%2B&x=~',
      '/api/v2/import/result?empty=&flag&key=first&key=second',
      '/api/v2/import/result?bad=%FF&partial=%&invalid=%GG',
      '/api/v2/import/result?first=1&&last=2&',
      '/api/v2/import/result?next=one?two',
      '/api/v2/import/%72esult?job=123',
      '/api/v2/import/result/../result?job=123',
    ])('round-trips %s without changing unrelated bytes', (requestTarget) => {
      const callbackUrl = scopeCraCallbackUrl(
        'http://broker-client' + requestTarget,
        connections.second.identifier,
        getConfig(),
      );
      const separator = requestTarget.includes('?') ? '&' : '?';
      expect(callbackUrl).toBe(
        `http://broker-client${requestTarget}${separator}${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
      );
      const { req, res, next } = route(
        callbackUrl.slice('http://broker-client'.length),
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket.identifier).toBe(
        connections.second.identifier,
      );
      expect(req.url).toBe(requestTarget);
    });

    it('inserts the selector before a fragment without changing the callback URL', () => {
      const requestTarget = '/api/v2/import/result?job=one%20two';
      const callbackUrl = scopeCraCallbackUrl(
        `http://broker-client${requestTarget}#fragment?value`,
        connections.second.identifier,
        getConfig(),
      );
      expect(callbackUrl).toBe(
        `http://broker-client${requestTarget}&${parameter}=${hashToken(
          connections.second.identifier,
        )}#fragment?value`,
      );
      const { req, next } = route(
        callbackUrl.slice('http://broker-client'.length).split('#')[0],
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.url).toBe(requestTarget);
    });

    it.each([
      'snyk%2Dbroker%2dconnection',
      '%73nyk-broker-connection',
      'snyk-broker-%63onnection',
    ])('removes an encoded selector named %s', (encodedName) => {
      const requestTarget = '/api/v2/import/result?job=one%20two&bad=%FF';
      const callbackUrl = scopeCraCallbackUrl(
        'http://broker-client' + requestTarget,
        connections.second.identifier,
        getConfig(),
      ).replace(`${parameter}=`, `${encodedName}=`);
      const { req, res, next } = route(
        callbackUrl.slice('http://broker-client'.length),
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket.identifier).toBe(
        connections.second.identifier,
      );
      expect(req.url).toBe(requestTarget);
    });

    it.each([parameter, '%73nyk-broker-connection'])(
      'rejects an existing selector named %s instead of replacing it',
      (existingName) => {
        const callbackUrl = scopeCraCallbackUrl(
          `http://broker-client/api/v2/import/result?${existingName}=${hashToken(
            connections.second.identifier,
          )}`,
          connections.second.identifier,
          getConfig(),
        ).replace(`${parameter}=`, 'snyk%2Dbroker-connection=');
        const { res, next } = route(
          callbackUrl.slice('http://broker-client'.length),
        );
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
        expect(res.locals.websocket).toBeUndefined();
      },
    );

    it.each([
      { selector: '%FF', status: 400 },
      { selector: 'invalid', status: 400 },
      { selector: '0'.repeat(64), status: 404 },
    ])(
      'rejects encoded-name selectors with value $selector',
      ({ selector, status }) => {
        const { res, next } = route(
          `/api/v2/import/result?%73nyk-broker-connection=${selector}`,
        );
        expect(res.statusCode).toBe(status);
        expect(next).not.toHaveBeenCalled();
        expect(res.locals.websocket).toBeUndefined();
      },
    );
  });

  describe('asynchronous callbacks', () => {
    it('routes the legacy discover callback using its emitted URL', () => {
      const payload = {
        url: '/discover',
        headers: {},
        body: JSON.stringify({
          callbackUrl:
            '${BROKER_CLIENT_URL}/api/v1/recurring-tests/dependencies',
          BROKER_VAR_SUB: ['callbackUrl'],
        }),
      };
      getInterpolatedRequest(
        connections.second.identifier,
        { method: 'POST', origin: '${CR_AGENT_URL}' },
        payload,
        {},
        getConfig(),
        'downstream',
      );
      const url = new URL(JSON.parse(payload.body).callbackUrl);
      const { res, next } = route(url.pathname + url.search);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket.identifier).toBe(
        connections.second.identifier,
      );
    });

    it('leaves non-registry webhook URLs unchanged', () => {
      setConfig({
        ...config,
        connections: {
          ...connections,
          scm: {
            identifier: 'scm-token',
            type: 'github',
            BROKER_CLIENT_URL: 'http://broker-client',
          },
        },
      });
      const payload = {
        url: '/hooks',
        headers: {},
        body: JSON.stringify({
          url: '${BROKER_CLIENT_URL}/webhook/github/123',
          BROKER_VAR_SUB: ['url'],
        }),
      };
      getInterpolatedRequest(
        'scm-token',
        { method: 'POST', origin: 'https://github.com' },
        payload,
        {},
        getConfig(),
        'downstream',
      );
      expect(JSON.parse(payload.body).url).toBe(
        'http://broker-client/webhook/github/123',
      );
    });

    it('rejects a disabled connection even while its socket remains open', () => {
      getConfig().connections.second.isDisabled = true;
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
      );
      expect(res.statusCode).toBe(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects an unknown selector with only one eligible connection', () => {
      setConfig({ ...config, connections: { first: connections.first } });
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
      );
      expect(res.statusCode).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a selector belonging to a non-registry connection', () => {
      getConfig().connections.scm = { identifier: 'scm-token', type: 'github' };
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken('scm-token')}`,
      );
      expect(res.statusCode).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects duplicate configured identities instead of choosing a configuration', () => {
      getConfig().connections.second.identifier = connections.first.identifier;
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken(
          connections.first.identifier,
        )}`,
      );
      expect(res.statusCode).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a different integration type sharing the selected identifier', () => {
      getConfig().connections.scm = {
        identifier: connections.second.identifier,
        type: 'github',
      };
      const collidingSocket = {
        ...sockets[2],
        supportedIntegrationType: 'github',
      };
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
        [collidingSocket],
      );
      expect(res.statusCode).toBe(503);
      expect(next).not.toHaveBeenCalled();
      expect(res.locals.websocket).toBeUndefined();
    });

    it.each([
      {
        reasonCode: 'cra_callback_invalid_selector',
        url: `/api/v2/import/result?${parameter}=invalid`,
        configure: () => undefined,
        availableSockets: sockets,
      },
      {
        reasonCode: 'cra_callback_connection_not_found',
        url: `/api/v2/import/result?${parameter}=${'0'.repeat(64)}`,
        configure: () => undefined,
        availableSockets: sockets,
      },
      {
        reasonCode: 'cra_callback_no_compatible_connection',
        url: '/api/v2/import/result',
        configure: () =>
          setConfig({
            ...config,
            connections: { scm: { identifier: 'scm-token', type: 'github' } },
          }),
        availableSockets: sockets,
      },
      {
        reasonCode: 'cra_callback_ambiguous_connection',
        url: '/api/v2/import/result',
        configure: () => undefined,
        availableSockets: sockets,
      },
      {
        reasonCode: 'cra_callback_connection_unavailable',
        url: `/api/v2/import/result?${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
        configure: () => undefined,
        availableSockets: sockets.slice(0, 2),
      },
    ])(
      'logs one redacted warning for $reasonCode',
      ({ reasonCode, url, configure, availableSockets }) => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation();
        configure();
        const { next } = route(url, availableSockets);
        expect(next).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          {
            requestId: 'container-registry-callback-request',
            reasonCode,
          },
          'Rejected container registry callback routing request.',
        );
        expect(JSON.stringify(warn.mock.calls)).not.toContain(url);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(
          connections.second.identifier,
        );
      },
    );

    it.each(Object.values(connections))(
      'selects $identifier from the emitted URL without request headers',
      (connection) => {
        const { callbacks } = scan(
          connection.identifier,
          '/api/v2/import/result?job=123',
        );
        for (const callback of [callbacks.resultUrl, callbacks.doneUrl]) {
          const url = new URL(callback);
          const { req, res, next } = route(url.pathname + url.search);
          expect(next).toHaveBeenCalledTimes(1);
          expect(res.locals.websocket.identifier).toBe(connection.identifier);
          expect(req.url).not.toContain(parameter);
          expect(req.headers).toEqual({});
          expect(req.url).toBe(
            url.pathname + (url.searchParams.has('job') ? '?job=123' : ''),
          );
        }
      },
    );

    it.each([
      '',
      'unknown',
      connections.first.identifier,
      `${hashToken(connections.first.identifier)}&${parameter}=${hashToken(
        connections.second.identifier,
      )}`,
    ])('rejects an invalid selector %s without fallback', (selector) => {
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${selector}`,
      );
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(next).not.toHaveBeenCalled();
      expect(res.locals.websocket).toBeUndefined();
    });

    it('rejects an unscoped callback when multiple connections are configured', () => {
      const { res, next } = route('/api/v2/import/result');
      expect(res.statusCode).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('keeps missing identity ambiguous when only one connection is online', () => {
      const { res, next } = route('/api/v2/import/result', sockets.slice(0, 2));
      expect(res.statusCode).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('uses an open secondary of the selected connection', () => {
      const availableSockets = sockets.map((socket) => ({
        ...socket,
        readyState:
          socket.role === 'primary' ? primus.Spark.CLOSED : primus.Spark.OPEN,
      }));
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
        availableSockets,
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket).toBe(availableSockets[3]);
    });

    it('rejects an unavailable connection without using another connection', () => {
      const { res, next } = route(
        `/api/v2/import/result?${parameter}=${hashToken(
          connections.second.identifier,
        )}`,
        sockets.slice(0, 2),
      );
      expect(res.statusCode).toBe(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('routes the allowed code lineage callback using its emitted URL', () => {
      const { callbacks } = scan(
        connections.second.identifier,
        '/rest/scan/result',
      );
      const url = new URL(callbacks.resultUrl);
      const { res, next } = route(url.pathname + url.search);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket.identifier).toBe(
        connections.second.identifier,
      );
    });

    it('preserves unscoped single-connection callbacks with two socket roles', () => {
      setConfig({ ...config, connections: { first: connections.first } });
      const { res, next } = route('/api/v2/import/result', sockets.slice(0, 2));
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket.identifier).toBe(
        connections.first.identifier,
      );
    });

    it('preserves Classic socket selection', () => {
      setConfig({ universalBrokerEnabled: false });
      const { res, next } = route('/api/v2/import/result', sockets.slice(0, 2));
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.locals.websocket).toBe(sockets[0]);
    });
  });
});
