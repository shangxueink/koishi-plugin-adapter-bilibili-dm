<template>
  <div class="bilibili-dm-settings">
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
    
    <div v-else>
      <p>加载中...</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { send, store } from '@koishijs/client'

// 获取插件配置和当前机器人 ID
const props = defineProps<{
  data: any
}>()

// 二维码状态
const qrCodeExpired = ref(false)
const qrCodeLoading = ref(false)
const qrCodeTimer = ref<number | null>(null)
const qrCodeExpiryTime = ref<number | null>(null)

// 获取状态数据
const data = computed(() => {
  console.log('当前store:', store)
  // 添加调试信息，查看store中是否有bilibili-dm数据
  if ((store as any)['bilibili-dm']) {
    console.log('bilibili-dm数据:', (store as any)['bilibili-dm'])
    return (store as any)['bilibili-dm']
  } else {
    console.warn('store中没有bilibili-dm数据')
    return null
  }
})

// 监听状态变化
watch(() => data.value?.status, (newStatus: string | undefined, oldStatus: string | undefined) => {
  if (newStatus === 'qrcode') {
    qrCodeLoading.value = false
    startQrCodeExpiryTimer()
  } else if (newStatus === 'error' && oldStatus === 'qrcode') {
    // 如果从qrcode状态变为error状态，可能是二维码过期
    qrCodeExpired.value = true
  }
})

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
