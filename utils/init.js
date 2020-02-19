const config = require('./config')
const package = require('../package.json')

const init = () => {
  if (config.get('version') !== package.version) {
    let t = {
      version: package.version,
      debug: process.env.DEBUG === 'true',
      username: process.env.USERNAME || '',
      password: process.env.PASSWORD || '',
      access_token: process.env.ACCESS_TOKEN || '',
      refresh_token: process.env.REFRESH_TOKEN || '',
      room_id: process.env.ROOM_ID || '3746256',
      guard: {
        hours: process.env.GUARD_HOURS || '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23',
        percent: process.env.GUARD_PERCENT || '100',
      },
    }
    t.guard.hours = t.guard.hours.split(',').map(x => parseInt(x, 10))
    t.guard.percent = parseInt(t.guard.percent, 10)
    config.store = t
  }
  console.log(config.store)
}

module.exports = init
