//  src\schema.ts
import { Schema } from 'koishi'

export interface BotConfig {
  selfId: string
}

export interface PluginConfig {
  selfId: string
  loggerinfo: boolean
  avatarBase64: boolean
  maxCacheSize: number
}

export const Config: Schema<PluginConfig> =
  Schema.intersect([

    Schema.object({
      selfId: Schema.string().required().description('要登录的账号UID'),
    }).description('基础设置'),

    Schema.object({
      avatarBase64: Schema.boolean().default(true).description('转为base64头像以解决控制台显示问题'),
      maxCacheSize: Schema.number().default(1000).description("缓存接收的msgid，以避免轮询特性导致的消息重复<br>（单位：个）"),
    }).description('进阶设置'),

    Schema.object({
      loggerinfo: Schema.boolean().default(false).description("日志调试模式"),
    }).description('调试选项'),
  ])
