import { Context, Quester } from 'koishi'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'crypto'
import {
  BiliApiResponse, MyInfoData, QrCodeData,
  QrCodePollResult, UploadImageData, WbiKeys, NavWbiImg, NewSessionsData, SessionMessagesData
} from './types'
import { AxiosRequestHeaders } from 'axios'

const MIXIN_KEY_ENCODE_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

export class HttpClient {
  public http: Quester
  private cookies: Record<string, string> = {}
  private biliJct: string = ''
  private readonly deviceId: string
  private wbiKeys: WbiKeys | null = null
  private wbiKeysExpire = 0
  private logInfo: (...args: any[]) => void
  private wbiKeysFetchPromise: Promise<WbiKeys> | null = null // 作为锁
  private isDisposed = false // 添加一个标志，表示插件是否已停用
  private avatarBase64: boolean

  constructor(private ctx: Context) {
    // 获取service中的logInfo函数
    this.logInfo = (ctx.bilibili_dm_service as any)?.logInfo || ((message: string, ...args: any[]) => {
      // 如果没有找到logInfo函数，使用默认的ctx.logger.info
      ctx.logger.info(message, ...args);
    });

    // 获取配置项
    const config = (ctx.bilibili_dm_service as any)?.config || {};
    this.avatarBase64 = config.avatarBase64 !== undefined ? config.avatarBase64 : true;
    this.http = ctx.http.extend({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://message.bilibili.com/',
        'Origin': 'https://message.bilibili.com',
      },
      timeout: 10000,
    })
    this.deviceId = this.generateDeviceId()

