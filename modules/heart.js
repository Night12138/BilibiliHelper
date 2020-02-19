const got = require('../utils/got')
const share = require('../utils/share').heart
const guardRoom = require('../utils/share').guard
const sign = require('../utils/sign')
const logger = require('../utils/logger')
const config = require('../utils/config')

let csrfToken

const getCsrf = () => {
  const cookies = got.defaults.options.cookieJar.getCookiesSync('https://api.bilibili.com/')
  for (const cookie of cookies) {
    const found = `${cookie}`.match(/bili_jct=([0-9a-f]*)/i)
    if (found) return found[1]
  }
  throw new Error('guard: csrf 提取失败')
}

const main = async () => {
  csrfToken = getCsrf()
  await heart_beat()
  if (await heart_web()) {
    await heart_mobile()
  }
}

const heart_beat = async (withTs) => {
  let url = 'https://api.live.bilibili.com/relation/v1/feed/heartBeat';
  if (!withTs && Date.now() < share.beatLock) {
    return
  } else if (withTs) {
    url += `?_=${withTs}`
  } else {
    share.beatLock = Date.now() + 90 * 1000
  }

  let { body } = await got.get(url, { json: true })
  if (body.code) throw new Error('直播间心跳异常 (heart)')
}

const heart_web = async () => {
  if (Date.now() > share.webLock) {
    let { body } = await got.post('https://api.live.bilibili.com/User/userOnlineHeart', {
      body: {
        csrf_token: csrfToken,
        csrf: csrfToken,
        visit_id: ""
      },
      form: true,
      json: true
    })
    if (body.code) throw new Error('直播间心跳异常 (web)')
    await heart_beat(Date.now())
    share.webLock = Date.now() + 300 * 1000
    return false;
  }
  return true;
}

const heart_mobile = async () => {
  if (Date.now() > share.appLock) {
    let { body } = await got.post('https://api.live.bilibili.com/heartbeat/v1/OnLine/mobileOnline', {
      query: sign({}),
      body: {
        room_id: guardRoom.lastGuardRoom,
        scale: "xhdpi"
      },
      form: true,
      json: true,
    })
    if (body.code) throw new Error('直播间心跳异常 (app)')

    let payload = {
      room_id: guardRoom.lastRoom[0].roomId,
    }
    body = (await got.post('https://api.live.bilibili.com/mobile/userOnlineHeart', {
      body: sign(payload),
      form: true,
      json: true,
    })).body
    if (body.code) throw new Error('直播间心跳异常 (app)')
    share.appLock = Date.now() + 300 * 1000
  }
}

module.exports = () => {
  if (process.env.DISABLE_HEART === 'true') return
  if (share.lock > Date.now()) return
  return main()
    .then(() => {
      share.lock = Date.now() + 10 * 1000
    })
    .catch(e => {
      logger.error(e.message)
      share.lock = Date.now() + 5 * 60 * 1000
    })
}
