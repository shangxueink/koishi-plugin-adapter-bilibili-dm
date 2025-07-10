import { Adapter, Context } from 'koishi'
import { BilibiliDmBot } from './bot'
import { BilibiliService } from './service'
import { BotConfig, PluginConfig } from './schema'
import * as fs from 'fs/promises'
import * as path from 'path'

export class BilibiliDmAdapter extends Adapter<Context, BilibiliDmBot> {
  static immediate = true
  private service: BilibiliService

  constructor(ctx: Context, public config: PluginConfig) {
    super(ctx)

    // 创建服务
    this.service = ctx.bilibili_dm_service = new BilibiliService(ctx, config)

    // 注册路由，提供给前端获取状态
    ctx.server.get('/bilibili-dm/status', async (ctx) => {
      const status = this.service.getStatus()
      this.service.logInfo('收到前端状态数据请求，返回数据:', JSON.stringify(status, (key, value) => {
        // 避免日志中输出过长的图片数据
        if (key === 'image' && typeof value === 'string' && value.length > 100) {
          return value.substring(0, 100) + '... [图片数据已截断]'
        }
        return value
      }))
      ctx.body = status
    })
  }

  async fork() {
    // 创建机器人配置
    const botConfig: BotConfig = {
      selfId: this.config.selfId
    }

    await this.startBot(botConfig)
  }

  async dispose() {
    this.service.logInfo('正在停止 Bilibili 私信适配器...')
    await Promise.all(this.bots.map(bot => bot.stop()))
  }

  async startBot(botConfig: BotConfig) {
    const bot = new BilibiliDmBot(this.ctx, botConfig)

    this.service.logInfo(`[${botConfig.selfId}] 正在启动机器人...`)

    // 更新状态为初始化
    this.service.updateStatus(botConfig.selfId, {
      status: 'init',
      selfId: botConfig.selfId,
      message: '正在初始化...'
    })

    const sessionFile = path.join(this.ctx.baseDir, 'data', 'adapter-bilibili-dm', `${botConfig.selfId}.cookie.json`)
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })
    try {
      // 使用服务进行登录
      const loginSuccess = await this.service.startLogin(bot, sessionFile)

      if (loginSuccess) {
        this.bots.push(bot)
      } else {
        // 不抛出错误，而是记录日志并更新状态
        this.service.logInfo(`[${botConfig.selfId}] 登录失败`)
        this.service.updateStatus(botConfig.selfId, {
          status: 'error',
          message: '登录失败，请重试'
        })
        // 确保机器人处于离线状态
        bot.offline()
      }
    } catch (error) {
      this.service.logInfo(`[${botConfig.selfId}] 机器人启动失败，错误详情: %o`, error)
      this.service.updateStatus(botConfig.selfId, {
        status: 'error',
        message: `启动失败: ${error.message || '未知错误'}`
      })
      bot.offline()
    }
  }
}
