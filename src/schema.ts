//  src\schema.ts
import { Schema } from 'koishi'

export interface PluginConfig {
  selfId: string
  loggerinfo: boolean
  avatarBase64: boolean
  pollInterval: number
  maxCacheSize: number
}

export const Config: Schema<PluginConfig> =
  Schema.intersect([

    Schema.object({
      selfId: Schema.string().required().description('要登录的账号UID<br>如何查找UID？[点我查看方法](https://github.com/Roberta001/koishi-plugin-adapter-bilibili-dm/blob/main/readme.md#%EF%B8%8F-%E9%85%8D%E7%BD%AE)'),
    }).description('基础设置'),

    Schema.object({
      avatarBase64: Schema.boolean().default(true).description('请求base64头像数据 以解决控制台显示问题'),
      pollInterval: Schema.number().default(3000).description("轮询消息的间隔时间（单位：毫秒）").min(1000).max(60000),
      maxCacheSize: Schema.number().default(1000).description("缓存接收的消息ID，以避免轮询特性导致的消息重复（单位：条）"),
    }).description('进阶设置'),

    Schema.object({
      loggerinfo: Schema.boolean().default(false).description("日志调试模式").experimental(),
    }).description('调试选项'),
  ])
