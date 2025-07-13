//  src\bot.ts
import { logInfo, loggerError, loggerInfo } from './index'
import { Bot, Context, h, Fragment } from 'koishi'
import { PrivateMessage } from './types'
import { PluginConfig } from './schema'
import { HttpClient } from './http'

export class BilibiliDmBot extends Bot<Context, PluginConfig> {
  public readonly http: HttpClient
  private _lastPollTs: number = 0 // 毫秒
  private _processedMsgIds: Set<string> = new Set()
  private readonly _maxCacheSize: number
  private _cleanupFunctions: Array<() => void> = []
  public readonly pluginConfig: PluginConfig
  private isStopping: boolean = false;
  private _botOnlineTimestamp: number = 0;

  constructor(public ctx: Context, config: PluginConfig) {
    super(ctx, config, 'bilibili')
    this.platform = 'bilibili'
    this.selfId = config.selfId
    this.pluginConfig = config

    this.user = {
      id: config.selfId,
      name: '',
      userId: config.selfId,
      avatar: '',
      username: ''
    }

    this.http = new HttpClient(this.ctx, this.pluginConfig)
    this._lastPollTs = Date.now() - 20 * 1000 // 获取过去20秒的消息 (毫秒)
    this._maxCacheSize = this.pluginConfig.maxCacheSize || 1000;

    logInfo(`[${this.selfId}] BilibiliDmBot实例创建完成，准备启动`)
  }

  async start() {
    logInfo(`[${this.selfId}] 开始启动机器人...`)
    await super.start()

    if (this.pluginConfig.ignoreOfflineMessages) {
      this._botOnlineTimestamp = Date.now(); // 记录机器人上线时间 (毫秒)
      logInfo(`[${this.selfId}] 已开启“不响应机器人离线的未读消息”功能，机器人上线时间戳已记录。`);
    }
    // 无论是否忽略离线消息，首次轮询都从当前时间开始，避免处理启动前的旧会话
    this._lastPollTs = Date.now(); // 毫秒
    logInfo(`[${this.selfId}] _lastPollTs 已设置为当前时间，确保从最新会话开始轮询。`);

    if (!this.http.hasCookies()) {
      logInfo(`[${this.selfId}] 警告：启动机器人时cookie未设置，可能导致轮询失败`)
    } else {
      logInfo(`[${this.selfId}] cookie已设置，准备开始轮询`)
    }

    setTimeout(() => {
      this.startPolling()
      logInfo(`[${this.selfId}] 轮询已启动，机器人状态: ${this.online ? 'online' : 'offline'}`)
    }, 2000)

    logInfo(`[${this.selfId}] 机器人启动完成，状态: ${this.online ? 'online' : 'offline'}`)
  }

  async stop() {
    this.isStopping = true; // 停止
    logInfo(`[${this.selfId}] 正在停止机器人...`)
    logInfo(`[${this.selfId}] 执行清理函数，数量: ${this._cleanupFunctions.length}`)
    for (const cleanup of this._cleanupFunctions) {
      try {
        cleanup()
      } catch (err) {
        loggerError(`[${this.selfId}] 执行清理函数时出错: `, err)
      }
    }
    this._cleanupFunctions = []
    await super.stop()
  }

  addCleanup(fn: () => void) {
    this._cleanupFunctions.push(fn)
  }

