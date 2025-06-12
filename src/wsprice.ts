
import WebSocket from 'ws';
const retryInterval = 5000;
let PAIRDATA = {};

const wsconnect = () => {
  const headers = {
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en,en-US;q=0.9",
    "Cache-Control": "no-cache",
    Connection: "Upgrade",
    Host: "io.dexscreener.com",
    Origin: "https://dexscreener.com",
    Pragma: "no-cache",
    "Sec-Websocket-Extensions": "permessage-deflate; client_max_window_bits",
    "Sec-Websocket-Key": "0/alYj2/NLpLvuHxOEHKYw==",
    "Sec-Websocket-Version": "13",
    Upgrade: "websocket",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  };
  // Create a new WebSocket instance and specify the server URL
  const ws = new WebSocket(
    // "wss://io.dexscreener.com/dex/screener/pairs/h24/1?rankBy[key]=pairAge&rankBy[order]=asc&filters[chainIds][0]=solana",
    "wss://fragrant-skilled-mound.solana-mainnet.quiknode.pro/30389e3a1f96a4dc7c7e31c6b758d8873e4f1fa8",
    // "https://api.dexscreener.com/latest/dex/pairs/solana/9ctxeyrstwtklfvts6c7rfqc7ptxy42ypdqcrhtv53ao",
    { headers },
  );
  // Event listener for when the connection is established
  ws.on("open", () => {
    console.log("Connected to WebSocket server");
  });

  ws.on("message", (data: any) => {
    const parsedData = JSON.parse(data);
    if (parsedData === "ping") {
      //console.log(colors.warn('Reconnecting ws'))
      ws.send("pong");
    } else {
      const { pairs = [] } = parsedData;
      const onlyRaydiumPairs = pairs.filter((pair) => pair.dexId === "raydium");
      //console.log(onlyRaydiumPairs)
      if (onlyRaydiumPairs.length) {
        onlyRaydiumPairs.map(_pair => {
          PAIRDATA[_pair.baseToken.address.toLowerCase()] = _pair;
        })
      }
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    ws.close();
  });

  ws.on("close", () => {
    console.log("Disconnected from WebSocket server");
    setTimeout(() => {
      console.log("WEBSOCKET_CLOSE: reconnecting...");
      wsconnect();
    }, retryInterval);
  });
};
// wsconnect();

export const GetTokenData = (_mintAddress = '') => {
  return PAIRDATA[_mintAddress.toLowerCase()]
}
