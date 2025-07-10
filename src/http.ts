// http.ts (已修复)
import { Context, Logger, Quester } from 'koishi'
import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'crypto'
import {
  BiliApiResponse, MyInfoData, QrCodeData,
  QrCodePollResult, UploadImageData, WbiKeys, NavWbiImg, NewSessionsData, SessionMessagesData
} from './types'
import { AxiosRequestHeaders } from 'axios'

const logger = new Logger('bilibili-dm:http')

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

  constructor(private ctx: Context) {
    this.http = ctx.http.extend({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://message.bilibili.com/',
        'Origin': 'https://message.bilibili.com',
      },
      timeout: 10000,
    })
    this.deviceId = this.generateDeviceId()
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
    if (this.wbiKeys && this.wbiKeysExpire > Date.now()) return this.wbiKeys

    logger.debug('WBI keys expired or not found, fetching from API...')
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
        logger.info('WBI keys fetched and cached successfully.')
        return this.wbiKeys
      }
      throw new Error(`Failed to get WBI keys: ${res.message || 'Invalid response data'}`)
    } catch (error) {
      logger.error('Network error while fetching WBI keys:', error)
      throw error
    }
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
      logger.warn('Failed to get QR code:', res.message); return null
    } catch (error) {
      logger.error('Network error on getQrCodeData:', error); return null
    }
  }

  async pollQrCodeStatus(oauthKey: string): Promise<QrCodePollResult> {
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
      logger.error('[poll] 轮询二维码状态时发生网络错误:', error);
      return { status: 'expired', message: '网络错误' }
    }
  }

  async getMyInfo(): Promise<{ nickname: string, isValid: boolean }> {
    try {
      const res = await this.http.get<BiliApiResponse<MyInfoData>>('https://api.bilibili.com/x/space/myinfo')
      if (res.code === 0 && res.data) return { nickname: res.data.name, isValid: true }
      return { nickname: '', isValid: false }
    } catch (error) {
      logger.warn('Failed to validate cookie:', error); return { nickname: '', isValid: false }
    }
  }
  // #endregion

  // #region Private Message API
  async getNewSessions(begin_ts: number): Promise<NewSessionsData | null> {
    logger.debug(`Polling for new sessions since ts: ${begin_ts}`)
    try {
      const res = await this.http.get<BiliApiResponse<NewSessionsData>>(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
        { params: { begin_ts, build: 0, mobi_app: 'web' } }
      )
      if (res.code === 0) return res.data
      logger.warn(`Failed to poll new sessions, code: ${res.code}, message: ${res.message}`)
      return null
    } catch (error) {
      logger.error('Network error polling new sessions:', error); return null
    }
  }
  
  async fetchSessionMessages(talker_id: number, session_type: number, begin_seqno: number): Promise<SessionMessagesData | null> {
    logger.debug(`Fetching messages for talker ${talker_id} after seqno ${begin_seqno}`)
    try {
        const res = await this.http.get<BiliApiResponse<SessionMessagesData>>(
            'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
            { params: {
                talker_id,
                session_type,
                begin_seqno,
                size: 20,
                build: 0,
                mobi_app: 'web'
            }}
        )
        if (res.code === 0) return res.data
        logger.warn(`Failed to fetch messages for talker ${talker_id}: ${res.message} (code: ${res.code})`)
        return null
    } catch (error) {
        logger.error(`Network error fetching messages for talker ${talker_id}:`, error)
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
      logger.debug(`Marked session ${talker_id} as read up to seqno ${ack_seqno}`)
    } catch (error) {
      logger.error(`Failed to mark session ${talker_id} as read:`, error)
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
      logger.warn('Failed to upload image:', res.message)
      return null
    } catch (error) {
      logger.error('Network error uploading image:', error)
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
            logger.info(`成功发送消息给 ${receiverId} (msg_key: ${res.data?.msg_key})`);
            return true;
        }
        
        logger.warn(`发送消息给 ${receiverId} 失败: ${res.message || res.msg} (code: ${res.code})`);
        return false;
    } catch (error) {
        if (error.response) {
            logger.error(`发送消息时发生 HTTP 错误 (Status: ${error.response.status}): %o`, error.response.data);
        } else {
            logger.error(`发送消息时发生网络或未知错误:`, error);
        }
        return false;
    }
}
  // #endregion

  private generateDeviceId(): string {
    return uuidv4().toUpperCase()
  }
}