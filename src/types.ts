//  src\types.ts
export interface BiliApiResponse<T> {
  code: number
  message: string
  msg?: string
  ttl: number
  data?: T
}

// from private_msg.md -> 私信主体对象
export interface PrivateMessage {
  sender_uid: number
  receiver_type: number // 1: user, 2: group
  receiver_id: number
  msg_type: number
  content: string // JSON string
  msg_seqno: number
  timestamp: number
  at_uids: number[] | null
  msg_key: string
  msg_status: number // 0: normal, 1: withdrawn
  notify_code: string
  new_face_version: number
}

// from private_msg.md -> 会话对象
export interface SessionInfo {
  talker_id: number
  session_type: number
  ack_seqno: number
  ack_ts: number
  session_ts: number
  unread_count: number
  last_msg: PrivateMessage | null
  max_seqno: number
  is_follow: number
  is_dnd: number
}

// Response data for /new_sessions
export interface NewSessionsData {
  session_list?: SessionInfo[]
  has_more: number
}

// Response data for /fetch_session_msgs
export interface SessionMessagesData {
  messages?: PrivateMessage[]
  has_more: number
  min_seqno: number
  max_seqno: number
}

// Login related types
export interface QrCodeData { url: string; qrcode_key: string; }
export interface QrCodePollResult { status: 'waiting' | 'scanned' | 'success' | 'expired'; message: string; cookies?: Record<string, string>; }
export interface MyInfoData { name: string; mid: number; face: string; }

// WBI keys from /nav endpoint
export interface NavWbiImg {
  img_url: string
  sub_url: string
}
export interface WbiKeys {
  img_key: string
  sub_key: string
}

// Upload image response
export interface UploadImageData {
  image_url: string
  image_width: number
  image_height: number
  img_size?: number
}
