import dns from 'node:dns';
import net from 'node:net';
import { log as logger } from '../../../logs/logger';

const disableHappyEyeballs = () => {
  dns.setDefaultResultOrder('ipv4first');
  net.setDefaultAutoSelectFamily(false);
};

/**
 * Probes `host:port` over IPv6 (family: 6). If the probe fails or times out,
 * disables the Node.js Happy Eyeballs algorithm by setting the DNS result order
 * to 'ipv4first' and turning off autoSelectFamily, eliminating the ~250 ms
 * fallback penalty on every new TCP connection when IPv6 routing is unavailable.
 */
export async function probeIpv6WithIpv4Fallback(
  host: string,
  port = 443,
  timeoutMs = 3_000,
): Promise<'ipv4first' | 'default'> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, family: 6 });
    socket.setTimeout(timeoutMs);

    const cleanup = (ipv6Works: boolean) => {
      socket.destroy();
      if (ipv6Works) {
        logger.info(
          { host },
          'IPv6 probe succeeded. Keeping default IP family.',
        );
        resolve('default');
      } else {
        logger.info(
          { host },
          'IPv6 probe failed. Disabling Happy Eyeballs (dns ipv4first + net autoSelectFamily off).',
        );
        disableHappyEyeballs();
        resolve('ipv4first');
      }
    };

    socket.on('connect', () => cleanup(true));
    socket.on('error', () => cleanup(false));
    socket.on('timeout', () => cleanup(false));
  });
}
