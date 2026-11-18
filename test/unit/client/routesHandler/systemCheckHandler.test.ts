import { Request } from 'express';
import httpMock, { MockResponse } from 'node-mocks-http';
import { systemCheckHandler } from '../../../../lib/hybrid-sdk/client/routesHandler/systemCheckHandler';
import { getConfigForConnections } from '../../../../lib/hybrid-sdk/common/config/universal';
import { ConnectionConfig } from '../../../../lib/hybrid-sdk/client/types/config';
import { validateConnection } from '../../../../lib/hybrid-sdk/client/utils/connectionValidation';

jest.mock('../../../../lib/hybrid-sdk/common/config/universal');
jest.mock('../../../../lib/hybrid-sdk/client/utils/connectionValidation');

const mockedGetConfigForConnections = jest.mocked(getConfigForConnections);
const mockedValidateConnection = jest.mocked(validateConnection);

const scmConfig = (name: string): ConnectionConfig => ({
  type: 'github',
  GITHUB_API: 'api.github.com',
  validations: [
    {
      url: 'https://$GITHUB_API/user',
      auth: { type: 'header', name: 'Authorization', value: 'token abc' },
    },
  ],
  name,
});

const registryConfig = (type = 'nexus-cr'): ConnectionConfig => ({
  type,
  CR_AGENT_URL: 'https://agent.local:8081',
  validations: undefined as any,
});

const notValidatedMessage = (type: string) =>
  `No validations defined for connection type ${type}; not validated.`;

const callHandler = async () => {
  const res = httpMock.createResponse({
    locals: { clientOpts: { config: { universalBrokerEnabled: true } } },
  });
  const json = jest.spyOn(res, 'json');
  const status = jest.spyOn(res, 'status');
  await systemCheckHandler({} as Request, res);
  return { res: res as MockResponse<any>, json, status };
};

