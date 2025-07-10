import { Schema } from 'koishi'

export interface BotConfig {
  selfId: string
  // 'authType' is somewhat redundant as only QR code -> cookie is implemented
}

export interface PluginConfig {
  bots: BotConfig[]
}

const BotConfigSchema = Schema.object({
  selfId: Schema.string().description('The Bilibili UID of the bot. This is required to identify the bot and store session data.').required(),
}).description('Bot Account Configuration')

export const Config: Schema<PluginConfig> = Schema.object({
  bots: Schema.array(BotConfigSchema).description('List of bot accounts to log in. You can add multiple accounts to run multiple bots simultaneously.'),
})