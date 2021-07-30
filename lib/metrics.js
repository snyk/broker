import { Gauge } from 'prom-client';

const socketConnectionGauge = new Gauge({
  name: 'broker_socket_connection_total',
  help: 'Number of active socket connections',
});

export function incrementSocketConnectionGauge() {
  socketConnectionGauge.inc(1);
}

export function decrementSocketConnectionGauge() {
  socketConnectionGauge.dec(1);
}
