const util = require('util');
const WebSocket = require('ws');
const textEncoder = new util.TextEncoder('utf-8');
const textDecoder = new util.TextDecoder('utf-8');

const ws;

const readInt = (buffer, start, len) => {
  let result = 0
  for (let i = len - 1; i >= 0; i--) {
    result += Math.pow(256, len - i - 1) * buffer[start + i]
  }
  return result
}

const writeInt = (buffer, start, len, value) => {
  let i = 0
  while (i < len) {
    buffer[start + i] = value / Math.pow(256, len - i - 1)
    i++
  }
}

const encode = (str, op) => {
  let data = textEncoder.encode(str);
  let packetLen = 16 + data.byteLength;
  let header = [0, 0, 0, 0, 0, 16, 0, 1, 0, 0, 0, op, 0, 0, 0, 1]
  writeInt(header, 0, 4, packetLen)
  return (new Uint8Array(header.concat(...data))).buffer
}

const decode = (buffer) => {
  let result = {}
  result.packetLen = readInt(buffer, 0, 4)
  result.headerLen = readInt(buffer, 4, 2)
  result.ver = readInt(buffer, 6, 2)
  result.op = readInt(buffer, 8, 4)
  result.seq = readInt(buffer, 12, 4)
  if (result.op === 5) {
    result.body = []
    let offset = 0;
    while (offset < buffer.length) {
      let packetLen = readInt(buffer, offset + 0, 4)
      let headerLen = 16// readInt(buffer,offset + 4,4)
      let data = buffer.slice(offset + headerLen, offset + packetLen);
      let body = textDecoder.decode(data);
      if (body) {
        result.body.push(JSON.parse(body));
      }
      offset += packetLen;
    }
  } else if (result.op === 3) {
    result.body = {
      count: readInt(buffer, 16, 4)
    };
  }
  return result;
}

const constructWebsocket = (room_id) => {

  const tmp = encode(JSON.stringify({ roomid: room_id }), 7);

  ws = new WebSocket("wss://broadcastlv.chat.bilibili.com:2245/sub");

  ws.on("open", function open() {
    ws.send(tmp);
    logger.info("Websocket 连接已建立")
  });

  let loopHeart = setInterval(function () {
    ws.send(encode('', 2));
  }, 30000);

  let connectionHeart = setTimeout(function () {
    ws.terminate();
  }, 60000);

  ws.on("close", function close() {
    console.log("connection closed");
    clearInterval(loopHeart);
    clearTimeout(connectionHeart);
    throw new Error('socket被关闭')
  });

  ws.on("message", function incoming(data) {

    const packet = decode(data);

    if (packet.op === 5) {
      packet.body.forEach(async (body) => {
        switch (body.cmd) {
          
        }
      })
    }

    clearTimeout(connectionHeart);
    connectionHeart = setTimeout(function () {
      ws.terminate();
    }, 60000);
  });
}

module.exports = (room_id) => {
  constructWebsocket(room_id);
  return ws;
}