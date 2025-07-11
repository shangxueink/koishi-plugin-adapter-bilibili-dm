
//  src\adapter.ts
import { BotConfig, PluginConfig } from './schema'
import { BilibiliService } from './service'
import { Adapter, Context, Logger } from 'koishi'
import { BilibiliDmBot } from './bot'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
const logger = new Logger('adapter-bilibili-dm');
export class BilibiliDmAdapter extends Adapter<Context, BilibiliDmBot> {
  static immediate = true
  private service: BilibiliService
  private logger = new Logger('BilibiliDmAdapter')

  constructor(ctx: Context, public config: PluginConfig) {
    super(ctx)

    // 创建服务
    this.service = ctx.bilibili_dm_service = new BilibiliService(ctx, config)

    // 记录适配器初始化信息
    this.service.logInfo(`[${this.config.selfId}] 适配器初始化，selfId: ${this.config.selfId}`)

    // 确保在构造函数完成后立即调用fork方法
    ctx.setTimeout(() => {
      this.service.logInfo(`[${this.config.selfId}] 延迟调用fork方法，确保正确初始化`)
      this.fork().catch(err => {
        this.logger.error(`[${this.config.selfId}] fork方法执行失败: ${err.message}`)
      })
    }, 100)

    // 路由，提供给前端获取状态
    ctx.server.get('/bilibili-dm/status', async (ctx) => {
      const status = this.service.getStatus()

      // 如果请求中包含selfId参数，只返回该selfId的状态
      const requestedSelfId = ctx.query.selfId as string
      if (requestedSelfId && status[requestedSelfId]) {
        this.service.logInfo(`收到前端状态数据请求，返回selfId=${requestedSelfId}的数据`)
        ctx.body = { [requestedSelfId]: status[requestedSelfId] }
        return
      }

      this.service.logInfo('收到前端状态数据请求，返回所有数据:', JSON.stringify(status, (key, value) => {
        // 避免日志中输出过长的图片数据
        if (key === 'image' && typeof value === 'string' && value.length > 100) {
          return value.substring(0, 100) + '... [图片数据已截断]'
        }
        return value
      }))
      ctx.body = status
    })
  }

  async fork(parent?: Context, config?: any, error?: any) {
    const actualConfig = config || this.config
    const selfId = actualConfig.selfId || this.config.selfId

    // 创建机器人配置
    const botConfig: BotConfig = {
      selfId: selfId
    }

    // 记录当前正在fork的机器人ID
    this.service.logInfo(`[${selfId}] 开始fork过程，当前机器人ID: ${selfId}`)

    // 检查是否存在缓存文件
    const sessionFile = path.join(this.ctx.baseDir, 'data', 'adapter-bilibili-dm', `${botConfig.selfId}.cookie.json`)
    const hasCacheFile = await fs.access(sessionFile).then(() => true).catch(() => false)

    this.service.logInfo(`[${selfId}] 开始fork过程，缓存文件存在: ${hasCacheFile}`)

    if (!hasCacheFile) {
      // 只有在没有缓存文件时才设置初始"未登录"状态
      this.service.updateStatus(selfId, {
        status: 'offline',
        selfId: selfId,
        message: '机器人未登录，请点击登录按钮'
      })
    } else {
      // 如果有缓存文件，设置为初始化状态
      this.service.updateStatus(selfId, {
        status: 'init',
        selfId: selfId,
        message: '正在从缓存加载登录信息...'
      })
    }

    // 直接启动机器人，不使用延迟
    this.service.logInfo(`[${selfId}] 直接启动机器人...`)
    await this.startBot(botConfig)

    // 返回this以支持链式调用
    return this
  }

  async dispose() {
    logger.info('正在停止 Bilibili 私信适配器...')
    await Promise.all(this.bots.map(bot => bot.stop()))
  }

  async startBot(botConfig: BotConfig) {
    // 确保使用正确的selfId
    logger.info(`[${botConfig.selfId}] 开始startBot过程，使用selfId: ${botConfig.selfId}`)

    // 创建机器人实例，确保使用正确的selfId
    const bot = new BilibiliDmBot(this.ctx, {
      ...botConfig,
      selfId: botConfig.selfId // 确保selfId正确
    })

    this.service.logInfo(`[${botConfig.selfId}] 正在启动机器人...`)

    const sessionFile = path.join(this.ctx.baseDir, 'data', 'adapter-bilibili-dm', `${botConfig.selfId}.cookie.json`)
    await fs.mkdir(path.dirname(sessionFile), { recursive: true })

    // 检查是否存在缓存文件
    const hasCacheFile = await fs.access(sessionFile).then(() => true).catch(() => false)

    if (hasCacheFile) {
      try {
        // 读取缓存文件并设置cookie
        const cookieData = JSON.parse(await fs.readFile(sessionFile, 'utf8'))
        this.service.logInfo(`[${botConfig.selfId}] 从缓存文件加载cookie，数据长度: ${JSON.stringify(cookieData).length}`)
        bot.http.setCookies(cookieData)

        // 验证cookie是否有效
        const userInfo = await bot.http.getMyInfo()
        if (userInfo.isValid) {
          this.service.logInfo(`[${botConfig.selfId}] 缓存cookie有效，用户名: ${userInfo.nickname}`)
          // 明确设置cookie验证标志
          bot.http.setCookieVerified(true)
          this.service.logInfo(`[${botConfig.selfId}] 已设置cookie验证标志为true`)
        } else {
          this.service.logInfo(`[${botConfig.selfId}] 缓存cookie无效，需要重新登录`)
          // 确保cookie验证标志为false
          bot.http.setCookieVerified(false)
        }
      } catch (error) {
        this.service.logInfo(`[${botConfig.selfId}] 读取缓存cookie失败: ${error.message}`)
      }
    }

    try {
      // 使用服务进行登录
      const loginSuccess = await this.service.startLogin(bot, sessionFile)

      if (loginSuccess) {
        this.service.logInfo(`[${botConfig.selfId}] 登录成功，添加到机器人列表`)
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
