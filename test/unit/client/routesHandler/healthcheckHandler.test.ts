import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import httpMock, { MockResponse } from 'node-mocks-http';
import primus from 'primus';
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
