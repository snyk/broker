const dotenv = require('dotenv');
import { Fixtures } from '../helpers/fixtures';

const envSingleLine = Fixtures.get(
  '.env-singleline',
  Fixtures.getPathToFixtures('config'),
);
const envMultiLine = Fixtures.get(
  '.env-multiline',
  Fixtures.getPathToFixtures('config'),
);

describe('dotenv', () => {
  it('should correctly parse env file with singleline values', async () => {
    const parsedConfig = dotenv.parse(envSingleLine);

    expect(parsedConfig.BROKER_TOKEN).toEqual('broker token');
    expect(parsedConfig.BROKER_TOKEN_DOUBLE_QUOTES).toEqual(
      'broker token double quotes',
    );
    expect(parsedConfig.BROKER_TOKEN_SINGLE_QUOTES).toEqual(
      'broker token single quotes',
    );
    expect(parsedConfig.BROKER_TOKEN_COMMENTED).toBeFalsy();
  });

  it('should correctly parse env file with multiline values', async () => {
    const parsedConfig = dotenv.parse(envMultiLine);

    expect(parsedConfig.VALUE_MULTILINE_DOUBLE_QUOTES).toEqual(
      'value\nmultiline\ndouble\nquotes',
    );
    expect(parsedConfig.VALUE_MULTILINE_SINGLE_QUOTES).toEqual(
      'value\nmultiline\nsingle\nquotes',
    );
  });
});
