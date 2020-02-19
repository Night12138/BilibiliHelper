const qs = require('qs')
const md5 = require('md5')
const config = require('./config')

const sign = data => {

  const appkey = '1d8b6e7d45233436'//'27eb53fc9058f8c3'
  const appsecret = '560c52ccd288fed045859ed18bffd973'//'c2ed53a74eeefe3cf99fbd01d8c9c375'

  let defaults = {
    access_key: config.get('access_token', ''),
    actionKey: 'appkey',
    appkey,
    build: '5500300',//'8470',
    device: 'phone',
    mobi_app: 'android', //'iphone',
    platform: 'android',//'ios',
    ts: Math.round(Date.now() / 1000),
    // type: 'json',
  }

  data = {
    ...defaults,
    ...data
  }

  let hash = qs.stringify(data, { sort: (a, b) => a.localeCompare(b) })
  hash = md5(hash + appsecret)

  data.sign = hash

  return data
}

module.exports = sign
