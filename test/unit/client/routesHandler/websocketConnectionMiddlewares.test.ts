import {
  getCraCompatibleTypes,
  websocketConnectionSelectorMiddleware,
} from '../../../../lib/hybrid-sdk/client/routesHandler/websocketConnectionMiddlewares';
import { getConfig } from '../../../../lib/hybrid-sdk/common/config/config';
import httpMocks from 'node-mocks-http';
import { NextFunction } from 'express';

jest.mock('../../../../lib/hybrid-sdk/common/config/config');
jest.mock('../../../../lib/hybrid-sdk/client/utils/socketHelpers', () => ({
  isWebsocketConnOpen: jest.fn(),
}));

const mockedGetConfig = getConfig as jest.Mock;

describe('getCraCompatibleTypes', () => {
  it('should return an empty array if connections is empty', () => {
    const config = {
      connections: {},
      CRA_COMPATIBLE_TYPES: ['artifactory-cr', 'digitalocean-cr'],
    };
    expect(getCraCompatibleTypes(config)).toEqual([]);
  });

  it('should return an empty array if no connection types match CRA_COMPATIBLE_TYPES', () => {
    const config = {
      connections: {
        conn1: { type: 'github' },
        conn2: { type: 'gitlab' },
      },
      CRA_COMPATIBLE_TYPES: ['artifactory-cr', 'digitalocean-cr'],
    };
    expect(getCraCompatibleTypes(config)).toEqual([]);
  });

  it('should return an array of matching types', () => {
    const config = {
      connections: {
        conn1: { type: 'artifactory-cr' },
        conn2: { type: 'digitalocean-cr' },
        conn3: { type: 'github-cr' },
      },
      CRA_COMPATIBLE_TYPES: ['artifactory-cr', 'github-cr'],
    };
    expect(getCraCompatibleTypes(config)).toEqual([
      'artifactory-cr',
      'github-cr',
    ]);
  });
});

describe('websocketConnectionSelectorMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.resetAllMocks();
    next = jest.fn();
  });

  describe('universal broker mode - container registry requests', () => {
    it('should route to connection by identifier when identifier header is present', () => {
      const identifier1 = 'connection-identifier-1';
      const identifier2 = 'connection-identifier-2';

      const websocketConnections = [
        {
          identifier: identifier1,
          supportedIntegrationType: 'ecr',
        },
        {
          identifier: identifier2,
          supportedIntegrationType: 'ecr',
        },
      ];

      mockedGetConfig.mockReturnValue({
        universalBrokerEnabled: true,
        CRA_COMPATIBLE_TYPES: ['ecr', 'acr', 'gcr'],
      });

      const req = httpMocks.createRequest({
        path: '/api/v1/recurring-tests/dependencies',
        headers: {
          'snyk-broker-connection-identifier': identifier2,
        },
      });
      const res = httpMocks.createResponse();
      res.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req, res, next);

      expect(res.locals.websocket).toEqual(websocketConnections[1]);
      expect(next).toHaveBeenCalled();
    });

    it('should return 500 error when identifier header is missing', () => {
      const websocketConnections = [
        {
          identifier: 'connection-identifier-1',
          supportedIntegrationType: 'ecr',
        },
      ];

      mockedGetConfig.mockReturnValue({
        universalBrokerEnabled: true,
        CRA_COMPATIBLE_TYPES: ['ecr', 'acr', 'gcr'],
      });

      const req = httpMocks.createRequest({
        path: '/api/v1/recurring-tests/dependencies',
        headers: {},
      });
      const res = httpMocks.createResponse();
      res.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req, res, next);

      expect(res.statusCode).toBe(500);
      expect(res._getData()).toContain('missing connection identifier');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 error when connection not found by identifier', () => {
      const websocketConnections = [
        {
          identifier: 'connection-identifier-1',
          supportedIntegrationType: 'ecr',
        },
      ];

      mockedGetConfig.mockReturnValue({
        universalBrokerEnabled: true,
        CRA_COMPATIBLE_TYPES: ['ecr', 'acr', 'gcr'],
      });

      const req = httpMocks.createRequest({
        path: '/api/v1/recurring-tests/dependencies',
        headers: {
          'snyk-broker-connection-identifier': 'non-existent-identifier',
        },
      });
      const res = httpMocks.createResponse();
      res.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req, res, next);

      expect(res.statusCode).toBe(404);
      expect(res._getData()).toContain('Connection not found');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 505 error when connection type is not CRA-compatible', () => {
      const identifier = 'connection-identifier-1';
      const websocketConnections = [
        {
          identifier: identifier,
          supportedIntegrationType: 'github', // Not CRA-compatible
        },
      ];

      mockedGetConfig.mockReturnValue({
        universalBrokerEnabled: true,
        CRA_COMPATIBLE_TYPES: ['ecr', 'acr', 'gcr'],
      });

      const req = httpMocks.createRequest({
        path: '/api/v1/recurring-tests/dependencies',
        headers: {
          'snyk-broker-connection-identifier': identifier,
        },
      });
      const res = httpMocks.createResponse();
      res.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req, res, next);

      expect(res.statusCode).toBe(505);
      expect(res._getData()).toContain('not compatible');
      expect(next).not.toHaveBeenCalled();
    });

    it('should correctly route multiple ECR registries by identifier', () => {
      const identifier1 = 'ecr-registry-1';
      const identifier2 = 'ecr-registry-2';

      const websocketConnections = [
        {
          identifier: identifier1,
          supportedIntegrationType: 'ecr',
        },
        {
          identifier: identifier2,
          supportedIntegrationType: 'ecr',
        },
      ];

      mockedGetConfig.mockReturnValue({
        universalBrokerEnabled: true,
        CRA_COMPATIBLE_TYPES: ['ecr', 'acr', 'gcr'],
      });

      // Test routing to first ECR registry
      const req1 = httpMocks.createRequest({
        path: '/api/v2/import/done',
        headers: {
          'snyk-broker-connection-identifier': identifier1,
        },
      });
      const res1 = httpMocks.createResponse();
      res1.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req1, res1, next);

      expect(res1.locals.websocket).toEqual(websocketConnections[0]);
      expect(next).toHaveBeenCalledTimes(1);

      // Test routing to second ECR registry
      const req2 = httpMocks.createRequest({
        path: '/v1/import/app',
        headers: {
          'snyk-broker-connection-identifier': identifier2,
        },
      });
      const res2 = httpMocks.createResponse();
      res2.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req2, res2, next);

      expect(res2.locals.websocket).toEqual(websocketConnections[1]);
      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-universal broker mode', () => {
    it('should use first connection when universal broker is disabled', () => {
      const websocketConnections = [
        {
          identifier: 'connection-1',
          supportedIntegrationType: 'ecr',
        },
        {
          identifier: 'connection-2',
          supportedIntegrationType: 'ecr',
        },
      ];

      mockedGetConfig.mockReturnValue({
        universalBrokerEnabled: false,
      });

      const {
        isWebsocketConnOpen,
      } = require('../../../../lib/hybrid-sdk/client/utils/socketHelpers');
      (isWebsocketConnOpen as jest.Mock).mockReturnValue(true);

      const req = httpMocks.createRequest({
        path: '/api/v1/recurring-tests/dependencies',
      });
      const res = httpMocks.createResponse();
      res.locals.websocketConnections = websocketConnections;

      websocketConnectionSelectorMiddleware(req, res, next);

      expect(res.locals.websocket).toEqual(websocketConnections[0]);
      expect(next).toHaveBeenCalled();
    });
  });
});
