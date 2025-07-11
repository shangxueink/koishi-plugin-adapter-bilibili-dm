<template>
  <div class="bilibili-dm-settings">
    <!-- 只有当 data 有值时才渲染 k-comment -->
    <k-comment v-if="data" :type="getCommentType(data.status)">
      <template v-if="data.status === 'offline'">
        <p>机器人离线</p>
        <k-button @click="startLogin(data.selfId)">重新登录</k-button>
      </template>
      
      <template v-else-if="data.status === 'error'">
        <p>{{ data.message }}</p>
        <k-button @click="startLogin(data.selfId)">重新登录</k-button>
      </template>
      
      <template v-else-if="data.status === 'init'">
        <p>正在初始化 Bilibili 客户端...</p>
        <k-progress indeterminate />
      </template>
      
      <template v-else-if="data.status === 'continue'">
        <p>{{ data.message }}</p>
        <k-progress indeterminate />
      </template>
      
      <template v-else-if="data.status === 'success'">
        <p>{{ data.message }}</p>
        <div class="status-icon success">
          <k-icon name="check-circle" />
        </div>
        <k-button @click="startLogin(data.selfId)">重新登录</k-button>
      </template>
      
      <template v-else-if="data.status === 'qrcode'">
        <p v-if="data.message">{{ data.message }}</p>
        <div class="qrcode-container">
          <img v-if="data.image" class="qrcode" :src="data.image" alt="Bilibili 登录二维码" />
          <div class="refresh-overlay" v-if="qrCodeExpired">
            <p>二维码已过期</p>
            <k-button @click="startLogin(data.selfId)">刷新二维码</k-button>
          </div>
        </div>
        <p class="qrcode-tip">请使用 Bilibili APP 扫描二维码登录</p>
        <div class="qrcode-actions">
          <k-button @click="startLogin(data.selfId)" :disabled="qrCodeLoading">
            <template v-if="qrCodeLoading">
              <k-icon name="loader" class="rotating" />
              刷新中...
            </template>
            <template v-else>
              <k-icon name="refresh-cw" />
              刷新二维码
            </template>
          </k-button>
        </div>
      </template>
    </k-comment>
    
    <!-- 当 data 为 null 时，显示加载中或者不显示任何内容 -->
    <div v-else>
      <!-- 不渲染任何东西 -->
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onMounted, onUnmounted, inject } from 'vue'
import { store, send } from "@koishijs/client"; 

// 二维码状态
const qrCodeExpired = ref(false)
const qrCodeLoading = ref(false)
const qrCodeTimer = ref<number | null>(null)
const qrCodeExpiryTime = ref<number | null>(null)

const local = inject('manager.settings.local', ref({ name: '' })) as any
//  const config = inject('manager.settings.config', ref({})) as any
//  const current = inject('manager.settings.current', ref({})) as any
/*
console.group("==================== Bilibili DM Plugin Debug ====================")
// 确保 local.value 存在，再访问 name 属性
console.log("Injecting 'manager.settings.local' name:", local.value?.name)
console.log("Koishi Client Store:", store) // 打印整个 store 对象
console.groupEnd()
*/

// 插件的预期名称，根据 package.json
const PLUGIN_NAME = 'koishi-plugin-adapter-bilibili-dm'; 

const data = computed(() => {
  // 名称不匹配，返回 null，阻止组件渲染
  if (!local.value || local.value.name !== PLUGIN_NAME) {
    console.warn(`[Bilibili DM] 当前插件名称 '${local.value?.name}' 不匹配预期 '${PLUGIN_NAME}'，跳过数据加载。`);
    return null;
  }
  
  // 名称匹配，从 store 中获取 bilibili-dm 数据
  const bilibiliDmData = (store as any)['bilibili-dm'];
  if (!bilibiliDmData) {
    console.warn('[Bilibili DM] 插件名称匹配，但 store 中没有找到 "bilibili-dm" 数据。');
  } else {
    console.log('[Bilibili DM] 成功从 store 获取 "bilibili-dm" 数据:', bilibiliDmData);
  }
  return bilibiliDmData;
});

// 监听状态变化
watch(() => data.value?.status, (newStatus: string | undefined, oldStatus: string | undefined) => {
  if (newStatus === 'qrcode') {
    qrCodeLoading.value = false
    startQrCodeExpiryTimer()
  } else if (newStatus === 'error' && oldStatus === 'qrcode') {
    // 如果从qrcode状态变为error状态，可能是二维码过期
    qrCodeExpired.value = true
  }
}, { immediate: true }) // 立即执行一次，以处理初始状态

// 设置二维码过期计时器（二维码通常有效期为3分钟）
function startQrCodeExpiryTimer() {
  clearQrCodeExpiryTimer()
  
  qrCodeExpiryTime.value = Date.now() + 3 * 60 * 1000 // 3分钟后过期
  qrCodeExpired.value = false
  
  // 每秒更新剩余时间
  qrCodeTimer.value = window.setInterval(() => {
    if (!qrCodeExpiryTime.value) return
    
    const timeLeft = Math.max(0, qrCodeExpiryTime.value - Date.now())
    
    if (timeLeft <= 0) {
      qrCodeExpired.value = true
      clearQrCodeExpiryTimer()
    }
  }, 1000) as unknown as number
}

// 清除二维码过期计时器
function clearQrCodeExpiryTimer() {
  if (qrCodeTimer.value) {
    window.clearInterval(qrCodeTimer.value)
    qrCodeTimer.value = null
  }
  qrCodeExpiryTime.value = null
}

// 组件卸载时清除计时器
onUnmounted(() => {
  clearQrCodeExpiryTimer()
})

// 启动登录
function startLogin(selfId: string) {
  qrCodeExpired.value = false
  qrCodeLoading.value = true
  send('bilibili-dm/start-login' as any, { selfId })
}

// 根据状态获取评论类型
function getCommentType(status?: string) {
  if (!status) return 'warning'
  if (status === 'init' || status === 'continue') return 'warning'
  if (status === 'error') return 'error'
  if (status === 'success') return 'success'
  if (status === 'qrcode') return 'warning'
  return 'warning'
}
</script>

<style lang="scss" scoped>
.bilibili-dm-settings {
  padding: 0;
  
  .qrcode-container {
    position: relative;
    display: inline-block;
    margin: 1rem 0;
    border: 1px solid #eee;
    padding: 10px;
    border-radius: 8px;
    background-color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .qrcode {
    display: block;
    max-width: 200px;
    image-rendering: pixelated;
  }
  
  .refresh-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: white;
    border-radius: 8px;
  }
  
  .qrcode-tip {
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
  }
  
  .qrcode-actions {
    margin-top: 1rem;
    display: flex;
    gap: 0.5rem;
  }
  
  .status-icon {
    font-size: 2rem;
    margin: 1rem 0;
    
    &.success {
      color: #52c41a;
    }
  }
  
  .k-button {
    margin-top: 0.5rem;
  }
  
  .k-progress {
    margin-top: 1rem;
  }
  
  .rotating {
    animation: rotate 1s linear infinite;
  }
  
  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
}
</style>
