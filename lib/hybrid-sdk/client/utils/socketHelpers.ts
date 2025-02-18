import primus from 'primus';

export const isWebsocketConnOpen = (io) => {
  return io.readyState === primus.Spark.OPEN;
};
