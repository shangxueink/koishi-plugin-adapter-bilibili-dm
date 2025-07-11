//  src\index.ts
import { Config, PluginConfig, BotConfig } from './schema'
import { DataService } from '@koishijs/plugin-console'
import { BilibiliDmAdapter } from './adapter'
import { BilibiliService } from './service'
import { Context, Schema, Logger } from 'koishi'
import { BilibiliDmBot } from './bot'

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const name = 'adapter-bilibili-dm'
export const inject = ['http', 'server', 'console', 'logger']
export const filter = false
export const reusable = true
export { Config }
export const usage = `
---

<p>Bilibili Direct Message Adapter for Koishi</p>
<p>➣ <a href="https://github.com/Roberta001/koishi-plugin-adapter-bilibili-dm/tree/main" target="_blank" rel="noopener noreferrer">点我查看项目地址</a></p>

---

`

const logger = new Logger('adapter-bilibili-dm');
export interface BotStatus {
  status: 'init' | 'qrcode' | 'continue' | 'success' | 'error' | 'offline'
  selfId: string
  image?: string
  message?: string
  pluginName?: string;
}

export type { BotLoginStatus } from './service'

// 自定义事件
declare module 'koishi' {
  interface Context {
    bilibili_dm_service: BilibiliService
  }

  interface Events {
    'bilibili-dm/status-update': (status: BotStatus) => void
    [key: `bilibili-dm-${string}/status-update`]: (status: BotStatus) => void
  }
}

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      [key: `bilibili-dm-${string}`]: BilibiliLauncher
    }
  }
}

declare module '@koishijs/plugin-console' {
  interface Events {
    [key: `bilibili-dm-${string}/start-login`]: (data: { selfId: string }) => void
  }
}

// 创建数据服务
export class BilibiliLauncher extends DataService<Record<string, BotStatus>> {
  private currentBot: string
  private consoleMessages: Record<string, BotStatus> = {}
  readonly serviceId: string

  constructor(ctx: Context, private service: BilibiliService, config: PluginConfig) {
    // 使用selfId创建唯一的服务ID
    const serviceId = `bilibili-dm-${config.selfId}`
    super(ctx, serviceId as any) // 使用类型断言解决类型问题
    this.serviceId = serviceId
    this.currentBot = config.selfId

    service.logInfo(`[${config.selfId}] BilibiliLauncher构造函数，serviceId: ${serviceId}, currentBot: ${this.currentBot}`)

    // 检查是否存在缓存文件
    const sessionFile = resolve(ctx.baseDir, 'data', 'adapter-bilibili-dm', `${config.selfId}.cookie.json`)
    const hasCacheFile = existsSync(sessionFile)

    service.logInfo(`[${config.selfId}] BilibiliLauncher初始化，缓存文件存在: ${hasCacheFile}`)

    // 初始化状态对象，根据缓存文件存在与否设置初始状态
    if (hasCacheFile) {
      this.consoleMessages[config.selfId] = {
        status: 'init',
        selfId: config.selfId,
        message: '正在从缓存加载登录信息...'
      }
      service.logInfo(`[${config.selfId}] 发现缓存文件，初始化状态为"正在从缓存加载登录信息..."`)
    } else {
      this.consoleMessages[config.selfId] = {
        status: 'offline',
        selfId: config.selfId,
        message: '机器人未登录，请点击登录按钮'
      }
      service.logInfo(`[${config.selfId}] 未发现缓存文件，初始化状态为"机器人未登录"`)
    }

    // 立即刷新前端数据
    this.refresh()

    // 监听特定于selfId的状态更新事件
    const statusEventName = `bilibili-dm-${config.selfId}/status-update`;
    ctx.on(statusEventName as any, (status: BotStatus) => {
      service.logInfo(`[${config.selfId}] 收到特定实例状态更新通知: ${status.selfId} -> ${status.status}`)

      // 确保状态更新到正确的selfId
      if (status.selfId === config.selfId) {
        // 更新控制台消息，按selfId索引
        this.consoleMessages[status.selfId] = {
          ...status,
          selfId: config.selfId
        }

        if (status.status === 'qrcode') {
          service.logInfo(`[${config.selfId}] 二维码已生成，准备推送到前端，图片数据长度: ${status.image?.length || 0}`)
        }

        // 刷新前端数据
        this.refresh()

        // 记录当前状态
        service.logInfo(`[${config.selfId}] 状态已更新并刷新到前端: ${status.status}, 消息: ${status.message}`)
      } else {
        service.logInfo(`[${config.selfId}] 忽略非本实例的状态更新: ${status.selfId}`)
      }
    })

    // 同时监听通用事件，保持向后兼容
    ctx.on('bilibili-dm/status-update', (status: BotStatus) => {
      // 只处理属于当前实例的状态更新
      if (status.selfId === config.selfId) {
        service.logInfo(`[${config.selfId}] 收到通用状态更新通知: ${status.selfId} -> ${status.status}`)

        // 更新控制台消息
        this.consoleMessages[status.selfId] = {
          ...status,
          selfId: config.selfId
        }

        // 刷新前端数据
        this.refresh()

        // 记录当前状态
        service.logInfo(`[${config.selfId}] 通过通用事件更新状态并刷新到前端: ${status.status}, 消息: ${status.message}`)
      }
    })

    // 注册前端组件
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    // 处理前端发来的登录请求    // 使用唯一的事件名称 
    const loginEventName = `bilibili-dm-${config.selfId}/start-login`;
    service.logInfo(`[${config.selfId}] 注册登录事件监听器: ${loginEventName}`)

    ctx.console.addListener(loginEventName as any, async (data: { selfId: string }) => {
      // 确保使用前端传来的selfId，而不是配置中的selfId
      const selfId = data.selfId || config.selfId
      this.currentBot = selfId

      service.logInfo(`[${selfId}] 收到前端登录请求，前端传入的selfId: ${selfId}，配置中的selfId: ${config.selfId}，当前服务ID: ${this.serviceId}`)
      service.logInfo(`[${selfId}] 收到前端登录请求，前端传入的selfId: ${selfId}，配置中的selfId: ${config.selfId}，当前服务ID: ${this.serviceId}`)
      service.logInfo(`[${selfId}] 当前机器人列表: ${ctx.bots.map(bot => `${bot.platform}:${bot.selfId}`).join(', ')}`)

      // 更新状态为初始化
      this.consoleMessages[selfId] = {
        status: 'init',
        selfId: selfId,
        message: '正在初始化...'
      }
      this.refresh()

      const botConfig: BotConfig = {
        selfId: selfId
      }

      // 创建新机器人实例
      service.logInfo(`[${selfId}] 创建新机器人实例，使用selfId: ${selfId}`)
      const bot = new BilibiliDmBot(ctx, botConfig)
      const sessionFile = resolve(ctx.baseDir, 'data', 'adapter-bilibili-dm', `${selfId}.cookie.json`)

      // 检查是否存在cookie文件，如果存在则删除
      try {
        if (existsSync(sessionFile)) {
          service.logInfo(`[${selfId}] 删除旧的cookie文件: ${sessionFile}`)
          service.logInfo(`[${selfId}] 删除旧的cookie文件: ${sessionFile}`)
          await fs.unlink(sessionFile)
        }
      } catch (error) {
        logger.error(`[${selfId}] 删除cookie文件失败: ${error.message}`)
      }

      // 启动登录流程
      service.logInfo(`[${selfId}] 开始启动登录流程...`)
      await this.service.startLogin(bot, sessionFile)
    })
  }