describe('client/routesHandler', () => {
  describe('systemCheckHandler() in universal broker mode', () => {
    beforeEach(() => {
      mockedValidateConnection.mockReset();
      mockedGetConfigForConnections.mockReset();
    });

    describe('with only connections that define no validations', () => {
      it('responds 200 with a not-validated result for a registry connection', async () => {
        mockedGetConfigForConnections.mockReturnValue(
          new Map([['my registry', registryConfig()]]),
        );

        const { res } = await callHandler();

        expect(res.statusCode).toEqual(200);
        expect(res._getJSONData()).toEqual([
          {
            connectionName: 'my registry',
            validated: false,
            skipped: true,
            results: [],
            message: notValidatedMessage('nexus-cr'),
          },
        ]);
        expect(mockedValidateConnection).not.toHaveBeenCalled();
      });

      it.each([
        'acr',
        'artifactory-cr',
        'container-registry-agent',
        'digitalocean-cr',
        'docker-hub',
        'ecr',
        'gcr',
        'github-cr',
        'gitlab-cr',
        'google-artifact-cr',
        'harbor-cr',
        'nexus-cr',
        'quay-cr',
      ])('responds for connection type %s', async (type) => {
        mockedGetConfigForConnections.mockReturnValue(
          new Map([['my registry', registryConfig(type)]]),
        );

        const { res } = await callHandler();

        expect(res.statusCode).toEqual(200);
        expect(res._getJSONData()).toMatchObject([
          {
            validated: false,
            skipped: true,
            message: notValidatedMessage(type),
          },
        ]);
      });

      it('treats an empty validations list the same way (workload)', async () => {
        mockedGetConfigForConnections.mockReturnValue(
          new Map([
            ['my workload', { type: 'workload', validations: [] as any[] }],
          ]),
        );

        const { res } = await callHandler();

        expect(res.statusCode).toEqual(200);
        expect(res._getJSONData()).toEqual([
          {
            connectionName: 'my workload',
            validated: false,
            skipped: true,
            results: [],
            message: notValidatedMessage('workload'),
          },
        ]);
        expect(mockedValidateConnection).not.toHaveBeenCalled();
      });

      it('does not modify the connection config', async () => {
        const config = registryConfig();
        mockedGetConfigForConnections.mockReturnValue(
          new Map([['my registry', config]]),
        );

        await callHandler();

        expect(config.validations).toBeUndefined();
      });
    });

    describe('with SCM and registry connections together', () => {
      beforeEach(() => {
        mockedValidateConnection.mockResolvedValue({
          passing: true,
          data: [{ url: 'https://api.github.com/user', statusCode: 200 }],
        });
      });

      it.each([
        ['SCM first', ['my scm', 'my registry']],
        ['registry first', ['my registry', 'my scm']],
        ['registry in between', ['my scm', 'my registry', 'my other scm']],
      ])('reports every connection in order (%s)', async (_label, names) => {
        const configs = {
          'my scm': scmConfig('my scm'),
          'my other scm': scmConfig('my other scm'),
          'my registry': registryConfig(),
        };
        mockedGetConfigForConnections.mockReturnValue(
          new Map(names.map((name) => [name, configs[name]])),
        );

        const { res } = await callHandler();

        expect(res.statusCode).toEqual(200);
        const body = res._getJSONData();
        expect(body.map((r) => r.connectionName)).toEqual(names);
        for (const result of body) {
          if (result.connectionName === 'my registry') {
            expect(result).toMatchObject({ validated: false, skipped: true });
          } else {
            expect(result).toEqual({
              connectionName: result.connectionName,
              validated: true,
              results: [
                { url: 'https://api.github.com/user', statusCode: 200 },
              ],
            });
          }
        }
        expect(mockedValidateConnection).toHaveBeenCalledTimes(
          names.filter((n) => n !== 'my registry').length,
        );
      });

      it('expands placeholders for the SCM connection before validating', async () => {
        mockedGetConfigForConnections.mockReturnValue(
          new Map<string, any>([
            ['my registry', registryConfig()],
            ['my scm', scmConfig('my scm')],
          ]),
        );

        await callHandler();

        expect(mockedValidateConnection).toHaveBeenCalledTimes(1);
        expect(mockedValidateConnection.mock.calls[0][0].validations).toEqual([
          expect.objectContaining({ url: 'https://api.github.com/user' }),
        ]);
      });

      it('responds 500 when an SCM validation fails and still reports the registry', async () => {
        mockedValidateConnection.mockResolvedValue({
          passing: false,
          data: [{ url: 'https://api.github.com/user', statusCode: 401 }],
        });
        mockedGetConfigForConnections.mockReturnValue(
          new Map<string, any>([
            ['my registry', registryConfig()],
            ['my scm', scmConfig('my scm')],
          ]),
        );

        const { res } = await callHandler();

        expect(res.statusCode).toEqual(500);
        expect(res._getJSONData()).toEqual([
          expect.objectContaining({
            connectionName: 'my registry',
            validated: false,
            skipped: true,
          }),
          {
            connectionName: 'my scm',
            validated: false,
            results: [{ url: 'https://api.github.com/user', statusCode: 401 }],
            message:
              'Validation failed, please review connection details for my scm.',
          },
        ]);
      });
    });

    describe('sending the response', () => {
      it('sends exactly one response for a registry-only deployment', async () => {
        mockedGetConfigForConnections.mockReturnValue(
          new Map([['my registry', registryConfig()]]),
        );

        const { res, json, status } = await callHandler();

        expect(res._isEndCalled()).toBe(true);
        expect(status).toHaveBeenCalledTimes(1);
        expect(json).toHaveBeenCalledTimes(1);
      });

      it('sends exactly one response for a mixed deployment', async () => {
        mockedValidateConnection.mockResolvedValue({ passing: true, data: [] });
        mockedGetConfigForConnections.mockReturnValue(
          new Map<string, any>([
            ['my registry', registryConfig()],
            ['my scm', scmConfig('my scm')],
          ]),
        );

        const { json, status } = await callHandler();

        expect(status).toHaveBeenCalledTimes(1);
        expect(json).toHaveBeenCalledTimes(1);
      });

      it('responds with an empty list when there are no connections', async () => {
        mockedGetConfigForConnections.mockReturnValue(new Map());

        const { res, json } = await callHandler();

        expect(res.statusCode).toEqual(200);
        expect(res._getJSONData()).toEqual([]);
        expect(json).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the check throws unexpectedly', () => {
      it('responds 500 once if reading the connection config throws', async () => {
        mockedGetConfigForConnections.mockImplementation(() => {
          throw new Error('config exploded');
        });

        const { res, json, status } = await callHandler();

        expect(res.statusCode).toEqual(500);
        expect(res._getJSONData()).toEqual({
          message: 'System check failed unexpectedly, see the broker logs.',
        });
        expect(status).toHaveBeenCalledTimes(1);
        expect(json).toHaveBeenCalledTimes(1);
      });

      it('responds 500 once if validating a connection throws', async () => {
        mockedValidateConnection.mockRejectedValue(new Error('boom'));
        mockedGetConfigForConnections.mockReturnValue(
          new Map([['my scm', scmConfig('my scm')]]),
        );

        const { res, json, status } = await callHandler();

        expect(res.statusCode).toEqual(500);
        expect(res._getJSONData()).toEqual({
          message: 'System check failed unexpectedly, see the broker logs.',
        });
        expect(status).toHaveBeenCalledTimes(1);
        expect(json).toHaveBeenCalledTimes(1);
      });

      it('does not leak the error message in the response', async () => {
        mockedGetConfigForConnections.mockImplementation(() => {
          throw new Error('secret-token-123');
        });

        const { res } = await callHandler();

        expect(JSON.stringify(res._getJSONData())).not.toContain(
          'secret-token-123',
        );
      });

      it('does not respond a second time once headers are sent', async () => {
        mockedGetConfigForConnections.mockImplementation(() => {
          throw new Error('config exploded');
        });
        const res = httpMock.createResponse({
          locals: { clientOpts: { config: { universalBrokerEnabled: true } } },
        });
        Object.defineProperty(res, 'headersSent', { get: () => true });
        const json = jest.spyOn(res, 'json');

        await expect(
          systemCheckHandler({} as Request, res),
        ).resolves.not.toThrow();

        expect(json).not.toHaveBeenCalled();
      });
    });
  });
});
