export const identifyHandler = (serverData, io) => {
  io.capabilities = serverData.capabilities;
};
