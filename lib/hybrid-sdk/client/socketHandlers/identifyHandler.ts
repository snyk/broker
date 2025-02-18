export const identifyHandler = (serverData, websocket) => {
  websocket.capabilities = serverData.capabilities;
};
