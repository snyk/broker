import { Request, Response } from 'express';
import { getDesensitizedToken } from '../utils/token';
import { getSocketConnections } from '../socket';
import { log as logger } from '../../logs/logger';

export const connectionStatusHandler = (req: Request, res: Response) => {
  const token = req.params.token;
  const desensitizedToken = getDesensitizedToken(token);
  const connections = getSocketConnections();
  if (connections.has(token)) {
    const clientsMetadata = connections.get(req.params.token).map((conn) => ({
      version: conn.metadata && conn.metadata.version,
      filters: conn.metadata && conn.metadata.filters,
    }));
    return res.status(200).json({ ok: true, clients: clientsMetadata });
  }
  logger.warn({ desensitizedToken }, 'no matching connection found');
  return res.status(404).json({ ok: false });
};
