import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { URLSearchParams } from 'url';

// ======================= 请在这里配置 =======================
const SESSDATA = '7249e4b5,1767609628,0f8a8*72CjBudMM1a4rgzHoVVsUU7DTWP5UeJX1FtVo_bnXuLLFaX2TtCmxzF3Q7B9Yh-M7jFwYSVmVXOGNjZk01NG9QMVVmd19kaXd6Sk9PS1NYeW10S096aEprR0Z1cDh6MVFTaFlBZ2R3eVBxTEJ6azRZZ1FGcmhvUmkzck1aeWh2UGxiakhndUxCUFN3IIEC';
const bili_jct = 'f1e3b421632fabac0f9fb0cffbec7cb1';
const DedeUserID = '3537120658459221'; // 这是你的 UID

const myUid = Number(DedeUserID);
const receiverUid = 2087825391; // 你要发送消息的目标 UID
const messageText = '这是一条来自 Koishi 适配器调试的测试消息 ' + new Date().toLocaleTimeString();
// ==========================================================


// 全局日志记录器
const logger = {
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.error('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

// WBI 签名所需的固定加密表
const MIXIN_KEY_ENCODE_TABLE = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];

interface WbiKeys { img_key: string; sub_key: string; }
interface BiliApiResponse<T> { code: number; message: string; msg?: string; data?: T; }
interface NavWbiImg { img_url: string; sub_url: string; }

// --- 核心逻辑开始 ---

let wbiKeysCache: WbiKeys | null = null;
let http: AxiosInstance;

function getMixinKey(orig: string): string {
  let temp = '';
  MIXIN_KEY_ENCODE_TABLE.forEach((n) => { temp += orig[n] });
  return temp.slice(0, 32);
}

async function getWbiKeys(): Promise<WbiKeys> {
  if (wbiKeysCache) return wbiKeysCache;
  logger.debug('WBI keys not found in cache, fetching from API...');
  try {
    const res = await http.get<BiliApiResponse<{ wbi_img: NavWbiImg }>>('https://api.bilibili.com/x/web-interface/nav');
    if (res.data.code === 0 && res.data.data?.wbi_img?.img_url && res.data.data?.wbi_img?.sub_url) {
      wbiKeysCache = {
        img_key: res.data.data.wbi_img.img_url.substring(res.data.data.wbi_img.img_url.lastIndexOf('/') + 1, res.data.data.wbi_img.img_url.lastIndexOf('.')),
        sub_key: res.data.data.wbi_img.sub_url.substring(res.data.data.wbi_img.sub_url.lastIndexOf('/') + 1, res.data.data.wbi_img.sub_url.lastIndexOf('.')),
      };
      logger.info('WBI keys 获取成功。');
      return wbiKeysCache;
    }
    throw new Error(`获取 WBI keys 失败: ${res.data.message || '返回数据格式不正确'}`);
  } catch (error) {
    logger.error('请求 WBI keys 接口时发生网络错误:', error);
    throw error;
  }
}

async function signWithWbi(params: Record<string, any>): Promise<Record<string, any>> {
  const keys = await getWbiKeys();
  const mixinKey = getMixinKey(keys.img_key + keys.sub_key);
  const currTime = Math.round(Date.now() / 1000);
  
  const signedParams: Record<string, any> = { ...params, wts: currTime };
  const query = Object.keys(signedParams).sort().map(key => {
    const value = signedParams[key].toString().replace(/[!'()*]/g, '');
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }).join('&');

  const wbiSign = createHash('md5').update(query + mixinKey).digest('hex');
  return { ...signedParams, w_rid: wbiSign };
}

async function sendMessage(senderUid: number, receiverId: number, msgContent: string, msgType: 1 | 2): Promise<boolean> {
  const deviceId = uuidv4().toUpperCase();
  const msgObject = {
    sender_uid: senderUid,
    receiver_id: receiverId,
    receiver_type: 1,
    msg_type: msgType,
    msg_status: 0,
    content: msgContent,
    timestamp: Math.floor(Date.now() / 1000),
    dev_id: deviceId,
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
    'csrf_token': bili_jct,
    'csrf': bili_jct,
  }).toString();

  try {
    const urlParams = await signWithWbi({
      'w_sender_uid': senderUid,
      'w_receiver_id': receiverId,
      'w_dev_id': deviceId,
    });

    const apiUrl = 'https://api.vc.bilibili.com/web_im/v1/web_im/send_msg';
    
    const requestConfig: AxiosRequestConfig = {
      params: urlParams,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://message.bilibili.com/h5',
        'Origin': 'https://message.bilibili.com',
      }
    };

    logger.debug('----------- Sending Message Details -----------');
    logger.debug('Request URL:', apiUrl);
    logger.debug('URL Params (Signed):', requestConfig.params);
    logger.debug('Request Headers:', requestConfig.headers);
    logger.debug('POST Body:', formPayload);
    logger.debug('-----------------------------------------------');
    
    const res = await http.post<BiliApiResponse<any>>(apiUrl, formPayload, requestConfig);
    
    logger.debug('Received response data:', res.data);
    
    if (res.data.code === 0) {
      logger.info('成功发送消息！');
      return true;
    }
    
    logger.warn(`发送消息失败: ${res.data.message || res.data.msg} (code: ${res.data.code})`);
    return false;
  } catch (error: any) {
    if (error.response) {
      logger.error(`发送消息时发生 HTTP 错误 (Status: ${error.response.status})`);
      logger.error('服务器返回的错误详情:', error.response.data);
    } else {
      logger.error('发送消息时发生网络或未知错误:', error.message);
    }
    return false;
  }
}

// --- 测试主函数 ---
async function runTest() {
  if (!SESSDATA || !bili_jct || !DedeUserID) {
    logger.error('请在脚本顶部填入你的 Cookie 信息！');
    return;
  }
  
  console.log('开始测试...');

  // 1. 初始化 axios 实例并设置 Cookie
  const cookieString = `SESSDATA=${SESSDATA}; bili_jct=${bili_jct}; DedeUserID=${DedeUserID};`;
  http = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': cookieString,
    },
    timeout: 10000,
  });
  console.log('Cookie 已设置。');

  // 2. 准备消息内容
  const msgType = 1;
  const msgContent = JSON.stringify({ content: messageText });

  console.log('准备发送消息...');
  console.log(`  - From: ${myUid}`);
  console.log(`  - To: ${receiverUid}`);
  console.log(`  - Type: ${msgType}`);
  console.log(`  - Content: ${msgContent}`);

  // 3. 调用 sendMessage
  const success = await sendMessage(myUid, receiverUid, msgContent, msgType);
  if (success) {
    console.log('🎉 测试成功！');
  } else {
    console.error('❌ 测试失败，请检查上面的错误日志。');
  }
}

// 运行测试
runTest();