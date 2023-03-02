const { Gauge, Histogram, Counter } = require('prom-client');

const socketConnectionGauge = new Gauge({
  name: 'broker_socket_connection_total',
  help: 'Number of active socket connections',
});

const responseSizeHistogram = new Histogram({
  name: 'broker_response_size_bytes',
  help: 'The size of broker server responses in bytes',
  labelNames: ['isStreaming'],
  buckets: [
    1024, // 1kb
    5120, // 5kb
    10_240, // 10kb
    25_600, // 25kb
    51_200, // 50kb
    102_400, // 100kb
    512_000, // 500kb
    1_048_576, // 1mb
    10_485_760, // 10mb
    20_971_520, // 20mb 'maxLength' in socket.js
  ],
});

const unableToSizeResponseCounter = new Counter({
  name: 'broker_unable_to_size_response_count',
  help: 'A count of the number of times broker server was unable to size a response',
});

const httpRequestsTotal = new Counter({
  name: 'http_request_total',
  help: 'Number of HTTP requests',
  labelNames: ['rejectedByFilter'],
});

const webSocketRequestsTotal = new Counter({
  name: 'broker_ws_request_total',
  help: 'Number of requests received via WebSocket',
  labelNames: ['rejectedByFilter'],
});

function incrementSocketConnectionGauge() {
  socketConnectionGauge.inc(1);
}

function decrementSocketConnectionGauge() {
  socketConnectionGauge.dec(1);
}

function observeResponseSize({ bytes, isStreaming }) {
  responseSizeHistogram.observe({ isStreaming }, bytes);
}

function incrementUnableToSizeResponse() {
  unableToSizeResponseCounter.inc(1);
}

function incrementHttpRequestsTotal(rejectedByFilter) {
  httpRequestsTotal.inc({'rejectedByFilter': rejectedByFilter}, 1);
}

function incrementWebSocketRequestsTotal(rejectedByFilter) {
  webSocketRequestsTotal.inc({'rejectedByFilter': rejectedByFilter}, 1);
}

module.exports = {
  incrementSocketConnectionGauge,
  decrementSocketConnectionGauge,
  observeResponseSize,
  incrementUnableToSizeResponse,
  incrementHttpRequestsTotal,
  incrementWebSocketRequestsTotal,
};