  // 获取控制台消息
  async get() {
    // 返回按selfId索引的状态对象
    const statusData = this.consoleMessages;

    // 记录当前获取的状态
    this.service.logInfo(`[${this.currentBot}] 前端请求状态数据，当前状态: ${JSON.stringify(statusData[this.currentBot]?.status)}, 消息: ${statusData[this.currentBot]?.message}`)

    // 如果有二维码，记录日志
    Object.values(statusData).forEach(status => {
      if (status.status === 'qrcode' && status.image) {
        this.service.logInfo(`[${status.selfId}] 返回二维码数据给前端，图片数据长度: ${status.image.length} 字节`)
      }
    });

    // 确保每个状态对象都有正确的selfId
    Object.keys(statusData).forEach(selfId => {
      if (statusData[selfId]) {
        if (!statusData[selfId].selfId) {
          statusData[selfId].selfId = selfId
        }
        // 确保状态对象包含所有必要的字段
        if (!statusData[selfId].status) {
          this.service.logInfo(`[${selfId}] 状态对象缺少status字段，设置为init`)
          statusData[selfId].status = 'init'
        }
        if (!statusData[selfId].message) {
          statusData[selfId].message = '正在初始化...'
        }
      }
    })

    return statusData;
  }
}

export function apply(ctx: Context, config: PluginConfig) {
  // 创建服务
  const service = new BilibiliService(ctx, config)
  ctx.bilibili_dm_service = service

  // 记录启动信息
  service.logInfo(`[${config.selfId}] 正在初始化 Bilibili 私信适配器...`)

  // 注册数据服务
  // 自定义工厂函数传递多个参数
  ctx.plugin({
    name: `bilibili-launcher-${config.selfId}`,
    apply: (ctx) => {
      service.logInfo(`[${config.selfId}] 创建BilibiliLauncher实例，selfId: ${config.selfId}`)
      return new BilibiliLauncher(ctx, service, config)
    }
  })

  // 注册适配器
  ctx.plugin(BilibiliDmAdapter, {
    ...config,
    selfId: config.selfId
  })

  // 确保所有机器人实例都能正确初始化
  ctx.on('ready', () => {
    service.logInfo(`[${config.selfId}] Koishi准备就绪，确保所有机器人实例都能正确初始化`)

    // 查找所有已注册的机器人适配器
    const adapters = ctx.bots
      .filter(bot => bot.platform === 'bilibili')
      .map(bot => bot.ctx.registry.get(BilibiliDmAdapter))
      .filter(Boolean)

    service.logInfo(`[${config.selfId}] 找到 ${adapters.length} 个BilibiliDmAdapter实例`)

    // 确保每个适配器都调用fork方法
    adapters.forEach(adapter => {
      if (adapter && adapter.config && adapter.config.selfId) {
        service.logInfo(`[${adapter.config.selfId}] 确保适配器正确初始化`)

        // 使用setTimeout异步调用fork方法，避免阻塞主线程
        setTimeout(() => {
          try {
            // 调用fork方法，传递必要的参数
            adapter.fork(ctx, adapter.config)
            service.logInfo(`[${adapter.config.selfId}] 适配器初始化成功`)
          } catch (err) {
            logger.error(`[${adapter.config.selfId}] 适配器初始化失败: ${err.message}`)
          }
        }, 0)
      }
    })
  })

  // 记录完成信息
  logger.info(`[${config.selfId}] Bilibili 私信适配器初始化完成`)
}
