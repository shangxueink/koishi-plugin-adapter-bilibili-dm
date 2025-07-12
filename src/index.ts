//  src\index.ts
import { Config, PluginConfig } from './schema'
import { DataService } from '@koishijs/plugin-console'
import { BilibiliDmAdapter } from './adapter'
import { BilibiliService } from './service'
import { Context, Schema, } from 'koishi'
import { BilibiliDmBot } from './bot'

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 全局函数
export let logInfo: (message: string, ...args: any[]) => void;
export let loggerInfo: (message: string, ...args: any[]) => void;
export let loggerError: (message: string, ...args: any[]) => void;

export const name = 'adapter-bilibili-dm'
export const inject = ['http', 'server', 'console', 'logger']
export const filter = false
export const reusable = true
export { Config }
export const usage = `
---

<p>Bilibili Direct Message Adapter for Koishi</p>
<p>➣ <a href="https://github.com/Roberta001/koishi-plugin-adapter-bilibili-dm/tree/main?tab=readme-ov-file#koishi-plugin-adapter-bilibili-dm" target="_blank">点我查看使用说明</a></p>

---

`
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
    const serviceId = `bilibili-dm-${config.selfId}`
    super(ctx, serviceId as any) // as any
    this.serviceId = serviceId
    this.currentBot = config.selfId

    logInfo(`[${config.selfId}] BilibiliLauncher构造函数，serviceId: ${serviceId}, currentBot: ${this.currentBot}`)

    const sessionFile = resolve(ctx.baseDir, 'data', 'adapter-bilibili-dm', `${config.selfId}.cookie.json`)
    const hasCacheFile = existsSync(sessionFile)

    logInfo(`[${config.selfId}] BilibiliLauncher初始化，缓存文件存在: ${hasCacheFile}`)

    // 初始化状态
    if (hasCacheFile) {
      this.consoleMessages[config.selfId] = {
        status: 'init',
        selfId: config.selfId,
        message: '正在从缓存加载登录信息...'
      }
      logInfo(`[${config.selfId}] 发现缓存文件，初始化状态为"正在从缓存加载登录信息..."`)
    } else {
      this.consoleMessages[config.selfId] = {
        status: 'offline',
        selfId: config.selfId,
        message: '机器人未登录，请点击登录按钮'
      }
      logInfo(`[${config.selfId}] 未发现缓存文件，初始化状态为"机器人未登录"`)
    }

    // 立即刷新前端
    this.refresh()

    // 监听特定于selfId的状态更新事件
    const statusEventName = `bilibili-dm-${config.selfId}/status-update`;
    ctx.on(statusEventName as any, (status: BotStatus) => {
      logInfo(`[${config.selfId}] 收到特定实例状态更新通知: ${status.selfId} -> ${status.status}`)

      if (status.selfId === config.selfId) {
        this.consoleMessages[status.selfId] = {
          ...status,
          selfId: config.selfId
        }

        if (status.status === 'qrcode') {
          logInfo(`[${config.selfId}] 二维码已生成，准备推送到前端，图片数据长度: ${status.image?.length || 0}`)
        }

        // 刷新前端
        this.refresh()
        logInfo(`[${config.selfId}] 状态已更新并刷新到前端: ${status.status}, 消息: ${status.message}`)
      } else {
        logInfo(`[${config.selfId}] 忽略非本实例的状态更新: ${status.selfId}`)
      }
    })

    ctx.on('bilibili-dm/status-update', (status: BotStatus) => {
      if (status.selfId === config.selfId) {
        logInfo(`[${config.selfId}] 收到通用状态更新通知: ${status.selfId} -> ${status.status}`)

        // 更新控制台消息
        this.consoleMessages[status.selfId] = {
          ...status,
          selfId: config.selfId
        }

        // 刷新前端
        this.refresh()
        logInfo(`[${config.selfId}] 通过通用事件更新状态并刷新到前端: ${status.status}, 消息: ${status.message}`)
      }
    })

    // 前端组件
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    // 前端发来的登录请求
    const loginEventName = `bilibili-dm-${config.selfId}/start-login`;
    logInfo(`[${config.selfId}] 注册登录事件监听器: ${loginEventName}`)

    ctx.console.addListener(loginEventName as any, async (data: { selfId: string }) => {
      const selfId = data.selfId || config.selfId
      this.currentBot = selfId

      logInfo(`[${selfId}] 收到前端登录请求，前端传入的selfId: ${selfId}，配置中的selfId: ${config.selfId}，当前服务ID: ${this.serviceId}`)
      logInfo(`[${selfId}] 当前机器人列表: ${ctx.bots.map(bot => `${bot.platform}:${bot.selfId}`).join(', ')}`)

      // 更新状态
      this.consoleMessages[selfId] = {
        status: 'init',
        selfId: selfId,
        message: '正在初始化...'
      }
      this.refresh()

      // 创建新机器人实例
      logInfo(`[${selfId}] 创建新机器人实例，使用selfId: ${selfId}`)
      const bot = new BilibiliDmBot(ctx, config)
      const sessionFile = resolve(ctx.baseDir, 'data', 'adapter-bilibili-dm', `${selfId}.cookie.json`)

      // 检查是否存在cookie文件，如果存在则删除
      try {
        if (existsSync(sessionFile)) {
          logInfo(`[${selfId}] 删除旧的cookie文件: ${sessionFile}`)
          await fs.unlink(sessionFile)
        }
      } catch (error) {
        loggerError(`[${selfId}] 删除cookie文件失败: `, error)
      }

      // 启动登录流程
      logInfo(`[${selfId}] 开始启动登录流程...`)
      await this.service.startLogin(bot, sessionFile)
    })
  }

  // 获取控制台消息
  async get() {
    const statusData = this.consoleMessages;

    // 记录当前获取的状态
    logInfo(`[${this.currentBot}] 前端请求状态数据，当前状态: ${JSON.stringify(statusData[this.currentBot]?.status)}, 消息: ${statusData[this.currentBot]?.message}`)

    // 如果有二维码，记录日志
    Object.values(statusData).forEach(status => {
      if (status.status === 'qrcode' && status.image) {
        logInfo(`[${status.selfId}] 返回二维码数据给前端，图片数据长度: ${status.image.length} 字节`)
      }
    });

    Object.keys(statusData).forEach(selfId => {
      if (statusData[selfId]) {
        if (!statusData[selfId].selfId) {
          statusData[selfId].selfId = selfId
        }
        // 确保状态对象包含所有必要的字段
        if (!statusData[selfId].status) {
          logInfo(`[${selfId}] 状态对象缺少status字段，设置为init`)
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
  // 初始化全局函数
  logInfo = (message: string, ...args: any[]) => {
    if (config.loggerinfo) {
      ctx.logger.info(message, ...args);
    }
  };
  loggerInfo = (message: string, ...args: any[]) => {
    ctx.logger.info(message, ...args);
  };
  loggerError = (message: string, ...args: any[]) => {
    ctx.logger.error(message, ...args);
  };

  // 创建服务
  const service = new BilibiliService(ctx, config)
  ctx.bilibili_dm_service = service

  ctx.plugin({
    name: `bilibili-launcher-${config.selfId}`,
    apply: (ctx) => {
      logInfo(`[${config.selfId}] 创建BilibiliLauncher实例，selfId: ${config.selfId}`)
      return new BilibiliLauncher(ctx, service, config)
    }
  })

  ctx.plugin(BilibiliDmAdapter, {
    ...config,
    selfId: config.selfId
  })

  // 统一处理插件停用
  ctx.on('dispose', () => {
    logInfo(`[${config.selfId}] 插件正在停用，执行清理操作`)

    try {
      // 标记服务为已停用状态
      service.markAsDisposed()

      const adapters = ctx.bots
        .filter(bot => bot.platform === 'bilibili')
        .map(bot => bot.ctx.registry.get(BilibiliDmAdapter))
        .filter(Boolean)

      logInfo(`[${config.selfId}] 找到 ${adapters.length} 个需要停止的适配器实例`)

      adapters.forEach(adapter => {
        if (adapter && adapter.config) {
          try {
            logInfo(`[${adapter.config.selfId}] 正在停止适配器...`)
            adapter.dispose()
          } catch (err) {
            ctx.logger.error(`[${adapter.config.selfId}] 停止适配器失败: ${err.message}`)
          }
        }
      })

      logInfo(`[${config.selfId}] 所有适配器已停止，插件停用完成`)
    } catch (err) {
      ctx.logger.error(`[${config.selfId}] 插件停用过程中发生错误: ${err.message}`)
    }
  })
  ctx.logger.info(`[${config.selfId}] Bilibili 私信适配器启动。`)
}
