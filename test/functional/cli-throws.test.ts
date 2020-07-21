const cli = require('../../cli/exec');

describe('CLI throws', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('when missing broker id', (done) => {
    expect(() => {
      cli({ _: ['client'] });
    }).toThrowError('BROKER_TOKEN');
    done();
  });

  it('when missing broker server', (done) => {
    process.env.BROKER_TOKEN = '1';

    expect(() => {
      cli({ _: ['client'] });
    }).toThrowError('BROKER_SERVER_URL');
    done();
  });
});
