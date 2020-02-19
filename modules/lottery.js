const got = require('../utils/got')
const share = require('../utils/share').lottery
const sign = require('../utils/sign')
const got_unsafe = require('got')
const logger = require('../utils/logger')
const sleep = require('../utils/sleep')
const config = require('../utils/config')
const util = require('util');
const WebSocket = require('ws');
const textEncoder = new util.TextEncoder('utf-8');
const textDecoder = new util.TextDecoder('utf-8');

let csrfToken;
let gift_list_cache = []
let pk_list_cache = []
let ws_list = []

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

const getCsrf = () => {
  const cookies = got.defaults.options.cookieJar.getCookiesSync('https://api.bilibili.com/')
  for (const cookie of cookies) {
    const found = `${cookie}`.match(/bili_jct=([0-9a-f]*)/i)
    if (found) return found[1]
  }
  throw new Error('guard: csrf 提取失败')
}

async function checkLottery(rid) {
  // 检查礼物
  try {
    const response = await got_unsafe.get('https://api.live.bilibili.com/xlive/lottery-interface/v1/lottery/getLotteryInfo?roomid=' + rid, {
      headers: {
        'User-Agent': `Mozilla/5.0 BiliDroid/5.45.2 (bbcallen@gmail.com) os/android model/google Pixel 2 mobi_app/android build/5452100 channel/yingyongbao innerVer/5452100 osVer/5.1.1 network/2`
      },
      json: true
    });
    return response.body;
  } catch (error) {
    console.log(error.response.body);
    return false;
  }
}

async function goToRoom(roomId) {
  csrfToken = getCsrf();
  const { body } = await got.post(
    'https://api.live.bilibili.com/room/v1/Room/room_entry_action',
    {
      body: {
        room_id: roomId,
        csrf_token: csrfToken,
        csrf: csrfToken,
        platform: "android"
      },
      form: true,
      json: true
    }
  )
  if (body.code) throw new Error("进入直播间失败")
  return body
}

let check_cache = {}
let gc_mutex = new Promise(resolve => resolve(true));
let lastCheck = 0;

function checkCacheGC() {
  gc_mutex = new Promise(resolve => {
    let keys = Object.keys(check_cache)
    let now = Date.now()
    if (keys.length > 1000) {
      for (let key of keys) {
        if (now > check_cache[key].time) {
          delete check_cache[key]
        }
      }
    }
    resolve(true)
  })
}

async function checkTrueRoom(roomId) {
  if (Date.now() > lastCheck) {
    lastCheck = Date.now() + 360000
    checkCacheGC()
  }
  await gc_mutex
  if (check_cache[roomId]) {
    return await check_cache[roomId].status
  }
  check_cache[roomId] = {
    status: new Promise(async resolve => {
      const { body } = await got.get(
        `https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomId}`,
        { json: true }
      )
      if (body.code === 0) {
        const { is_hidden, is_locked, encrypted } = body.data
        resolve(!(is_hidden || is_locked || encrypted));
      } else {
        logger.warning('guard: 获取房间信息失败')
        resolve(false)
      }
    }),
    time: Date.now() + 2000000
  }
  return await check_cache[roomId].status;
}

async function getLotteryGift(roomId, raffleId, type) {
  const { body } = await got.post(
    'https://api.live.bilibili.com/gift/v4/smalltv/getAward',
    {
      body: {
        roomid: roomId,
        raffleId: raffleId,
        type: type,
        csrf_token: csrfToken,
        csrf: csrfToken
      },
      form: true,
      json: true
    }
  )
  return body
}

async function getLotteryPk(roomId, pkId) {
  const { body } = await got.post(
    'https://api.live.bilibili.com/xlive/lottery-interface/v1/pk/join',
    {
      body: {
        roomid: roomId,
        id: pkId,
        csrf_token: csrfToken,
        csrf: csrfToken
      },
      form: true,
      json: true
    }
  )
  return body
}

const fetchRooms = async () => {
  try {
    const response = await got_unsafe.get(`https://api.live.bilibili.com/xlive/app-interface/v2/index/getAllList?access_key=412c62769bc48631d3f2e99756903e81&actionKey=appkey&appkey=1d8b6e7d45233436&build=5470400&channel=yingyongbao&device=android&device_name=google%20Pixel%202&mobi_app=android&platform=android&qn=0&rec_page=1&relation_page=1&scale=xhdpi&statistics=%7B%22appId%22%3A1%2C%22platform%22%3A3%2C%22version%22%3A%225.47.0%22%2C%22abtest%22%3A%22%22%7D&ts=1567935579&sign=1fb3d38b0d0bea4eea954f22b34a0edb`, {
      headers: {
        'User-Agent': `Mozilla/5.0 BiliDroid/5.45.2 (bbcallen@gmail.com) os/android model/google Pixel 2 mobi_app/android build/5452100 channel/yingyongbao innerVer/5452100 osVer/5.1.1 network/2`
      },
      json: true
    });
    return response.body;
  } catch (error) {
    console.log(error.response.body);
    return false;
  }
}

