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
import { handleIdentifyOnSocket } from '../../../../../../lib/hybrid-sdk/server/socketHandlers/identifyHandler';

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

const createLegacyHandler = () => {
  const handler = jest.fn() as jest.Mock & { dispose: jest.Mock };
  handler.dispose = jest.fn();
  return handler;
};

describe('server socket', () => {
  describe('handleSocketConnection()', () => {
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

    it('disposes only the Legacy response handler owned by the ending socket', () => {
      const firstSocket = createSpark();
      const secondSocket = createSpark();
      const firstHandler = createLegacyHandler();
      const secondHandler = createLegacyHandler();
      (handleIdentifyOnSocket as jest.Mock)
        .mockReturnValueOnce(firstHandler)
        .mockReturnValueOnce(secondHandler);
      handleSocketConnection(firstSocket);
      handleSocketConnection(secondSocket);

      (firstSocket as unknown as EventEmitter).emit('identify', {
        metadata: { clientId: 'first-client' },
      });
      (secondSocket as unknown as EventEmitter).emit('identify', {
        metadata: { clientId: 'second-client' },
      });
      (firstSocket as unknown as EventEmitter).emit('end');

      expect(firstHandler.dispose).toHaveBeenCalledTimes(1);
      expect(firstHandler.dispose).toHaveBeenCalledWith(expect.any(Error));
      expect(secondHandler.dispose).not.toHaveBeenCalled();
      expect(handleConnectionCloseOnSocket).toHaveBeenLastCalledWith(
        'end',
        firstSocket,
        TOKEN,
        'first-client',
        true,
      );
    });

    it('does not dispose the Legacy response handler for application-emittable terminal aliases', () => {
      const socket = createSpark();
      const handler = createLegacyHandler();
      (handleIdentifyOnSocket as jest.Mock).mockReturnValue(handler);
      handleSocketConnection(socket);

      (socket as unknown as EventEmitter).emit('identify', {
        metadata: { clientId: 'client' },
      });
      (socket as unknown as EventEmitter).emit('close');
      (socket as unknown as EventEmitter).emit('destroy');
      (socket as unknown as EventEmitter).emit('timeout');
      (socket as unknown as EventEmitter).emit('disconnection');

      expect(handler.dispose).not.toHaveBeenCalled();

      (socket as unknown as EventEmitter).emit('end');

      expect(handler.dispose).toHaveBeenCalledTimes(1);
    });

    it('replaces and disposes the Legacy response handler after repeated identify', () => {
      const socket = createSpark();
      const firstHandler = createLegacyHandler();
      const secondHandler = createLegacyHandler();
      (handleIdentifyOnSocket as jest.Mock)
        .mockImplementationOnce((_clientData, identifiedSocket: ISpark) => {
          identifiedSocket.on('chunk', firstHandler);
          return firstHandler;
        })
        .mockImplementationOnce((_clientData, identifiedSocket: ISpark) => {
          identifiedSocket.on('chunk', secondHandler);
          return secondHandler;
        });
      handleSocketConnection(socket);

      (socket as unknown as EventEmitter).emit('identify', {
        metadata: { clientId: 'client' },
      });
      (socket as unknown as EventEmitter).emit('identify', {
        metadata: { clientId: 'client' },
      });

      expect(firstHandler.dispose).toHaveBeenCalledTimes(1);
      expect(secondHandler.dispose).not.toHaveBeenCalled();
      expect((socket as unknown as EventEmitter).listeners('chunk')).toEqual([
        secondHandler,
      ]);

      (socket as unknown as EventEmitter).emit('end');

      expect(firstHandler.dispose).toHaveBeenCalledTimes(1);
      expect(secondHandler.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
