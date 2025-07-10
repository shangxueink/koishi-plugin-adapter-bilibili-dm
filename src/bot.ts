import { Bot, Context, h, Logger, Fragment } from 'koishi'
import { BotConfig } from './schema'
import { HttpClient } from './http'
import { PrivateMessage } from './types'

const logger = new Logger('bilibili-dm:bot')

export class BilibiliDmBot extends Bot<Context, BotConfig> {
  public readonly http: HttpClient
  public username: string

  // 移除 _pollInterval，因为 ctx.setInterval 会自动管理
  private _lastPollTs: number = 0 // 使用微秒

  // 构造函数中增加对 ctx 的引用，以供后续使用
  constructor(public ctx: Context, config: BotConfig) {
    super(ctx, config,'bilibili')
    this.platform = 'bilibili'
    this.selfId = config.selfId
    this.username = ''

    // 注入 this.ctx
    this.http = new HttpClient(this.ctx)
    this._lastPollTs = (Date.now() - 20 * 1000) * 1000
  }

  // 修正：start 方法现在负责启动轮询
  async start() {
    this.startPolling()
    // 调用 super.start() 以确保 bot 状态正确更新
    await super.start()
  }

  // stop 方法现在可以简化，因为 ctx 会自动清理定时器
  async stop() {
    logger.info(`[${this.selfId}] Stopping bot...`)
    // 无需手动调用 stopPolling()
    await super.stop()
  }

  private startPolling(): void {
    logger.info(`[${this.selfId}] Starting polling for private messages...`)
    
    // 修正：使用 ctx.setInterval 代替 setInterval
    // 这将定时器与插件的生命周期绑定，在插件停用时自动清除
    this.ctx.setInterval(() => this.poll(), 3000)
  }

  // stopPolling 方法不再需要，可以移除
  // private stopPolling(): void { ... }

  private async poll() {
    // 增加一个状态检查，如果 bot 不是 online 状态，则不进行轮询
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
          logger.debug(`[${this.selfId}] New messages in session with talker_id: ${session.talker_id} (unread: ${session.unread_count})`)
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
        logger.debug('Polling skipped due to inactive context during shutdown.')
        return
      }
      logger.error(`[${this.selfId}] Error during polling: %o`, error)
    }
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    const [type, talkerId] = channelId.split(':')
    if (type !== 'private' || !talkerId) return []

    const sentMessageIds: string[] = []
    const elements = h.normalize(content)

    // ======================= 关键修正 =======================
    // 不再对每个元素都调用API，而是先对元素进行分组和处理

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
        } else if (element.type === 'image' && element.attrs.url) {
          // 遇到图片时，先将之前缓冲的文本发送出去
          await flushTextBuffer()

          // 然后单独处理和发送图片
          const imageBuffer = await this.ctx.http.get(element.attrs.url, { responseType: 'arraybuffer' })
          const uploadResult = await this.http.uploadImage(Buffer.from(imageBuffer))
          if (!uploadResult) {
            this.logger.warn(`Image upload failed for url: ${element.attrs.url}`)
            continue
          }
          const msgContent = {
            url: uploadResult.image_url,
            height: uploadResult.image_height,
            width: uploadResult.image_width,
          }
          const success = await this.http.sendMessage(Number(this.selfId), Number(talkerId), JSON.stringify(msgContent), 2)
          if (success) {
            sentMessageIds.push(Date.now().toString() + '_img')
          }
        }
        // 可以为其他元素类型 (如 at, face 等) 添加更多 else if 分支
      } catch (error) {
        this.logger.error('Error sending message element: %o', error)
      }
    }

    // 循环结束后，不要忘记发送最后剩余的文本
    await flushTextBuffer()
    // ========================================================

    return sentMessageIds
}

  private adaptMessage(msg: PrivateMessage, sessionType: number, talkerId: number) {
    if (msg.sender_uid.toString() === this.selfId) return

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
          logger.debug(`Unsupported message type: ${msg.msg_type}, content: ${msg.content}`)
          contentFragment = `[Unsupported message type: ${msg.msg_type}]`
          break
      }
    } catch (e) {
      logger.warn(`Failed to parse message content: ${msg.content}, error: ${e}`)
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