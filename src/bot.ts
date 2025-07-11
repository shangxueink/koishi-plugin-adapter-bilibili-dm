//  src\bot.ts
import { Bot, Context, h, Fragment, Logger } from 'koishi'
import { PrivateMessage } from './types'
import { BotConfig } from './schema'
import { HttpClient } from './http'
const logger = new Logger('adapter-bilibili-dm');
export class BilibiliDmBot extends Bot<Context, BotConfig> {
  public readonly http: HttpClient
  private logInfo: (...args: any[]) => void

  private _lastPollTs: number = 0 // 微秒

  // 消息ID的缓存，用于避免重复处理相同的消息
  // 轮询机制影响
  private _processedMsgIds: Set<string> = new Set()
  // 缓存的最大大小
  private readonly _maxCacheSize: number

  constructor(public ctx: Context, config: BotConfig) {
    super(ctx, config, 'bilibili')
    this.platform = 'bilibili'
    this.selfId = config.selfId

    // 初始化user属性
    this.user = {
      id: config.selfId,
      name: '',
      userId: config.selfId,
      avatar: '',
      username: ''
    }

    // 直接从service获取配置，确保每个实例使用正确的配置
    const serviceConfig = (ctx.bilibili_dm_service as any)?.config || {};

    // 创建一个配置副本，并确保selfId正确
    const botConfig = {
      ...serviceConfig,
      selfId: this.selfId // 确保使用当前机器人的selfId
    };

    logger.info(`[${this.selfId}] 创建BilibiliDmBot实例，selfId: ${this.selfId}`)
    this.http = new HttpClient(this.ctx, botConfig)
    this._lastPollTs = (Date.now() - 20 * 1000) * 1000

    this.logInfo = (ctx.bilibili_dm_service as any)?.logInfo || ((message: string, ...args: any[]) => {
      // 如果没有找到logInfo函数，使用默认的ctx.logger.info
      ctx.logger.info(`[${this.selfId}] ${message}`, ...args);
    });
    this._maxCacheSize = (ctx.bilibili_dm_service as any)?.config?.maxCacheSize || 1000;

    this.logInfo(`[${this.selfId}] BilibiliDmBot实例创建完成，准备启动`)
  }

  // 启动轮询
  async start() {
    this.logInfo(`[${this.selfId}] 开始启动机器人...`)

    // 确保 bot 状态正确更新
    await super.start()

    // 检查cookie是否已设置
    if (!this.http.hasCookies()) {
      this.logInfo(`[${this.selfId}] 警告：启动机器人时cookie未设置，可能导致轮询失败`)
    } else {
      this.logInfo(`[${this.selfId}] cookie已设置，准备开始轮询`)
    }

    // 延迟启动轮询，确保cookie已设置
    setTimeout(() => {
      this.startPolling()
      this.logInfo(`[${this.selfId}] 轮询已启动，机器人状态: ${this.online ? 'online' : 'offline'}`)
    }, 2000)

    this.logInfo(`[${this.selfId}] 机器人启动完成，状态: ${this.online ? 'online' : 'offline'}`)
  }

  async stop() {
    this.logInfo(`[${this.selfId}] 正在停止机器人...`)
    await super.stop()
    this.logInfo(`[${this.selfId}] 机器人已停止`)
  }

