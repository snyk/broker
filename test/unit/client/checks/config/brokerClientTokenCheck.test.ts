import { validateBrokerToken } from '../../../../../lib/client/checks/config/brokerTokenCheck';
import { aConfig } from '../../../../helpers/test-factories';

const checks = [
  {
    name: 'should return error check result for broker token validation with no token',
    token: null,
    expectedStatus: 'error',
    expectedMessage: 'Broker Token is required',
  },
  {
    name: 'should return passing check result for broker token validation with a valid uuidv4 string',
    token: 'f55c41e5-ed3d-4c9c-bad3-4c58571e59b1',
    expectedStatus: 'passing',
    expectedMessage: 'Broker Token parsed successfully',
  },
  {
    name: 'should return error check result for broker token validation with a valid uuidv4 string base64 encoded',
    token: 'jU1YzQxZTUtZWQzZC00YzljLWJhZDMtNGM1ODU3MWU1OWIxCg==',
    expectedStatus: 'error',
    expectedMessage:
      'Broker Token in unrecognised format. Ensure Broker Token is correct, and is of form UUIDv4',
  },
  {
    name: 'should return error check result for broker token validation with a valid uuidv4 string but with extra spaces',
    token: 'f55c41e5-ed3d-4c9c-bad3-4c58571e59b1 ',
    expectedStatus: 'error',
    expectedMessage:
      'Broker Token in unrecognised format. Ensure Broker Token is correct, and is of form UUIDv4',
  },
  {
    name: 'should return error check result for broker token validation with a valid uuidv4 string with newline',
    token: 'f55c41e5-ed3d-4c9c-bad3-4c58571e59b1\n',
    expectedStatus: 'error',
    expectedMessage:
      'Broker Token in unrecognised format. Ensure Broker Token is correct, and is of form UUIDv4',
  },
];

describe('client/checks/config', () => {
  describe(`validateBrokerToken()`, () => {
    checks.forEach((check) =>
      it(check.name, async () => {
        const id = `check_${Date.now()}`;
        const config = aConfig({
          BROKER_CLIENT_URL: 'https://broker-client:8000',
          BROKER_TOKEN: check.token,
        });

        const checkResult = await validateBrokerToken(
          { id: id, name: id },
          config,
        );

        expect(checkResult.status).toEqual(check.expectedStatus);
        expect(checkResult.output).toContain(check.expectedMessage);
      }),
    );
  });
});
