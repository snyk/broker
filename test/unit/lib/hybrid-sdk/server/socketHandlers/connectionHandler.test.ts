import { EventEmitter } from 'events';
import { ISpark } from 'primus';

jest.mock(
  '../../../../../../lib/hybrid-sdk/server/socketHandlers/closeHandler',
  () => ({ handleConnectionCloseOnSocket: jest.fn() }),
);
jest.mock(
  '../../../../../../lib/hybrid-sdk/server/socketHandlers/identifyHandler',
  () => ({ handleIdentifyOnSocket: jest.fn() }),
);
jest.mock('../../../../../../lib/hybrid-sdk/common/utils/metrics', () => ({
  incrementSocketCloseReasonCount: jest.fn(),
}));
jest.mock(
  '../../../../../../lib/hybrid-sdk/server/socketHandlers/terminateHandler',
  () => ({ handleTerminationSignalOnSocket: jest.fn() }),
);
jest.mock(
  '../../../../../../lib/hybrid-sdk/server/socketHandlers/errorHandler',
  () => ({ handleSocketError: jest.fn() }),
);

import { incrementSocketCloseReasonCount } from '../../../../../../lib/hybrid-sdk/common/utils/metrics';
import { handleSocketConnection } from '../../../../../../lib/hybrid-sdk/server/socketHandlers/connectionHandler';
import { handleConnectionCloseOnSocket } from '../../../../../../lib/hybrid-sdk/server/socketHandlers/closeHandler';

const TOKEN = 'test-token';

const createSpark = (): ISpark => {
  const socket = new EventEmitter() as EventEmitter & {
    request: { uri: { pathname: string } };
    send: jest.Mock;
  };
  socket.request = { uri: { pathname: `/primus/${TOKEN}/` } };
  socket.send = jest.fn();
  return socket as unknown as ISpark;
};

describe('handleSocketConnection terminal events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles only the first terminal event for a socket', () => {
    const socket = createSpark();
    handleSocketConnection(socket);

    (socket as unknown as EventEmitter).emit('close');
    (socket as unknown as EventEmitter).emit('end');
    (socket as unknown as EventEmitter).emit('timeout');

    expect(incrementSocketCloseReasonCount).toHaveBeenCalledTimes(1);
    expect(incrementSocketCloseReasonCount).toHaveBeenCalledWith('close');
    expect(handleConnectionCloseOnSocket).toHaveBeenCalledTimes(1);
    expect(handleConnectionCloseOnSocket).toHaveBeenCalledWith(
      'close',
      socket,
      TOKEN,
      null,
      false,
    );
  });
});
