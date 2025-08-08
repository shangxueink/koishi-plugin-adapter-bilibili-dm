//  src\bot.ts
import { logInfo, loggerError, loggerInfo } from '../index'
import { } from '@koishijs/plugin-notifier'
import { Bot, Context, h, Fragment, Session } from 'koishi'
import { PrivateMessage } from './types'
import { PluginConfig } from './schema'
import { HttpClient } from './http'
import { Internal } from '../bilibiliAPI/internal'

declare module 'koishi' {
  interface Context {
    internal: Internal;
  }

  interface Events {
    'bilibili/live'(data: {
      id: string;
      uid: string;
      name: string;
      avatar: string;
      timestamp: number;
      action: string;
      type: string;
      room_id: string;
      title: string;
      cover: string;
      jump_url: string;
    }): void;
    'bilibili/dynamic'(data: {
      id: string;
      uid: string;
      name: string;
      avatar: string;
      timestamp: number;
      action: string;
      type: string;
      text: string;
      jump_url: string;
      cover: string;
      title?: string;
      description?: string;
      bvid?: string;
      aid?: string;
      images?: string[];
      cvid?: number;
    }): void;
  }
}

export class BilibiliDmBot extends Bot<Context, PluginConfig> {
  private lastPollTs: number = 0 // 毫秒
  private processedMsgIds: Set<string> = new Set()
  private readonly _maxCacheSize: number
  private cleanupFunctions: Array<() => void> = []
  private isStopping: boolean = false;
  private botOnlineTimestamp: number = 0;
  private consecutiveFailures: number = 0;
  private currentPollInterval: number;

  public readonly http: HttpClient
  public readonly pluginConfig: PluginConfig
  public readonly internal: Internal; // 修改为 internal 属性

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
    this.lastPollTs = Date.now() - 20 * 1000 // 获取过去20秒的消息 (毫秒)
    this._maxCacheSize = this.pluginConfig.maxCacheSize || 1000;
    this.consecutiveFailures = 0;
    this.currentPollInterval = this.pluginConfig.pollInterval;

    this.internal = new Internal(this, this.ctx);

