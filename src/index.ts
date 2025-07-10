import { Context, Schema } from 'koishi'
import { BilibiliDmAdapter } from './adapter'
import { BilibiliService } from './service'
import { Config, PluginConfig, BotConfig } from './schema'
import { DataService } from '@koishijs/plugin-console'
import { resolve } from 'path'
import { BilibiliDmBot } from './bot'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'

export const name = 'adapter-bilibili-dm'
export { Config }
export const inject = ['http', 'server', 'console']
export const filter = false
export const usage = `

---

Bilibili Direct Message Adapter for Koishi

---
`

export interface BotStatus {
  status: 'init' | 'qrcode' | 'continue' | 'success' | 'error' | 'offline'
  selfId: string
  image?: string
  message?: string
}

export type { BotLoginStatus } from './service'

// 自定义事件
declare module 'koishi' {
  interface Context {
    bilibili_dm_service: BilibiliService
  }

  interface Events {
    'bilibili-dm/status-update': (status: BotStatus) => void
  }
}

declare module '@koishijs/plugin-console' {
  namespace Console {
    interface Services {
      'bilibili-dm': BilibiliLauncher
    }
  }
}

declare module '@koishijs/plugin-console' {
  interface Events {
    'bilibili-dm/start-login': (data: { selfId: string }) => void
  }
}

// 数据服务
export class BilibiliLauncher extends DataService<BotStatus> {
  private currentBot: string
  private consoleMessage: BotStatus = { status: 'init', selfId: '', message: '初始化中...' }

  constructor(ctx: Context, private service: BilibiliService) {
    super(ctx, 'bilibili-dm')

    // 监听状态更新事件
    ctx.on('bilibili-dm/status-update', (status: BotStatus) => {
      service.logInfo(`收到状态更新通知: ${status.selfId} -> ${status.status}`)

      // 更新控制台消息
      this.consoleMessage = status

      if (status.status === 'qrcode') {
        service.logInfo(`二维码已生成，准备推送到前端，图片数据长度: ${status.image?.length || 0}`)
      }

      // 刷新前端数据
      this.refresh()
    })

    // 注册前端组件
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    // 处理前端发来的登录请求
    ctx.console.addListener('bilibili-dm/start-login', async (data: { selfId: string }) => {
      const selfId = data.selfId
      this.currentBot = selfId

      service.logInfo(`收到前端登录请求: ${selfId}`)
      service.logInfo(`当前机器人列表: ${ctx.bots.map(bot => `${bot.platform}:${bot.selfId}`).join(', ')}`)

      // 更新状态为初始化
      this.consoleMessage = { status: 'init', selfId, message: '正在初始化...' }
      this.refresh()

      // 创建机器人
      const botConfig: BotConfig = {
        selfId: selfId
      }

      // 创建新机器人实例
      const bot = new BilibiliDmBot(ctx, botConfig)
      const sessionFile = resolve(ctx.baseDir, 'data', 'adapter-bilibili-dm', `${selfId}.cookie.json`)

      // 检查是否存在cookie文件，如果存在则删除
      try {
        if (existsSync(sessionFile)) {
          service.logInfo(`删除旧的cookie文件: ${sessionFile}`)
          await fs.unlink(sessionFile)
        }
      } catch (error) {
        this.ctx.logger.error(`删除cookie文件失败: ${error.message}`)
      }

      // 启动登录流程
      await this.service.startLogin(bot, sessionFile)
    })
  }

  // 获取控制台消息
  async get() {
    // this.service.logInfo(`收到前端获取状态数据请求: ${JSON.stringify(this.consoleMessage)}`)

    // 如果有二维码，记录日志
    if (this.consoleMessage.status === 'qrcode' && this.consoleMessage.image) {
      this.service.logInfo(`返回二维码数据给前端，图片数据长度: ${this.consoleMessage.image.length} 字节`)
    }

    return this.consoleMessage
  }
}

export function apply(ctx: Context, config: PluginConfig) {
  // 创建服务
  const service = new BilibiliService(ctx, config)
  ctx.bilibili_dm_service = service

  // 注册数据服务
  ctx.plugin(BilibiliLauncher, service)

  // 注册适配器
  ctx.plugin(BilibiliDmAdapter, config)
}
