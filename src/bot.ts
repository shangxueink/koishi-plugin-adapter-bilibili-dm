import { Bot, Context, h, Fragment } from 'koishi'
import { PrivateMessage } from './types'
import { BotConfig } from './schema'
import { HttpClient } from './http'

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

    this.http = new HttpClient(this.ctx)
    this._lastPollTs = (Date.now() - 20 * 1000) * 1000

    this.logInfo = (ctx.bilibili_dm_service as any)?.logInfo || ((message: string, ...args: any[]) => {
      // 如果没有找到logInfo函数，使用默认的ctx.logger.info
      ctx.logger.info(message, ...args);
    });
    this._maxCacheSize = (ctx.bilibili_dm_service as any)?.config?.maxCacheSize || 1000;
  }

  // 启动轮询
  async start() {
    this.startPolling()
    // 确保 bot 状态正确更新
    await super.start()
  }

  async stop() {
    this.logInfo(`正在停止机器人...`)
    await super.stop()
  }

  private startPolling(): void {
    // (this.ctx.bilibili_dm_service as any).logInfo(`开始轮询私信消息...`)
    this.ctx.setInterval(() => this.poll(), 3000)
  }
  private async poll() {
    // 如果 bot 不是 online 状态，则不进行轮询
    // 这可以作为一道额外的保险，防止在停用过程中执行
    if (!this.online) return

    try {
      const pollTs = Date.now() * 1000
      const newSessionsData = await this.http.getNewSessions(this._lastPollTs)
      this._lastPollTs = pollTs

      if (!newSessionsData || !newSessionsData.session_list?.length) {
        return
      }

      for (const session of newSessionsData.session_list) {
        if (session.unread_count > 0) {
          this.logInfo(`发现用户 ${session.talker_id} 的新消息 (未读数: ${session.unread_count})`)
          const messageData = await this.http.fetchSessionMessages(
            session.talker_id,
            session.session_type,
            session.ack_seqno,
          )

          if (messageData?.messages) {
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
        this.ctx.logger.error('关闭过程中由于上下文不活跃，跳过轮询。')
        return
      }
      this.ctx.logger.error(`轮询过程中发生错误: %o`, error)
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
            this.ctx.logger.warn(`图片上传失败，URL: ${elementAttrsUrl}`)
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
      } catch (error) {
        this.ctx.logger.error('发送消息元素时发生错误: %o', error)
      }
    }

    // 循环结束后 发送最后剩余的文本
    await flushTextBuffer()

    return sentMessageIds
  }

  private adaptMessage(msg: PrivateMessage, sessionType: number, talkerId: number) {
    if (msg.sender_uid.toString() === this.selfId) return

    // 检查消息ID是否已经处理过，如果是，则跳过
    const msgId = msg.msg_key.toString()
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
      },
      message: {
        id: msg.msg_key.toString(),
        elements: h.normalize(contentFragment),
        content: h.normalize(contentFragment).join(''),
        timestamp: msg.timestamp * 1000,
        quote: msg.msg_status === 1 ? {
          id: msg.msg_key.toString(),
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
        message: { id: msg.msg_key.toString() }
      }))
    } else {
      this.dispatch(session)
    }
  }
}