    logInfo(`[${this.selfId}] BilibiliDmBot实例创建完成，准备启动`)
  }

  addCleanup(fn: () => void) {
    this.cleanupFunctions.push(fn)
  }

  private handlePollSuccess() {
    if (this.consecutiveFailures > 0) {
      logInfo(`[${this.selfId}] 轮询恢复正常，重置失败计数 (之前连续失败 ${this.consecutiveFailures} 次)`)
      this.consecutiveFailures = 0
      this.currentPollInterval = this.pluginConfig.pollInterval
    }
  }

  private handlePollFailure() {
    this.consecutiveFailures++

    if (this.consecutiveFailures >= this.pluginConfig.pollAutoShutdownThreshold) {
      loggerError(`[${this.selfId}] 连续轮询失败 ${this.consecutiveFailures} 次，达到自动关闭阈值 (${this.pluginConfig.pollAutoShutdownThreshold})，即将关闭插件`)
      this.autoShutdown()
      return
    }

    if (this.consecutiveFailures >= this.pluginConfig.pollFailureThreshold) {
      // 增加轮询间隔，最大不超过原间隔的5倍
      const multiplier = Math.min(Math.floor(this.consecutiveFailures / this.pluginConfig.pollFailureThreshold) + 1, 5)
      this.currentPollInterval = this.pluginConfig.pollInterval * multiplier
      loggerError(`[${this.selfId}] 连续轮询失败 ${this.consecutiveFailures} 次，已增加轮询间隔至 ${this.currentPollInterval}ms (原间隔: ${this.pluginConfig.pollInterval}ms)`)
    } else {
      loggerError(`[${this.selfId}] 连续轮询失败 ${this.consecutiveFailures} 次`)
    }
  }

  private async autoShutdown() {
    try {
      // 创建通知器
      const notifier = this.ctx.notifier?.create()
      if (notifier) {
        let countdown = 6

        const notify = () => notifier.update(`<p>插件 adapter-bilibili-dm (ID: ${this.selfId}) 因连续轮询失败将在 ${countdown} 秒后关闭……</p><p>失败原因可能是 Cookie 失效或网络问题</p>`)

        while (--countdown > 0) {
          notify()
          try {
            await this.ctx.sleep(1000)
          } catch {
            return // 如果上下文已停用，直接返回
          }
        }
      } else {
        // 如果没有通知器，直接等待3秒
        try {
          await this.ctx.sleep(3000)
        } catch {
          return
        }
      }

      // 关闭插件     
      loggerError(`[${this.selfId}] 正在关闭插件...`)
      this.ctx.scope.dispose()

    } catch (error) {
      loggerError(`[${this.selfId}] 自动关闭插件过程中发生错误: `, error)
      // 即使出错也要尝试关闭
      try {
        this.ctx.scope.dispose()
      } catch (disposeError) {
        loggerError(`[${this.selfId}] 强制关闭插件失败: `, disposeError)
      }
    }
  }
  // #region basic API
  private startPolling(): void {
    logInfo(`[${this.selfId
      }] 开始设置轮询定时器...`)

    if (!this.http.hasCookies()) {
      logInfo(`[${this.selfId}]警告：启动轮询时cookie未验证，将延迟启动轮询`)
      try {
        this.ctx.setTimeout(() => {
          if (!this.http.isDisposed && !this.isStopping) {
            logInfo(`[${this.selfId}] 延迟后再次尝试启动轮询...`)
            this.startPolling()
          } else {
            logInfo(`[${this.selfId}]插件已停用或正在停止，跳过延迟后的轮询启动`)
          }
        }, 5000)
      } catch (err) {
        if (err.code === 'INACTIVE_EFFECT') {
          logInfo(`[${this.selfId}]上下文已不活跃，跳过设置延迟轮询定时器`)
          this.http.isDisposed = true
        } else {
          loggerError(`[${this.selfId}]设置延迟轮询定时器时出错: `, err)
        }
      }
      return
    }

    logInfo(`[${this.selfId}]cookie已验证，开始设置轮询定时器`)
    this.startContinuousPolling()
  }

  private startDynamicPolling(): void {
    if (!this.pluginConfig.enableDynamicPolling) {
      logInfo(`[${this.selfId}] 动态监听已禁用`)
      return
    }

    logInfo(`[${this.selfId}] 开始设置动态监听定时器...`)

    if (!this.http.hasCookies()) {
      logInfo(`[${this.selfId}]警告：启动动态监听时cookie未验证，将延迟启动动态监听`)
      try {
        this.ctx.setTimeout(() => {
          if (!this.http.isDisposed && !this.isStopping) {
            logInfo(`[${this.selfId}] 延迟后再次尝试启动动态监听...`)
            this.startDynamicPolling()
          } else {
            logInfo(`[${this.selfId}]插件已停用或正在停止，跳过延迟后的动态监听启动`)
          }
        }, 5000)
      } catch (err) {
        if (err.code === 'INACTIVE_EFFECT') {
          logInfo(`[${this.selfId}]上下文已不活跃，跳过设置延迟动态监听定时器`)
        } else {
          loggerError(`[${this.selfId}]设置延迟动态监听定时器时出错: `, err)
        }
      }
      return
    }

    // 将秒转换为毫秒
    const dynamicIntervalSeconds = this.pluginConfig.dynamicPollInterval || 60
    const dynamicInterval = dynamicIntervalSeconds * 1000

    logInfo(`[${this.selfId}]cookie已验证，启动动态监听，轮询间隔: ${dynamicIntervalSeconds}秒 (${dynamicInterval}ms)`)
    this.internal.startDynamicPolling(dynamicInterval)
  }

  private startContinuousPolling(): void {
    if (!this.online || this.isStopping || this.http.isDisposed) {
      return
    }

    try {
      const intervalId = this.ctx.setInterval(async () => {
        if (!this.online || this.isStopping || this.http.isDisposed) {
          return
        }

        try {
          await this.poll()
        } catch (err) {
          if (err.code === 'INACTIVE_EFFECT') {
            logInfo(`[${this.selfId}]关闭过程中，跳过轮询。`)
            return
          }
          loggerError(`[${this.selfId}]轮询过程中发生错误: `, err)
        }
      }, this.currentPollInterval)

      // 一次清理函数
      this.addCleanup(() => {
        try {
          intervalId()
          logInfo(`[${this.selfId}]轮询定时器已清除`)
        } catch (err) {
          loggerError(`[${this.selfId}]清除轮询定时器时出错: `, err)
        }
      })
    } catch (err) {
      loggerError(`[${this.selfId}]设置轮询定时器时出错: `, err)
    }
  }

  private async poll() {
    if (!this.online || this.isStopping) {
      logInfo(`[${this.selfId}]机器人不在线或正在停止，跳过轮询`)
      return
    }

    try {
      const pollTs = Date.now() // 毫秒
      const newSessionsData = await this.http.getNewSessions(this.lastPollTs)

      if (this.isStopping) {
        logInfo(`[${this.selfId}]机器人正在停止，在获取会话数据后跳过后续轮询处理。`)
        return
      }

      if (!newSessionsData) {
        // 轮询失败，增加失败计数
        this.handlePollFailure()
        return
      }

      // 轮询成功，重置失败计数和轮询间隔
      this.handlePollSuccess()

      if (!newSessionsData.session_list?.length) {
        // 如果会话列表为空，也更新 lastPollTs，确保下次从当前时间开始轮询
        this.lastPollTs = pollTs;
        return
      }

      for (const session of newSessionsData.session_list) {
        if (session.unread_count > 0) {
          logInfo(`[${this.selfId}] 发现用户 ${session.talker_id} 的新消息(未读数: ${session.unread_count})`)
          const messageData = await this.http.fetchSessionMessages(
            session.talker_id,
            session.session_type,
            session.ack_seqno,
          )

          if (this.isStopping) {
            logInfo(`[${this.selfId}]机器人正在停止，在获取消息数据后跳过后续轮询处理。`)
            return
          }

          if (messageData?.messages) {
            logInfo(`[${this.selfId}] 获取到 ${messageData.messages.length} 条消息`)
            for (const msg of messageData.messages.reverse()) {
              // 如果开启了忽略离线消息，并且消息时间戳早于机器人上线时间，则跳过
              if (this.pluginConfig.ignoreOfflineMessages && msg.timestamp * 1000 < this.botOnlineTimestamp) {
                logInfo(`[${this.selfId}]跳过离线期间的消息(UID: ${msg.sender_uid}, MsgKey: ${msg.msg_key})`);
                continue;
              }
              this.adaptMessage(msg, session.session_type, session.talker_id)
            }
          }
          await this.http.updateAck(session.talker_id, session.session_type, session.max_seqno)
        }
      }
      // 在处理完所有会话后，更新 lastPollTs 为当前轮询时间
      this.lastPollTs = pollTs;
    } catch (error) {
      if (error.code === 'INACTIVE_EFFECT') {
        logInfo(`[${this.selfId}]关闭过程中，跳过轮询。`)
        return
      }
      loggerError(`[${this.selfId}]轮询过程中发生错误: % o`, error)
      // 轮询异常，也算作失败
      this.handlePollFailure()
    }
  }

  private async adaptMessage(msg: PrivateMessage, sessionType: number, talkerId: number) {
    if (msg.sender_uid === this.selfId) return

    // 屏蔽的UID
    const senderUid = msg.sender_uid;
    if (this.pluginConfig.nestedblocked.blockedUids && this.pluginConfig.nestedblocked.blockedUids.some(blocked => blocked.uid === senderUid)) {
      logInfo(`屏蔽来自UID ${senderUid} 的消息。`)
      return
    }

    const msgId = msg.msg_key
    if (this.processedMsgIds.has(msgId)) {
      logInfo(`跳过已处理的消息: ${msgId} `)
      return
    }

    this.processedMsgIds.add(msgId)

    if (this.processedMsgIds.size > this._maxCacheSize) {
      const oldestId = this.processedMsgIds.values().next().value
      this.processedMsgIds.delete(oldestId)
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
          logInfo(`不支持的消息类型: ${msg.msg_type}, 内容: ${msg.content} `)
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
      userInfo = await this.http.getUser(msg.sender_uid);
    } catch (e) {
      loggerError(`头像昵称信息获取失败: `, e)
    }

    const session = this.session({
      type: 'message',
      platform: this.platform,
      selfId: this.selfId,
      timestamp: msg.timestamp * 1000, // 毫秒
      channel: {
        id: sessionType === 1 ? `private:${talkerId} ` : `${talkerId} `,
        type: sessionType === 1 ? 1 : 0,
      },
      user: {
        id: msg.sender_uid,
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
          user: { id: msg.sender_uid }
        } : undefined,
      },
    })

    if (msg.msg_status === 1) {
      this.dispatch(this.session({
        type: 'message-deleted',
        platform: this.platform,
        selfId: this.selfId,
        timestamp: Date.now(),
        channel: { id: sessionType === 1 ? `private:${talkerId} ` : `${talkerId} `, type: sessionType === 1 ? 1 : 0 },
        user: { id: msg.sender_uid },
        message: { id: msg.msg_key }
      }))
    } else {
      this.dispatch(session)
    }
  }

  async start() {
    logInfo(`[${this.selfId}] 开始启动机器人...`)
    await super.start()

    if (this.pluginConfig.ignoreOfflineMessages) {
      this.botOnlineTimestamp = Date.now(); // 记录机器人上线时间 (毫秒)
      logInfo(`[${this.selfId}]已开启“不响应机器人离线的未读消息”功能，机器人上线时间戳已记录。`);
    }
    // 无论是否忽略离线消息，首次轮询都从当前时间开始，避免处理启动前的旧会话
    this.lastPollTs = Date.now(); // 毫秒
    logInfo(`[${this.selfId}] lastPollTs 已设置为当前时间，确保从最新会话开始轮询。`);

    if (!this.http.hasCookies()) {
      logInfo(`[${this.selfId}]警告：启动机器人时cookie未设置，可能导致轮询失败`)
    } else {
      logInfo(`[${this.selfId}]cookie已设置，准备开始轮询`)
    }

    setTimeout(() => {
      this.startPolling()
      this.startDynamicPolling()

      logInfo(`[${this.selfId}]轮询已启动，机器人状态: ${this.online ? 'online' : 'offline'} `)
    }, 2000)

    logInfo(`[${this.selfId}]机器人启动完成，状态: ${this.online ? 'online' : 'offline'} `)
  }

  async stop() {
    this.isStopping = true; // 停止
    logInfo(`[${this.selfId}] 正在停止机器人...`)

    // 停止动态监听
    if (this.internal.isPollingActive()) {
      logInfo(`[${this.selfId}] 停止动态监听`);
      this.internal.stopDynamicPolling();
    }

    logInfo(`[${this.selfId}]执行清理函数，数量: ${this.cleanupFunctions.length} `)
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup()
      } catch (err) {
        loggerError(`[${this.selfId}]执行清理函数时出错: `, err)
      }
    }
    this.cleanupFunctions = []

    await super.stop()
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    const [type, talkerId] = channelId.split(':')
    if (type !== 'private' || !talkerId) return []

    const sentMessageIds: string[] = []
    logInfo(content)

    const processElement = (el: h): h[] => {
      if (el.type === 'p') {
        return [h.text('\n'), ...(el.children || []).flatMap(processElement), h.text('\n')]
      }
      if (el.type === 'br') {
        return [h.text('\n')]
      }
      if (el.type === 'i18n') {
        const locales = this.ctx.i18n?.fallback([]) || []
        return this.ctx.i18n?.render(locales, [el.attrs?.path], el.attrs) || []
      }
      if (el.children) {
        return [{ ...el, children: el.children.flatMap(processElement) }]
      }
      return [el]
    }

    const elements = h.normalize(content).flatMap(processElement)
    let textBuffer = ''

    const flushTextBuffer = async () => {
      if (textBuffer) {
        const msgContent = { content: textBuffer.replace(/\n+/g, '\n').trim() }
        const msgKey = await this.http.sendMessage(this.selfId, Number(talkerId), JSON.stringify(msgContent), 1)
        if (msgKey) {
          sentMessageIds.push(msgKey);
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
          const imageData = await this.http.safeFileRequest(elementAttrsUrl, `下载图片失败，URL: ${elementAttrsUrl} `)

          if (!imageData) {
            loggerError(`图片下载失败，URL: ${elementAttrsUrl} `)
            continue
          }

          const imageBuffer = imageData.data
          const imageType = imageData.mime || imageData.type

          const uploadResult = await this.http.uploadImage(imageBuffer);
          if (!uploadResult) {
            loggerError(`图片上传失败，URL: ${elementAttrsUrl} `)
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
          const msgKey = await this.http.sendMessage(this.selfId, Number(talkerId), JSON.stringify(msgContent), 2)
          if (msgKey) {
            sentMessageIds.push(msgKey);
          }
        }
      } catch (error) {
        loggerError('发送消息元素时发生错误: %o', error)
      }
    }

    await flushTextBuffer()

    return sentMessageIds;
  }

  async sendPrivateMessage(userId: string, content: Fragment): Promise<string[]> {
    return this.sendMessage(`private:${userId} `, content);
  }

  async getMessage(channelId: string, messageId: string): Promise<any | undefined> {
    logInfo(`尝试获取 ${channelId} 中的消息 ${messageId} `);
    const [type, talkerIdStr] = channelId.split(':');
    const talkerId = Number(talkerIdStr);
    const sessionType = type === 'private' ? 1 : 0;    //  1 为私聊，0 为其他

    const newSessionsData = await this.http.getNewSessions(0);
    if (!newSessionsData || !newSessionsData.session_list) {
      this.ctx.logger.warn(`获取会话列表失败，无法获取消息 ${messageId} `);
      return undefined;
    }

    const sessionInfo = newSessionsData.session_list.find(s => s.talker_id === talkerId && s.session_type === sessionType);
    if (!sessionInfo) {
      this.ctx.logger.warn(`未找到与 ${channelId} 匹配的会话信息，无法获取消息 ${messageId} `);
      return undefined;
    }

    // 使用会话的最大序列号作为起始点获取消息
    const messageData = await this.http.fetchSessionMessages(
      talkerId,
      sessionType,
      0, // 从最早的消息开始查找 
    );

    if (!messageData || !messageData.messages) {
      this.ctx.logger.warn(`获取会话 ${talkerId} 的消息失败，无法获取消息 ${messageId} `);
      return undefined;
    }

    const targetMsg = messageData.messages.find(msg => msg.msg_key === messageId);

    if (!targetMsg) {
      this.ctx.logger.warn(`在会话 ${talkerId} 消息中未找到消息 ${messageId} `);
      return undefined;
    }

    let contentFragment: Fragment;
    try {
      const parsedContent = JSON.parse(targetMsg.content);
      switch (targetMsg.msg_type) {
        case 1:
          contentFragment = h.parse(parsedContent.content);
          break;
        case 2:
          contentFragment = h('image', { url: parsedContent.url });
          break;
        case 5:
          contentFragment = h('text', { content: `[消息已撤回]` });
          break;
        default:
          this.ctx.logger.warn(`不支持的消息类型: ${targetMsg.msg_type}, 内容: ${targetMsg.content} `);
          contentFragment = `[Unsupported message type: ${targetMsg.msg_type}]`;
          break;
      }
    } catch (e) {
      this.ctx.logger.error(`解析消息内容失败: ${targetMsg.content}, 错误: `, e);
      contentFragment = '[消息解析失败]';
    }

    const userInfo = await this.http.getUser(targetMsg.sender_uid);

    const message: any = {
      messageId: targetMsg.msg_key,
      id: targetMsg.msg_key,
      elements: h.normalize(contentFragment),
      content: h.normalize(contentFragment).join(''),
      user: {
        id: targetMsg.sender_uid,
        name: userInfo?.nickname || '',
        userId: targetMsg.sender_uid,
        avatar: userInfo?.avatar || '',
        username: userInfo?.nickname || '',
      },
      timestamp: targetMsg.timestamp * 1000, // 转换为毫秒
      channel: {
        id: channelId,
        type: sessionType,
      },
      member: undefined,
      guild: undefined,
      quote: undefined,
    };

    logInfo(`成功获取消息 ${messageId}: `, message);
    return message;
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    logInfo(`尝试在 ${channelId} 撤回 ${messageId} `)
    const [type, talkerIdStr] = channelId.split(':');
    const talkerId = Number(talkerIdStr);
    const msgContent = messageId;
    logInfo(`deleteMessage: msgContent = ${msgContent} `);
    const msgKey = await this.http.sendMessage(this.selfId, talkerId, msgContent, 5);
    if (msgKey) {
      logInfo(`成功发送撤回消息指令给 ${talkerId}，msg_key: ${msgKey} `);
    } else {
      this.ctx.logger.warn(`发送撤回消息指令失败给 ${talkerId}，msg_key: ${messageId} `);
    }
  }
}
