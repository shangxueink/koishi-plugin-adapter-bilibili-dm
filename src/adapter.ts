import { Adapter, Context, Logger } from 'koishi'
import { BilibiliDmBot } from './bot'
import { BotConfig, PluginConfig } from './schema'
import * as fs from 'fs/promises'
import * as path from 'path'
import qrcode from 'qrcode-terminal'

const logger = new Logger('bilibili-dm')

export class BilibiliDmAdapter extends Adapter<Context, BilibiliDmBot> {
  static immediate = true

  constructor(ctx: Context, public config: PluginConfig) {
    super(ctx)
  }

  async fork() {
    logger.info('Bilibili Private Message Adapter is starting...')
    for (const botConfig of this.config.bots) {
      await this.startBot(botConfig)
    }
  }

  async dispose() {
    logger.info('Stopping Bilibili Private Message Adapter...')
    await Promise.all(this.bots.map(bot => bot.stop()))
    // The parent class 'Adapter' handles clearing the bots array
  }

  async startBot(botConfig: BotConfig) {
    const bot = new BilibiliDmBot(this.ctx, botConfig)

    logger.info(`[${botConfig.selfId}] Starting bot...`)

    const sessionFile = path.join(this.ctx.baseDir, 'data', 'bilibili-dm', `${botConfig.selfId}.cookie.json`)
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })

    try {
      let cookies: Record<string, string> | null = null
      try {
        cookies = JSON.parse(await fs.readFile(sessionFile, 'utf-8'))
        logger.info(`[${botConfig.selfId}] Found local cookie file.`)
      } catch (error) {
        if (error.code !== 'ENOENT') logger.warn(`[${botConfig.selfId}] Failed to read cookie file:`, error)
      }

      if (cookies) {
        bot.http.setCookies(cookies)
        const { nickname, isValid } = await bot.http.getMyInfo()
        if (isValid) {
          logger.info(`[${bot.selfId}] Logged in using cached cookie. Welcome, ${nickname}!`)
          bot.username = nickname // 此处赋值现在是合法的
        } else {
          logger.warn(`[${bot.selfId}] Cached cookie is invalid. Re-login is required.`);
          cookies = null
        }
      }

      if (!cookies) {
        logger.info(`[${botConfig.selfId}] No valid cookie found, starting QR code login...`)
        const qrData = await bot.http.getQrCodeData()
        if (!qrData) throw new Error('Failed to get login QR code.')

        logger.info(`[${bot.selfId}] Please scan the QR code to log in:`)
        qrcode.generate(qrData.url, { small: true })

        const endTime = Date.now() + 180 * 1000
        while (Date.now() < endTime) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          const result = await bot.http.pollQrCodeStatus(qrData.qrcode_key)

          logger.debug(`[${bot.selfId}] Polling status: ${result.status} - ${result.message}`)

          if (result.status === 'success' && result.cookies) {
            logger.info(`[${bot.selfId}] Login successful.`)
            cookies = result.cookies
            break
          }
          if (result.status === 'expired') {
            throw new Error('QR code expired or login failed.')
          }
        }

        if (!cookies) {
          throw new Error('QR code login timed out.')
        }

        await fs.writeFile(sessionFile, JSON.stringify(cookies, null, 2))
        logger.info(`[${botConfig.selfId}] Cookie saved to local file.`)

        bot.http.setCookies(cookies)
        const { nickname } = await bot.http.getMyInfo()
        logger.info(`[${botConfig.selfId}] QR code login successful. Welcome, ${nickname}!`)
        bot.username = nickname // 此处赋值现在是合法的
      }

      await bot.start()
      this.bots.push(bot)
      bot.online()
    } catch (error) {
      logger.error(`[${botConfig.selfId}] Bot startup failed: %o`, error)
      bot.offline()
    }
  }
}