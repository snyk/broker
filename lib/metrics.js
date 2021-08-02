const { Gauge } = require('prom-client');

const socketConnectionGauge = new Gauge({
  name: 'broker_socket_connection_total',
  help: 'Number of active socket connections',
});

function incrementSocketConnectionGauge() {
  socketConnectionGauge.inc(1);
}

function decrementSocketConnectionGauge() {
  socketConnectionGauge.dec(1);
}

module.exports = {
  incrementSocketConnectionGauge,
  decrementSocketConnectionGauge,
};
