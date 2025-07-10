import Settings from './settings.vue'
import { Context } from '@koishijs/client'

export default (ctx: Context) => {
  // 此 Context 非彼 Context
  // 我们只是在前端同样实现了一套插件逻辑
  ctx.slot({
    type: 'plugin-details',
    component: Settings,
    order: 800,
  })
}