  private startPolling(): void {
    this.logInfo(`[${this.selfId}] 开始设置轮询定时器...`)

    // 首先检查cookie是否已验证
    if (!this.http.hasCookies()) {
      this.logInfo(`[${this.selfId}] 警告：启动轮询时cookie未验证，将延迟启动轮询`)

      // 如果cookie未验证，延迟5秒后再次尝试启动轮询
      this.ctx.setTimeout(() => {
        this.logInfo(`[${this.selfId}] 延迟后再次尝试启动轮询...`)
        this.startPolling()
      }, 5000)

      return
    }

    this.logInfo(`[${this.selfId}] cookie已验证，开始设置轮询定时器`)

    // 为每个机器人实例创建唯一的轮询定时器
    const intervalId = this.ctx.setInterval(() => {
      // 确保机器人在线才进行轮询
      if (this.online) {
        this.poll().catch(err => {
          logger.error(`[${this.selfId}] 轮询过程中发生错误: ${err.message}`)
        })
      }
    }, 3000)

    // 在机器人停止时清除定时器
    this.ctx.on('dispose', () => {
      intervalId()
      this.logInfo(`[${this.selfId}] 轮询定时器已清除`)
    })

    this.logInfo(`[${this.selfId}] 轮询定时器设置完成`)
  }
  private async poll() {
    // 如果 bot 不是 online 状态，则不进行轮询
    // 这可以作为一道额外的保险，防止在停用过程中执行
    if (!this.online) {
      this.logInfo(`[${this.selfId}] 机器人不在线，跳过轮询`)
      return
    }

    try {
      const pollTs = Date.now() * 1000
      const newSessionsData = await this.http.getNewSessions(this._lastPollTs)
      this._lastPollTs = pollTs

      // 如果API返回null（可能是cookie无效或网络错误），则跳过本次轮询
      if (!newSessionsData) {
        return
      }

      // 如果没有新会话，直接返回
      if (!newSessionsData.session_list?.length) {
        return
      }

      this.logInfo(`[${this.selfId}] 轮询到 ${newSessionsData.session_list.length} 个会话`)

      for (const session of newSessionsData.session_list) {
        if (session.unread_count > 0) {
          this.logInfo(`[${this.selfId}] 发现用户 ${session.talker_id} 的新消息 (未读数: ${session.unread_count})`)
          const messageData = await this.http.fetchSessionMessages(
            session.talker_id,
            session.session_type,
            session.ack_seqno,
          )

          if (messageData?.messages) {
            this.logInfo(`[${this.selfId}] 获取到 ${messageData.messages.length} 条消息`)
            for (const msg of messageData.messages.reverse()) {
              this.adaptMessage(msg, session.session_type, session.talker_id)
            }
          }
          await this.http.updateAck(session.talker_id, session.session_type, session.max_seqno)
        }
      }
    } catch (error) {
      // 检查错误类型，如果是 INACTIVE_EFFECT，则静默处理，因为这是预期的关闭行为
      if (error.code === 'INACTIVE_EFFECT') {
        logger.error(`[${this.selfId}] 关闭过程中由于上下文不活跃，跳过轮询。`)
        return
      }
      logger.error(`[${this.selfId}] 轮询过程中发生错误: %o`, error)
    }
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    const [type, talkerId] = channelId.split(':')
    if (type !== 'private' || !talkerId) return []

    const sentMessageIds: string[] = []
    const elements = h.normalize(content)

    //对元素进行处理
    let textBuffer = '' // 用于拼接连续的文本消息

    const flushTextBuffer = async () => {
      if (textBuffer.trim()) {
        const msgContent = { content: textBuffer.trim() }
        const success = await this.http.sendMessage(Number(this.selfId), Number(talkerId), JSON.stringify(msgContent), 1)
        if (success) {
          sentMessageIds.push(Date.now().toString())
        }
        textBuffer = '' // 清空缓冲区
      }
    }

    for (const element of elements) {
      try {

        if (element.type === 'text' && element.attrs.content) {
          // 如果是文本，先存入缓冲区
          textBuffer += element.attrs.content
        } else if ((element.type === 'image' || element.type === 'img') && (element.attrs.url || element.attrs.src)) {
          const elementAttrsUrl = element.attrs.url || element.attrs.src
          // 遇到图片时，先将之前缓冲的文本发送出去
          await flushTextBuffer()
          // 然后单独处理 发送图片
          const imageData = await this.ctx.http.file(elementAttrsUrl)
          const imageBuffer = imageData.data
          const imageType = imageData.mime || imageData.type

          const uploadResult = await this.http.uploadImage(Buffer.from(imageBuffer));
          if (!uploadResult) {
            logger.warn(`图片上传失败，URL: ${elementAttrsUrl}`)
            continue
          }
          const msgContent = {
            url: uploadResult.image_url,
            width: uploadResult.image_width,
            height: uploadResult.image_height,
            imageType: imageType,
            size: uploadResult.img_size || 0,
            original: 1
          }
          const success = await this.http.sendMessage(Number(this.selfId), Number(talkerId), JSON.stringify(msgContent), 2)
          if (success) {
            sentMessageIds.push(Date.now().toString() + '_img')
          }
        }
        // TODO 为其他元素类型 (如 at 等) 添加更多 else if 分支
        // 不支持at
      } catch (error) {
        logger.error('发送消息元素时发生错误: %o', error)
      }
    }

    // 循环结束后 发送最后剩余的文本
    await flushTextBuffer()

    return sentMessageIds
  }

