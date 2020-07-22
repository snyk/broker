import * as cli from '../../cli/exec';

describe('CLI throws', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('when missing broker id', () => {
    expect(() => {
      cli({ _: ['client'] });
    }).toThrowError('BROKER_TOKEN');
  });

  it('when missing broker server', () => {
    process.env.BROKER_TOKEN = '1';

    expect(() => {
      cli({ _: ['client'] });
    }).toThrowError('BROKER_SERVER_URL');
  });
});