    // 监听插件停用事件
    ctx.on('dispose', () => {
      this.isDisposed = true
      this.logInfo('HttpClient is being disposed, cancelling all pending operations')
    })
  }

  setCookies(cookies: Record<string, string>) {
    this.cookies = cookies
    this.biliJct = cookies.bili_jct || ''
    const cookieString = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    if (this.http.config.headers) {
      (this.http.config.headers as AxiosRequestHeaders)['Cookie'] = cookieString
    }
  }

  // #region WBI Signing
  private getMixinKey(orig: string): string {
    let temp = '';
    MIXIN_KEY_ENCODE_TABLE.forEach((n) => { temp += orig[n] });
    return temp.slice(0, 32)
  }

  private async getWbiKeys(): Promise<WbiKeys> {
    // 如果keys有效，直接返回
    if (this.wbiKeys && this.wbiKeysExpire > Date.now()) return this.wbiKeys

    // 如果已经有一个请求在获取keys，等待该请求完成
    if (this.wbiKeysFetchPromise) {
      return this.wbiKeysFetchPromise;
    }

    // 创建一个新的Promise作为锁
    this.wbiKeysFetchPromise = (async () => {
      // 再次检查，可能在等待过程中已经有其他请求获取了keys
      if (this.wbiKeys && this.wbiKeysExpire > Date.now()) return this.wbiKeys;

      this.logInfo('WBI密钥已过期或未找到，正在从API获取新密钥...')
      try {
        const res = await this.http.get<BiliApiResponse<{ wbi_img: NavWbiImg }>>('https://api.bilibili.com/x/web-interface/nav', {
          headers: {
            'Referer': 'https://www.bilibili.com/',
            'Origin': 'https://www.bilibili.com'
          }
        })
        if (res.code === 0 && res.data?.wbi_img?.img_url && res.data?.wbi_img?.sub_url) {
          this.wbiKeys = {
            img_key: res.data.wbi_img.img_url.substring(res.data.wbi_img.img_url.lastIndexOf('/') + 1, res.data.wbi_img.img_url.lastIndexOf('.')),
            sub_key: res.data.wbi_img.sub_url.substring(res.data.wbi_img.sub_url.lastIndexOf('/') + 1, res.data.wbi_img.sub_url.lastIndexOf('.')),
          }
          this.wbiKeysExpire = Date.now() + 10 * 60 * 1000
          this.logInfo('WBI密钥获取并缓存成功。')
          return this.wbiKeys
        }
        throw new Error(`Failed to get WBI keys: ${res.message || 'Invalid response data'}`)
      } catch (error) {
        this.ctx.logger.error('获取WBI密钥时发生网络错误:', error)
        throw error
      } finally {
        // 无论成功还是失败，都清除Promise锁
        this.wbiKeysFetchPromise = null;
      }
    })();

    return this.wbiKeysFetchPromise;
  }

  private async signWithWbi(params: Record<string, any>): Promise<{ w_rid: string, wts: number }> {
    const keys = await this.getWbiKeys()
    const mixinKey = this.getMixinKey(keys.img_key + keys.sub_key)
    const currTime = Math.round(Date.now() / 1000)

    const signedParams: Record<string, any> = { ...params, wts: currTime }
    const query = Object.keys(signedParams).sort().map(key => {
      const value = signedParams[key]?.toString().replace(/[!'()*]/g, '') || ''
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    }).join('&')

    const wbiSign = createHash('md5').update(query + mixinKey).digest('hex')
    return { w_rid: wbiSign, wts: currTime }
  }
  // #endregion

  // #region Login & Auth
  async getQrCodeData(): Promise<QrCodeData | null> {
    try {
      const res = await this.http.get<BiliApiResponse<QrCodeData>>('https://passport.bilibili.com/x/passport-login/web/qrcode/generate')
      if (res.code === 0 && res.data) return res.data
      this.logInfo('获取二维码失败:', res.message); return null
    } catch (error) {
      this.logInfo('获取二维码数据时发生网络错误:', error); return null
    }
  }

  async pollQrCodeStatus(oauthKey: string): Promise<QrCodePollResult> {
    // 如果插件已停用，直接返回过期状态
    if (this.isDisposed) {
      return { status: 'expired', message: '插件已停用' }
    }

    try {
      const res = await this.http.get<BiliApiResponse<{ url: string, refresh_token: string, timestamp: number, code: number, message: string }>>('https://passport.bilibili.com/x/passport-login/web/qrcode/poll', { params: { qrcode_key: oauthKey } })
      const data = res.data
      if (data.code === 0 && data.url) {
        const url = new URL(data.url)
        const SESSDATA = url.searchParams.get('SESSDATA')
        const bili_jct = url.searchParams.get('bili_jct')
        const DedeUserID = url.searchParams.get('DedeUserID')
        if (SESSDATA && bili_jct && DedeUserID) {
          return { status: 'success', message: '登录成功', cookies: { SESSDATA, bili_jct, DedeUserID } }
        }
        return { status: 'expired', message: 'Cookie 解析失败' }
      } else if (data.code === 86038) return { status: 'expired', message: '二维码已失效' }
      else if (data.code === 86090) return { status: 'scanned', message: '已扫描，待确认' }
      return { status: 'waiting', message: '等待扫描' }
    } catch (error) {
      this.ctx.logger.error('[轮询] 轮询二维码状态时发生网络错误:', error);
      return { status: 'expired', message: '网络错误' }
    }
  }

  async getMyInfo(): Promise<{ nickname: string, avatar: string, isValid: boolean }> {
    try {
      const res = await this.http.get<BiliApiResponse<MyInfoData>>('https://api.bilibili.com/x/space/myinfo')
      if (res.code === 0 && res.data) {
        // 获取头像
        let avatarUrl = res.data.face;

        // 根据配置决定是否将头像转换为base64
        if (this.avatarBase64) {
          try {
            // 设置请求头，避免防盗链
            const avatarFiledata = await this.ctx.http.file(res.data.face);
            const avatarBuffer = avatarFiledata.data;
            const avatarMimeType = avatarFiledata.type || avatarFiledata.mime;
            // 将图片转换为base64
            const base64 = Buffer.from(avatarBuffer).toString('base64');
            avatarUrl = `data:${avatarMimeType};base64,${base64}`;

            this.logInfo('成功获取头像并转换为base64格式');
          } catch (avatarError) {
            this.ctx.logger.error('获取头像失败，使用原始URL:', avatarError);
            // 如果获取失败，使用原始URL
          }
        }

        return {
          nickname: res.data.name,
          avatar: avatarUrl,
          isValid: true
        };
      }
      return { nickname: '', avatar: '', isValid: false }
    } catch (error) {
      this.ctx.logger.error('验证Cookie失败:', error); return { nickname: '', avatar: '', isValid: false }
    }
  }
  // #endregion

  // #region Private Message API
  async getNewSessions(begin_ts: number): Promise<NewSessionsData | null> {
    // this.logInfo(`正在轮询自时间戳 ${begin_ts} 以来的新会话`)
    try {
      const res = await this.http.get<BiliApiResponse<NewSessionsData>>(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
        { params: { begin_ts, build: 0, mobi_app: 'web' } }
      )
      if (res.code === 0) return res.data
      this.logInfo(`轮询新会话失败，错误码: ${res.code}, 错误信息: ${res.message}`)
      return null
    } catch (error) {
      this.ctx.logger.error('轮询新会话时发生网络错误:', error); return null
    }
  }

  async fetchSessionMessages(talker_id: number, session_type: number, begin_seqno: number): Promise<SessionMessagesData | null> {
    this.logInfo(`正在获取用户 ${talker_id} 在时间戳 ${begin_seqno} 之后的消息`)
    try {
      const res = await this.http.get<BiliApiResponse<SessionMessagesData>>(
        'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
        {
          params: {
            talker_id,
            session_type,
            begin_seqno,
            size: 20,
            build: 0,
            mobi_app: 'web'
          }
        }
      )
      if (res.code === 0) return res.data
      this.logInfo(`获取用户 ${talker_id} 的消息失败: ${res.message} (错误码: ${res.code})`)
      return null
    } catch (error) {
      this.ctx.logger.error(`获取用户 ${talker_id} 的消息时发生网络错误:`, error)
      return null
    }
  }

  async updateAck(talker_id: number, session_type: number, ack_seqno: number): Promise<void> {
    try {
      await this.http.post(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
        new URLSearchParams({
          talker_id: talker_id.toString(),
          session_type: session_type.toString(),
          ack_seqno: ack_seqno.toString(),
          build: '0',
          mobi_app: 'web',
          csrf: this.biliJct,
          csrf_token: this.biliJct
        })
      )
      this.logInfo(`已将用户 ${talker_id} 的会话标记为已读，直到时间戳 ${ack_seqno}`)
    } catch (error) {
      this.ctx.logger.error(`将用户 ${talker_id} 的会话标记为已读失败:`, error)
    }
  }

  async uploadImage(imageBuffer: Buffer): Promise<UploadImageData | null> {
    const boundary = `----WebKitFormBoundary${uuidv4().replace(/-/g, '')}`
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_up"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="biz"\r\n\r\n`),
      Buffer.from('im'),
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="csrf"\r\n\r\n`),
      Buffer.from(this.biliJct),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    try {
      const res = await this.http.post<BiliApiResponse<UploadImageData>>(
        'https://api.bilibili.com/x/dynamic/feed/draw/upload_bfs',
        payload,
        { headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } }
      )
      if (res.code === 0 && res.data) return res.data
      this.logInfo('上传图片失败:', res.message)
      return null
    } catch (error) {
      this.ctx.logger.error('上传图片时发生网络错误:', error)
      return null
    }
  }

  async sendMessage(senderUid: number, receiverId: number, msgContent: string, msgType: 1 | 2): Promise<boolean> {
    const msgObject = {
      sender_uid: senderUid,
      receiver_id: receiverId,
      receiver_type: 1,
      msg_type: msgType,
      msg_status: 0,
      content: msgContent,
      timestamp: Math.floor(Date.now() / 1000),
      dev_id: this.deviceId,
      new_face_version: 1,
    };

    const formPayload = new URLSearchParams({
      'msg[sender_uid]': msgObject.sender_uid.toString(),
      'msg[receiver_id]': msgObject.receiver_id.toString(),
      'msg[receiver_type]': msgObject.receiver_type.toString(),
      'msg[msg_type]': msgObject.msg_type.toString(),
      'msg[msg_status]': msgObject.msg_status.toString(),
      'msg[content]': msgObject.content,
      'msg[timestamp]': msgObject.timestamp.toString(),
      'msg[dev_id]': msgObject.dev_id,
      'msg[new_face_version]': msgObject.new_face_version.toString(),
      'build': '0',
      'mobi_app': 'web',
      'csrf_token': this.biliJct,
      'csrf': this.biliJct,
    }).toString();

    try {
      const urlParams = await this.signWithWbi({
        'w_sender_uid': senderUid,
        'w_receiver_id': receiverId,
        'w_dev_id': this.deviceId,
      }) as Record<string, any>;

      const apiUrl = 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg';

      const requestConfig = {
        params: urlParams,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://message.bilibili.com/h5',
          'Origin': 'https://message.bilibili.com',
        }
      };

      const res = await this.http.post<BiliApiResponse<{ msg_key: number }>>(
        apiUrl,
        formPayload,
        requestConfig
      );

      if (res.code === 0) {
        this.logInfo(`成功发送消息给 ${receiverId} (msg_key: ${res.data?.msg_key})`);
        return true;
      }

      this.logInfo(`发送消息给 ${receiverId} 失败: ${res.message || res.msg} (code: ${res.code})`);
      return false;
    } catch (error) {
      if (error.response) {
        this.logInfo(`发送消息时发生 HTTP 错误 (Status: ${error.response.status}): %o`, error.response.data);
      } else {
        this.ctx.logger.error(`发送消息时发生网络或未知错误:`, error);
      }
      return false;
    }
  }
  // #endregion

  private generateDeviceId(): string {
    return uuidv4().toUpperCase()
  }
}
