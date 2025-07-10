import { Context, Logger } from 'koishi'
import { BilibiliDmBot } from './bot'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { BotStatus } from './index'
import { PluginConfig } from './schema'
import QRCode from 'qrcode'

const logger = new Logger('bilibili-dm:service')

// 登录状态类型
export type BotLoginStatus = {
    status: 'init' | 'qrcode' | 'continue' | 'success' | 'error' | 'offline'
    selfId: string
    image?: string
    message?: string
}

export class BilibiliService {
    private status: Record<string, BotStatus> = {}
    logInfo: (...args: any[]) => void
    private isDisposed = false // 标志：表示插件是否已停用
    public config: PluginConfig

    constructor(private ctx: Context, config: PluginConfig) {
        this.config = config
        // 配置项调试使用的logInfo函数
        this.logInfo = (message: string, ...args: any[]) => {
            if (config.loggerinfo) {
                (logger.info as (message: string, ...args: any[]) => void)(message, ...args);
            }
        }

        // 监听插件停用事件
        ctx.on('dispose', () => {
            this.isDisposed = true
            this.logInfo('正在关闭连接 Bilibili，取消所有待处理的操作"')
        })
    }

    // 获取所有机器人状态
    getStatus(): Record<string, BotStatus> {
        return this.status
    }

    // 更新机器人状态并触发事件
    updateStatus(selfId: string, status: Partial<BotStatus>) {
        this.status[selfId] = {
            ...(this.status[selfId] || { status: 'init', selfId }),
            ...status,
        }

        // 触发状态更新事件
        this.ctx.emit('bilibili-dm/status-update', this.status[selfId])

        // 如果状态包含二维码，确保它被正确传递
        if (status.status === 'qrcode' && status.image) {
            this.logInfo(`[${selfId}] 二维码图片已生成并准备发送到前端，数据长度: ${status.image.length} 字节`)
        }
    }

    // 启动登录流程
    async startLogin(bot: BilibiliDmBot, sessionFile: string): Promise<boolean> {
        const selfId = bot.selfId

        try {
            // 更新状态为初始化
            this.updateStatus(selfId, {
                status: 'init',
                message: '正在初始化登录...'
            })

            // 尝试从文件加载 cookie
            if (existsSync(sessionFile)) {
                try {
                    const cookieData = JSON.parse(await readFile(sessionFile, 'utf8'))
                    bot.http.setCookies(cookieData)

                    // 验证 cookie 是否有效
                    const userInfo = await bot.http.getMyInfo()
                    if (userInfo.isValid) {
                        this.updateStatus(selfId, {
                            status: 'success',
                            message: `已使用缓存登录，欢迎回来 ${userInfo.nickname}`
                        })
                        // 设置bot的用户信息
                        bot.user.name = userInfo.nickname
                        bot.user.username = userInfo.nickname
                        bot.user.nick = userInfo.nickname
                        bot.user.avatar = userInfo.avatar

                        // 在终端输出欢迎消息
                        this.ctx.logger.info(`已使用缓存登录，欢迎回来 ${userInfo.nickname}`)

                        // 启动机器人
                        await bot.start()
                        bot.online()
                        return true
                    } else {
                        this.updateStatus(selfId, {
                            status: 'continue',
                            message: '缓存的登录信息已失效，需要重新登录'
                        })
                    }
                } catch (error) {
                    this.ctx.logger.error(`[${selfId}] 无法加载缓存的登录信息，错误详情: %o`, error)
                    this.updateStatus(selfId, {
                        status: 'continue',
                        message: '无法加载缓存的登录信息，需要重新登录'
                    })
                }
            }

            // 获取二维码
            const qrData = await bot.http.getQrCodeData()
            if (!qrData) {
                throw new Error('获取二维码失败')
            }

            try {
                // 生成二维码图片的 base64 数据
                const qrImageBase64 = await QRCode.toDataURL(qrData.url, {
                    margin: 1,
                    scale: 8,
                    errorCorrectionLevel: 'H'
                })

                this.logInfo(`[${selfId}] 生成二维码成功，URL: ${qrData.url}`)
                this.logInfo(`[${selfId}] 二维码图片数据长度: ${qrImageBase64.length} 字节`)

                // 确保二维码数据是有效的base64
                if (!qrImageBase64.startsWith('data:image/')) {
                    throw new Error('生成的二维码数据格式不正确')
                }

                // 更新状态为等待扫码
                this.updateStatus(selfId, {
                    status: 'qrcode',
                    message: '请使用 Bilibili APP 扫描二维码登录',
                    image: qrImageBase64
                })

                // 确保状态更新事件被触发
                this.logInfo(`[${selfId}] 已更新状态为等待扫码，二维码已准备好在WebUI中显示`)

                // 打印日志，但不在控制台显示二维码
                this.logInfo(`[${selfId}] 请在WebUI中查看登录二维码`)

                // 手动触发一次状态更新，确保前端能收到二维码
                this.ctx.setTimeout(() => {
                    this.ctx.emit('bilibili-dm/status-update', this.status[selfId])
                    this.logInfo(`[${selfId}] 手动触发状态更新事件，确保前端收到二维码`)
                }, 500)
            } catch (error) {
                this.ctx.logger.error(`[${selfId}] 生成二维码图片失败:`, error)
                this.updateStatus(selfId, {
                    status: 'error',
                    message: `生成二维码失败: ${error.message || '未知错误'}`
                })
                throw error
            }

            // 轮询二维码状态
            let retryCount = 0
            const maxRetries = 60 // 最多轮询 60 次，约 180 秒（超时时间）

            while (retryCount < maxRetries && !this.isDisposed) { // 检查是否已停用
                const pollResult = await bot.http.pollQrCodeStatus(qrData.qrcode_key)

                if (pollResult.status === 'success' && pollResult.cookies) {
                    // 登录成功，保存 cookie
                    bot.http.setCookies(pollResult.cookies)
                    await writeFile(sessionFile, JSON.stringify(pollResult.cookies), 'utf8')

                    // 获取用户信息
                    const userInfo = await bot.http.getMyInfo()

                    this.updateStatus(selfId, {
                        status: 'success',
                        message: `登录成功，欢迎 ${userInfo.nickname}`
                    })

                    // 设置bot的信息
                    bot.user.name = userInfo.nickname
                    bot.user.username = userInfo.nickname
                    bot.user.nick = userInfo.nickname
                    bot.user.avatar = userInfo.avatar

                    // 终端输出欢迎消息
                    this.ctx.logger.info(`登录成功，欢迎 ${userInfo.nickname}`)

                    // 启动机器人
                    await bot.start()
                    bot.online()
                    return true
                } else if (pollResult.status === 'scanned') {
                    this.updateStatus(selfId, {
                        status: 'continue',
                        message: '二维码已扫描，请在手机上确认登录'
                    })
                } else if (pollResult.status === 'expired') {
                    this.updateStatus(selfId, {
                        status: 'error',
                        message: '二维码已过期，请刷新页面重试'
                    })
                    return false
                }

                // 等待 2 秒后再次轮询
                await new Promise(resolve => setTimeout(resolve, 2000))
                retryCount++
            }

            // 超时
            this.updateStatus(selfId, {
                status: 'error',
                message: '登录超时，请刷新页面重试'
            })
            return false

        } catch (error) {
            this.ctx.logger.error(`[${selfId}] 登录过程中发生错误，详情: %o`, error)
            this.updateStatus(selfId, {
                status: 'error',
                message: `登录失败: ${error.message || '未知错误'}`
            })
            return false
        }
    }
}
