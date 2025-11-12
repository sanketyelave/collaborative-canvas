// client/js/websocket.js - small wrapper if needed
const SocketClient = (function () {
  let socket = null;
  return {
    connect: (opts) => {
      // opts may be object {url} or undefined. We'll just do a direct io().
      socket = io();
      return socket;
    },
    raw: () => socket
  };
})();
