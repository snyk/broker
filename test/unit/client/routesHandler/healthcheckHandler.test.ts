import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import httpMock, { MockResponse } from 'node-mocks-http';
import primus from 'primus';

const mockGetReestablishmentState = jest.fn();
jest.mock(
  '../../../../lib/hybrid-sdk/client/connectionsManager/reestablishment',
  () => ({
    getReestablishmentState: (...args: any[]) =>
      mockGetReestablishmentState(...args),
  }),
);

import {
  healthcheckData,
  healthCheckHandler,
} from '../../../../lib/hybrid-sdk/client/routesHandler/healthcheckHandler';
import { WebSocketConnection } from '../../../../lib/hybrid-sdk/client/types/client';

describe('client/routesHandler', () => {
  describe('healthCheckHandler()', () => {
    it('should return 200 status code if all checks are ok', async () => {
      const res = httpMock.createResponse({
        locals: {
          websocketConnections: [
            createTestWebSocketConnectionResponse({}),
            createTestWebSocketConnectionResponse({}),
            createTestWebSocketConnectionResponse({}),
          ],
        },
      });

      const healthCheckResult = healthCheckHandler({} as Request, res);
      expect(healthCheckResult.statusCode).toEqual(200);

      const healthCheckResultData = (
        healthCheckResult as MockResponse<any>
      )._getJSONData() as healthcheckData[];
      expect(healthCheckResultData).toHaveLength(3);
    });

    it('should return 500 status code if all checks are not ok', async () => {
      const res = httpMock.createResponse({
        locals: {
          websocketConnections: [
            createTestWebSocketConnectionResponse({
              readyState: primus.Spark.CLOSED,
            }),
            createTestWebSocketConnectionResponse({
              readyState: primus.Spark.CLOSED,
            }),
          ],
        },
      });

      const healthCheckResult = healthCheckHandler({} as Request, res);
      expect(healthCheckResult.statusCode).toEqual(500);
    });

    it('should return 200 status code if not all checks are not ok', async () => {
      const res = httpMock.createResponse({
        locals: {
          websocketConnections: [
            createTestWebSocketConnectionResponse({
              readyState: primus.Spark.OPEN,
            }),
            createTestWebSocketConnectionResponse({
              readyState: primus.Spark.CLOSED,
            }),
          ],
        },
      });

      const healthCheckResult = healthCheckHandler({} as Request, res);
      expect(healthCheckResult.statusCode).toEqual(200);
    });

    describe('configured-vs-established (universal)', () => {
      beforeEach(() => {
        mockGetReestablishmentState.mockReset();
      });

      const clientOptsWith = (connections: Record<string, any>) => ({
        config: { connections },
      });

      it('reports a missing connection as degraded/reestablishing but stays 200', () => {
        mockGetReestablishmentState.mockReturnValue(undefined);
        const res = httpMock.createResponse({
          locals: {
            websocketConnections: [
              createTestWebSocketConnectionResponse({ identifier: 'conn-B' }),
            ],
            clientOpts: clientOptsWith({
              'conn-B': { identifier: 'conn-B' },
              'conn-A': { identifier: 'conn-A' },
            }),
          },
        });

        const result = healthCheckHandler({} as Request, res);
        expect(result.statusCode).toEqual(200);

        const data = (
          result as MockResponse<any>
        )._getJSONData() as healthcheckData[];
        const missing = data.find((d) => d.friendlyName === 'conn-A');
        expect(missing).toMatchObject({
          ok: false,
          websocketConnectionOpen: false,
          degraded: true,
          reestablishment: 'reestablishing',
        });
      });

      it('returns 500 when a missing connection has given up', () => {
        mockGetReestablishmentState.mockReturnValue('gave_up');
        const res = httpMock.createResponse({
          locals: {
            websocketConnections: [
              createTestWebSocketConnectionResponse({ identifier: 'conn-B' }),
            ],
            clientOpts: clientOptsWith({
              'conn-B': { identifier: 'conn-B' },
              'conn-A': { identifier: 'conn-A' },
            }),
          },
        });

        const result = healthCheckHandler({} as Request, res);
        expect(result.statusCode).toEqual(500);

        const data = (
          result as MockResponse<any>
        )._getJSONData() as healthcheckData[];
        expect(data.find((d) => d.friendlyName === 'conn-A')).toMatchObject({
          reestablishment: 'gave_up',
        });
      });

      it('ignores disabled or identifier-less configured connections', () => {
        mockGetReestablishmentState.mockReturnValue(undefined);
        const res = httpMock.createResponse({
          locals: {
            websocketConnections: [
              createTestWebSocketConnectionResponse({ identifier: 'conn-B' }),
            ],
            clientOpts: clientOptsWith({
              'conn-B': { identifier: 'conn-B' },
              'conn-disabled': { identifier: 'x', isDisabled: true },
              'conn-noid': {},
            }),
          },
        });

        const result = healthCheckHandler({} as Request, res);
        expect(result.statusCode).toEqual(200);
        const raw = (result as MockResponse<any>)._getJSONData();
        const data: healthcheckData[] = Array.isArray(raw) ? raw : [raw];
        expect(
          data.some(
            (d) =>
              d.friendlyName === 'conn-disabled' ||
              d.friendlyName === 'conn-noid',
          ),
        ).toBe(false);
      });
    });
  });

  function createTestWebSocketConnectionResponse({
    identifier = randomUUID(),
    readyState = primus.Spark.OPEN,
  }: {
    identifier?: string;
    readyState?: number;
  }): WebSocketConnection {
    return {
      identifier,
      readyState: readyState,
      url: { href: `http://localhost/primus/${identifier}` },
      socket: { transport: { name: 'websocket' } },
      friendlyName: identifier,
    } as WebSocketConnection;
  }
});