  private startPolling(): void {
    logInfo(`[${this.selfId}] 开始设置轮询定时器...`)

    if (!this.http.hasCookies()) {
      logInfo(`[${this.selfId}] 警告：启动轮询时cookie未验证，将延迟启动轮询`)
      try {
        this.ctx.setTimeout(() => {
          if (!this.http.isDisposed && !this.isStopping) {
            logInfo(`[${this.selfId}] 延迟后再次尝试启动轮询...`)
            this.startPolling()
          } else {
            logInfo(`[${this.selfId}] 插件已停用或正在停止，跳过延迟后的轮询启动`)
          }
        }, 5000)
      } catch (err) {
        if (err.code === 'INACTIVE_EFFECT') {
          logInfo(`[${this.selfId}] 上下文已不活跃，跳过设置延迟轮询定时器`)
          this.http.isDisposed = true
        } else {
          loggerError(`[${this.selfId}] 设置延迟轮询定时器时出错: `, err)
        }
      }
      return
    }

    logInfo(`[${this.selfId}] cookie已验证，开始设置轮询定时器`)

    try {
      // 只有当机器人在线且没有停止时才设置定时器
      if (!this.http.isDisposed && this.online && !this.isStopping) {
        const pollInterval = this.pluginConfig.pollInterval;
        const intervalId = this.ctx.setInterval(() => {
          if (this.online && !this.isStopping) { // 检查
            this.poll().catch(err => {
              if (err.code === 'INACTIVE_EFFECT') {
                logInfo(`[${this.selfId}] 关闭过程中，跳过轮询。`)
                return
              }
              loggerError(`[${this.selfId}] 轮询过程中发生错误: `, err)
            })
          } else {
            logInfo(`[${this.selfId}] 机器人不在线或正在停止，停止轮询定时器回调。`)
            try {
              intervalId();
              logInfo(`[${this.selfId}] 轮询定时器在回调中被清除，因为机器人不在线或正在停止。`);
            } catch (err) {
              loggerError(`[${this.selfId}] 在回调中清除轮询定时器时出错: `, err);
            }
          }
        }, pollInterval)

        this.addCleanup(() => {
          try {
            intervalId()
            logInfo(`[${this.selfId}] 轮询定时器已清除`)
          } catch (err) {
            loggerError(`[${this.selfId}] 清除轮询定时器时出错: `, err)
          }
        })
      } else {
        logInfo(`[${this.selfId}] 机器人不在线或正在停止，跳过设置轮询定时器。`)
      }
    } catch (err) {
      loggerError(`[${this.selfId}] 设置轮询定时器时出错: `, err)
    }

    logInfo(`[${this.selfId}] 轮询定时器设置完成`)
  }

