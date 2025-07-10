import { Context } from 'koishi'
import { BilibiliDmAdapter } from './adapter'
import { Config, PluginConfig } from './schema'

export const name = 'adapter-bilibili-dm'
export { Config }
export const inject = ['http']

export function apply(ctx: Context, config: PluginConfig) {
  // It is recommended to rename the plugin for clarity
  ctx.plugin(BilibiliDmAdapter, config)
}