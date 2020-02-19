const got = require('got')
const chalk = require('chalk')
const config = require('./config')
const CookieStore = require('tough-cookie-file-store')
const CookieJar = require('tough-cookie').CookieJar

const cookieJar = new CookieJar(new CookieStore('./.cookies'))

const _got = got.extend({
  headers: {
    'User-Agent': 'Mozilla/5.0 BiliDroid/5.50.0 (bbcallen@gmail.com) os/android mobi_app/android build/5500300 innerVer/5500300',
    'Accept': '*/*',
    'Accept-Language': 'zh-cn',
    'Connection': 'keep-alive',
    'Content-Type': 'application/x-www-form-urlencoded',
    "APP-KEY": "android",
    "Buvid": "XZ6983A6F4481DC5090FB647F9D8FD67FE1B8",
    "Device-ID": "GyMUJRwsTShJK0osUGJQYlA1VGAFMQEyBHgENFUwUTNSNAc0BTICOg08BQ",
    "Display-ID": "478658766-1580326867",
    // 'Referer': `https://live.bilibili.com/${config.get('room_id')}`,
  },
  cookieJar,
  timeout: 20000,
  hooks: {
    beforeRequest: [
      options => {
        if (config.get('debug')) console.log(`${chalk.cyan(options.method)} ${chalk.yellow(options.href)}`)
        if (options.method === "POST") console.log(chalk.gray(options.body))
        if (options.method === "GET" && options.query) console.log(chalk.gray(JSON.stringify(options.query)))
      }
    ],
    afterResponse: [
      response => {
        if (config.get('debug') && response.body.length < 1000) console.log(chalk.gray(response.body))
        return response
      }
    ]
  },
})

module.exports = _got