  private async adaptMessage(msg: PrivateMessage, sessionType: number, talkerId: number) {
    if (msg.sender_uid.toString() === this.selfId) return

    // 检查消息ID是否已经处理过，如果是，则跳过
    const msgId = msg.msg_key
    if (this._processedMsgIds.has(msgId)) {
      this.logInfo(`跳过已处理的消息: ${msgId}`)
      return
    }

    // 将消息ID添加到缓存中
    this._processedMsgIds.add(msgId)

    // 如果缓存太大，删除最旧的消息ID
    if (this._processedMsgIds.size > this._maxCacheSize) {
      const oldestId = this._processedMsgIds.values().next().value
      this._processedMsgIds.delete(oldestId)
    }

    let contentFragment: Fragment
    try {
      const parsedContent = JSON.parse(msg.content)
      switch (msg.msg_type) {
        case 1:
          contentFragment = h.parse(parsedContent.content)
          break
        case 2:
          contentFragment = h('image', { url: parsedContent.url })
          break
        case 5:
          contentFragment = h('text', { content: `[消息已撤回]` })
          break
        default:
          this.logInfo(`不支持的消息类型: ${msg.msg_type}, 内容: ${msg.content}`)
          contentFragment = `[Unsupported message type: ${msg.msg_type}]`
          break
      }
    } catch (e) {
      this.logInfo(`解析消息内容失败: ${msg.content}, 错误: ${e}`)
      contentFragment = '[消息解析失败]'
    }

    if (!contentFragment) return
    this.logInfo(`正在获取用户昵称头像`)
    let userInfo
    try {
      userInfo = await this.http.getUser(msg.sender_uid.toString());
    } catch (e) {
      this.logInfo(`头像昵称信息获取失败`)
    }

    const session = this.session({
      type: 'message',
      platform: this.platform,
      selfId: this.selfId,
      timestamp: msg.timestamp * 1000,
      channel: {
        id: sessionType === 1 ? `private:${talkerId}` : `${talkerId}`,
        type: sessionType === 1 ? 1 : 0,
      },
      user: {
        id: msg.sender_uid.toString(),
        name: userInfo.nickname,
        username: userInfo.nickname,
        avatar: userInfo.avatar,
      },
      message: {
        id: msg.msg_key,
        elements: h.normalize(contentFragment),
        content: h.normalize(contentFragment).join(''),
        timestamp: msg.timestamp * 1000,
        quote: msg.msg_status === 1 ? {
          id: msg.msg_key,
          content: '该消息已被发送者撤回',
          timestamp: msg.timestamp * 1000,
          user: { id: msg.sender_uid.toString() }
        } : undefined,
      },
    })

    if (msg.msg_status === 1) {
      this.dispatch(this.session({
        type: 'message-deleted',
        platform: this.platform,
        selfId: this.selfId,
        timestamp: Date.now(),
        channel: { id: sessionType === 1 ? `private:${talkerId}` : `${talkerId}`, type: sessionType === 1 ? 1 : 0 },
        user: { id: msg.sender_uid.toString() },
        message: { id: msg.msg_key }
      }))
    } else {
      this.dispatch(session)
    }
  }
}