  private async poll() {
    if (!this.online || this.isStopping) {
      logInfo(`[${this.selfId}] 机器人不在线或正在停止，跳过轮询`)
      return
    }

    try {
      const pollTs = Date.now() // 毫秒
      const newSessionsData = await this.http.getNewSessions(this._lastPollTs)

      if (this.isStopping) {
        logInfo(`[${this.selfId}] 机器人正在停止，在获取会话数据后跳过后续轮询处理。`)
        return
      }

      if (!newSessionsData) {
        // 如果没有新会话数据，直接返回
        this._lastPollTs = pollTs; // 即使没有新会话，也更新时间戳
        return
      }

      if (!newSessionsData.session_list?.length) {
        // 如果会话列表为空，也更新 _lastPollTs，确保下次从当前时间开始轮询
        this._lastPollTs = pollTs;
        return
      }

      for (const session of newSessionsData.session_list) {
        if (session.unread_count > 0) {
          logInfo(`[${this.selfId}] 发现用户 ${session.talker_id} 的新消息 (未读数: ${session.unread_count})`)
          const messageData = await this.http.fetchSessionMessages(
            session.talker_id,
            session.session_type,
            session.ack_seqno,
          )

          if (this.isStopping) {
            logInfo(`[${this.selfId}] 机器人正在停止，在获取消息数据后跳过后续轮询处理。`)
            return
          }

          if (messageData?.messages) {
            logInfo(`[${this.selfId}] 获取到 ${messageData.messages.length} 条消息`)
            for (const msg of messageData.messages.reverse()) {
              // 如果开启了忽略离线消息，并且消息时间戳早于机器人上线时间，则跳过
              if (this.pluginConfig.ignoreOfflineMessages && msg.timestamp * 1000 < this._botOnlineTimestamp) {
                logInfo(`[${this.selfId}] 跳过离线期间的消息 (UID: ${msg.sender_uid}, MsgKey: ${msg.msg_key})`);
                continue;
              }
              this.adaptMessage(msg, session.session_type, session.talker_id)
            }
          }
          await this.http.updateAck(session.talker_id, session.session_type, session.max_seqno)
        }
      }
      // 在处理完所有会话后，更新 _lastPollTs 为当前轮询时间
      this._lastPollTs = pollTs;
    } catch (error) {
      if (error.code === 'INACTIVE_EFFECT') {
        logInfo(`[${this.selfId}] 关闭过程中，跳过轮询。`)
        return
      }
      loggerError(`[${this.selfId}] 轮询过程中发生错误: %o`, error)
    }
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    const [type, talkerId] = channelId.split(':')
    if (type !== 'private' || !talkerId) return []

    const sentMessageIds: string[] = []
    const elements = h.normalize(content)

    let textBuffer = ''

    const flushTextBuffer = async () => {
      if (textBuffer.trim()) {
        const msgContent = { content: textBuffer.trim() }
        const success = await this.http.sendMessage(Number(this.selfId), Number(talkerId), JSON.stringify(msgContent), 1)
        if (success) {
          sentMessageIds.push(Date.now().toString())
        }
        textBuffer = ''
      }
    }

    for (const element of elements) {
      try {
        if (element.type === 'text' && element.attrs.content) {
          textBuffer += element.attrs.content
        } else if ((element.type === 'image' || element.type === 'img') && (element.attrs.url || element.attrs.src)) {
          await flushTextBuffer()
          const elementAttrsUrl = element.attrs.url || element.attrs.src
          const imageData = await this.http.safeFileRequest(elementAttrsUrl, `下载图片失败，URL: ${elementAttrsUrl}`)

          if (!imageData) {
            loggerError(`图片下载失败，URL: ${elementAttrsUrl}`)
            continue
          }

          const imageBuffer = imageData.data
          const imageType = imageData.mime || imageData.type

          const uploadResult = await this.http.uploadImage(imageBuffer);
          if (!uploadResult) {
            loggerError(`图片上传失败，URL: ${elementAttrsUrl}`)
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
      } catch (error) {
        loggerError('发送消息元素时发生错误: %o', error)
      }
    }

    await flushTextBuffer()

    return sentMessageIds
  }

  private async adaptMessage(msg: PrivateMessage, sessionType: number, talkerId: number) {
    if (msg.sender_uid.toString() === this.selfId) return

    // 屏蔽的UID
    const senderUid = msg.sender_uid.toString();
    if (this.pluginConfig.blockedUids && this.pluginConfig.blockedUids.some(blocked => blocked.uid === senderUid)) {
      logInfo(`屏蔽来自UID ${senderUid} 的消息。`)
      return
    }

    const msgId = msg.msg_key
    if (this._processedMsgIds.has(msgId)) {
      logInfo(`跳过已处理的消息: ${msgId}`)
      return
    }

    this._processedMsgIds.add(msgId)

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
          logInfo(`不支持的消息类型: ${msg.msg_type}, 内容: ${msg.content}`)
          contentFragment = `[Unsupported message type: ${msg.msg_type}]`
          break
      }
    } catch (e) {
      loggerError(`解析消息内容失败: ${msg.content}, 错误: `, e)
      contentFragment = '[消息解析失败]'
    }

    if (!contentFragment) return
    logInfo(`正在获取用户昵称头像`)
    let userInfo
    try {
      userInfo = await this.http.getUser(msg.sender_uid.toString());
    } catch (e) {
      loggerError(`头像昵称信息获取失败:`, e)
    }

    const session = this.session({
      type: 'message',
      platform: this.platform,
      selfId: this.selfId,
      timestamp: msg.timestamp * 1000, // 毫秒
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
        timestamp: msg.timestamp * 1000, // 毫秒
        quote: msg.msg_status === 1 ? {
          id: msg.msg_key,
          content: '该消息已被发送者撤回',
          timestamp: msg.timestamp * 1000, // 毫秒
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