const getTrueRoomid = async roomid => {
  const { body } = await got.get(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${roomid}`, { json: true });
  if (body.code === 0) return body.data.room_id;
  else return false;
}

const connectRoom = async (roomid) => {
  const tmp = encode(JSON.stringify({ roomid: roomid }), 7);
  const ws = new WebSocket("wss://broadcastlv.chat.bilibili.com:2245/sub");
  ws.on("open", function open() {
    ws.send(tmp);
    logger.info(`Websocket 连接已建立 房间${roomid}`);
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
    // throw new Error('socket被关闭')
    logger.error(`发生异常,1分钟后重试,socket被关闭`)
    share.lock = Date.now() + 1 * 60 * 1000;
  })

  ws.on("message", function incoming(data) {

    const packet = decode(data);

    if (packet.op === 5) {
      packet.body.forEach(async (body) => {
        switch (body.cmd) {
          case 'NOTICE_MSG':
            const originRoomid = body.real_roomid
            let isTrueRoom = true
            // if (share.lastCheck !== originRoomid) {
            if (!~share.lastRoom.findIndex(eachRoom => eachRoom.roomId === originRoomid)) {
              // share.lastCheck = originRoomid
              isTrueRoom = await checkTrueRoom(originRoomid)
            }
            if (isTrueRoom) {

              await sleep(2000 + Math.random() * 2000)
              // 如果已经在这个房间就不用再进一遍
              if (!~share.lastRoom.findIndex(eachRoom => eachRoom.roomId === originRoomid)) {
                share.lastRoom.push({ roomId: originRoomid, time: Date.now() + 1000 * 1000 })
                await goToRoom(originRoomid)
                await sleep(2000 + Math.random() * 2000)
              }

              const lotteryInfo = await checkLottery(originRoomid)

              for (const eachGift of lotteryInfo.data.gift_list) {

                if (gift_list_cache.includes(eachGift.raffleId)) continue;
                gift_list_cache.push(eachGift.raffleId)

                setTimeout(async function () {
                  const result = await getLotteryGift(originRoomid, eachGift.raffleId, eachGift.type)

                  if (result.code === 0) {
                    logger.notice(`gift: ${originRoomid} 礼物领取成功，${result.data.gift_name} x ${result.data.gift_num}`)
                  } else {
                    console.log("领取失败，包详情：" + JSON.stringify(result))
                  }
                }, eachGift.time_wait * 1000 + Math.random() * 5000);
              }

              for (const eachGift of lotteryInfo.data.pk) {

                if (pk_list_cache.includes(eachGift.id)) continue;
                pk_list_cache.push(eachGift.id)
                const result = await getLotteryPk(originRoomid, eachGift.id)

                if (result.code === 0) {
                  logger.notice(`guard: ${originRoomid} 大乱斗抽奖成功，获得${result.data.award_text}`)
                } else {
                  console.log("领取失败，包详情：" + JSON.stringify(result))
                }
              }
            }
            break;
        }
      })
    }

    clearTimeout(connectionHeart);
    connectionHeart = setTimeout(function () {
      ws.terminate();
    }, 60000);
    share.lock = Date.now() + 60 * 1000;

    if (gift_list_cache.length > 1000) gift_list_cache.splice(0, 900)
    if (pk_list_cache.length > 1000) pk_list_cache.splice(0, 900)
    share.lastRoom = share.lastRoom.filter(eachRoom => Date.now() < eachRoom.time)
  });
  ws_list.push(ws);
}

const constructWebsocket = async () => {
  const rooms = await fetchRooms();
  rooms.data.room_list.forEach(async (each) => {
    let room_true;
    for (let eachroom of each.list) {
      room_true = await getTrueRoomid(eachroom.roomid);
      if (room_true) {
        if (checkTrueRoom(room_true)) {
          share.lastRoom.push({ roomId: room_true, time: Date.now() + 4 * 60 * 60 * 1000 })
          break;
        } else {
          room_true = false;
        }
      }
    }
    if (room_true) connectRoom(room_true);
  });
}

const main = async () => {
  await constructWebsocket()
  share.mainLock = Date.now() + 4 * 60 * 60 * 1000;
}

module.exports = () => {
  if (Date.now() > share.mainLock) {
    logger.notice("运行超过4小时，重新建立监听")
    ws_list.forEach(each => { each.terminate(); });
    ws_list = [];
  }
  else if (share.lock > Date.now()) return;
  return main()
    .then(() => {
      share.lock = Date.now() + 60 * 60 * 1000
    })
    .catch(e => {
      logger.error(`发生异常,1分钟后重试,错误信息:` + e.message)
      share.lock = Date.now() + 1 * 60 * 1000
      share.mainLock = Date.now() + 1 * 60 * 1000
    })
}