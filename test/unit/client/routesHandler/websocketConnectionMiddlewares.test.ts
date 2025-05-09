import { getCraCompatibleTypes } from '../../../../lib/hybrid-sdk/client/routesHandler/websocketConnectionMiddlewares';

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
