//  src\service.ts
import { Context, Logger } from 'koishi'
import { BilibiliDmBot } from './bot'
import { BotStatus } from './index'
import { PluginConfig } from './schema'
import QRCode from 'qrcode'

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

const logger = new Logger('adapter-bilibili-dm');

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
                (this.logInfo as (message: string, ...args: any[]) => void)(message, ...args);
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
        if (this.isDisposed) return
        // 确保selfId不为空
        if (!selfId) {
            logger.error('updateStatus: selfId为空，无法更新状态')
            return
        }

        // 记录更新前的状态
        this.logInfo(`[${selfId}] 更新状态前: ${JSON.stringify(this.status[selfId]?.status)}, 更新为: ${JSON.stringify(status.status)}`)

        // 更新状态对象
        this.status[selfId] = {
            ...(this.status[selfId] || { status: 'init', selfId }),
            ...status,
            selfId: selfId, // 确保selfId正确
        }

        // 触发状态更新事件，使用包含selfId的唯一事件名称
        const eventName = `bilibili-dm-${selfId}/status-update`;
        this.logInfo(`[${selfId}] 触发状态更新事件: ${eventName}, 状态: ${this.status[selfId].status}`)
        this.ctx.emit(eventName as any, this.status[selfId])

        // 同时触发通用事件，保持向后兼容
        this.ctx.emit('bilibili-dm/status-update', this.status[selfId])

        // 状态包含二维码，确保正确传递
        if (status.status === 'qrcode' && status.image) {
            this.logInfo(`[${selfId}] 二维码图片已生成并准备发送到前端，数据长度: ${status.image.length} 字节`)
        }

        // 手动触发一次状态更新，确保前端能收到最新状态
        this.ctx.setTimeout(() => {
            this.ctx.emit(eventName as any, this.status[selfId])
            this.logInfo(`[${selfId}] 手动再次触发状态更新事件，确保前端收到最新状态: ${this.status[selfId].status}`)
        }, 100)
    }

    // 启动登录流程
    async startLogin(bot: BilibiliDmBot, sessionFile: string): Promise<boolean> {
        const selfId = bot.selfId

        try {
            /*
            // 记录详细的启动信息
            this.logInfo(`[${selfId}] ======= 开始登录流程 =======`)
            this.logInfo(`[${selfId}] 机器人ID: ${selfId}`)
            this.logInfo(`[${selfId}] 缓存文件路径: ${sessionFile}`)
            this.logInfo(`[${selfId}] 当前服务配置的selfId: ${this.config.selfId}`)
            */

            if (!this.status[selfId]) {
                this.logInfo(`[${selfId}] 创建新的状态对象，因为当前状态中不存在此selfId`)
                this.status[selfId] = {
                    status: 'init',
                    selfId: selfId,
                    message: '正在初始化...'
                }
            }

            // 更新状态为初始化
            this.logInfo(`[${selfId}] 开始startLogin过程，尝试登录...`)
            this.updateStatus(selfId, {
                status: 'init',
                selfId: selfId, // 明确指定selfId
                message: '正在初始化登录...'
            })

            // 手动触发一次状态更新，确保前端能收到初始化状态
            this.ctx.setTimeout(() => {
                const eventName = `bilibili-dm-${selfId}/status-update`;
                this.ctx.emit(eventName as any, this.status[selfId])
                this.logInfo(`[${selfId}] 手动触发状态更新事件，确保前端收到初始化状态`)
            }, 100)

            // 尝试从文件加载 cookie
            const fileExists = existsSync(sessionFile)
            this.logInfo(`[${selfId}] 检查缓存文件: ${sessionFile}，存在: ${fileExists}`)
            if (fileExists) {
                this.logInfo(`[${selfId}] 发现缓存文件: ${sessionFile}，尝试使用缓存登录`)
                try {
                    const cookieData = JSON.parse(await readFile(sessionFile, 'utf8'))
                    this.logInfo(`[${selfId}] 成功读取缓存数据，设置cookies，数据长度: ${JSON.stringify(cookieData).length}`)
                    bot.http.setCookies(cookieData)

                    // 验证 cookie 是否有效
                    this.logInfo(`[${selfId}] 验证cookie有效性...`)
                    const userInfo = await bot.http.getMyInfo()
                    this.logInfo(`[${selfId}] Cookie验证结果: ${userInfo.isValid ? '有效' : '无效'}，用户名: ${userInfo.nickname}`)
                    if (userInfo.isValid) {
                        // 确保状态更新使用正确的selfId
                        this.updateStatus(selfId, {
                            status: 'success',
                            selfId: selfId, // 明确指定selfId
                            message: `已使用缓存登录，欢迎回来 ${userInfo.nickname}`
                        })
                        // 设置bot的用户信息
                        bot.user.name = userInfo.nickname
                        bot.user.username = userInfo.nickname
                        bot.user.nick = userInfo.nickname
                        bot.user.avatar = userInfo.avatar

                        // 在终端输出欢迎消息（只输出一次）
                        logger.info(`[${selfId}] 已使用缓存登录，欢迎回来 ${userInfo.nickname}`)

                        // 确保cookie设置成功后再启动机器人
                        this.logInfo(`[${selfId}] 登录成功，设置cookie并启动机器人`)

                        // 明确设置cookie验证标志
                        bot.http.setCookieVerified(true)
                        this.logInfo(`[${selfId}] 已设置cookie验证标志为true`)

                        // 延迟一点时间确保cookie设置完成
                        await new Promise(resolve => setTimeout(resolve, 1000))

                        // 启动机器人
                        await bot.start()
                        bot.online()

                        return true
                    } else {
                        this.updateStatus(selfId, {
                            status: 'continue',
                            selfId: selfId, // 明确指定selfId
                            message: '缓存的登录信息已失效，需要重新登录'
                        })
                    }
                } catch (error) {
                    logger.error(`[${selfId}] 无法加载缓存的登录信息，错误详情: %o`, error)
                    this.updateStatus(selfId, {
                        status: 'continue',
                        message: '无法加载缓存的登录信息，需要重新登录'
                    })
                }
            } else {
                this.logInfo(`[${selfId}] 未找到缓存文件: ${sessionFile}，需要扫码登录`)
                this.logInfo(`[${selfId}] 未找到缓存文件，将进入扫码登录流程`)

                // 更新状态为需要扫码登录
                this.updateStatus(selfId, {
                    status: 'offline',
                    selfId: selfId,
                    message: '未找到缓存文件，需要扫码登录'
                })

                // 手动触发一次状态更新
                this.ctx.setTimeout(() => {
                    const eventName = `bilibili-dm-${selfId}/status-update`;
                    this.ctx.emit(eventName as any, this.status[selfId])
                    this.logInfo(`[${selfId}] 手动触发状态更新事件，通知前端需要扫码登录`)
                }, 100)
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
                    const eventName = `bilibili-dm-${selfId}/status-update`;
                    this.ctx.emit(eventName as any, this.status[selfId])
                    this.ctx.emit('bilibili-dm/status-update', this.status[selfId]) // 保持向后兼容
                    this.logInfo(`[${selfId}] 手动触发状态更新事件，确保前端收到二维码`)
                }, 500)
            } catch (error) {
                logger.error(`[${selfId}] 生成二维码图片失败:`, error)
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
                    this.logInfo(`[${selfId}] 二维码登录成功，设置cookie`)
                    bot.http.setCookies(pollResult.cookies)
                    await writeFile(sessionFile, JSON.stringify(pollResult.cookies), 'utf8')

                    // 明确设置cookie验证标志
                    bot.http.setCookieVerified(true)
                    this.logInfo(`[${selfId}] 已设置cookie验证标志为true`)

                    // 确保cookie设置成功
                    this.logInfo(`[${selfId}] cookie已保存到文件: ${sessionFile}`)

                    // 获取用户信息
                    const userInfo = await bot.http.getMyInfo()

                    this.updateStatus(selfId, {
                        status: 'success',
                        selfId: selfId, // 明确指定selfId
                        message: `登录成功，欢迎 ${userInfo.nickname}`
                    })

                    // 设置bot的信息
                    bot.user.name = userInfo.nickname
                    bot.user.username = userInfo.nickname
                    bot.user.nick = userInfo.nickname
                    bot.user.avatar = userInfo.avatar

                    // 终端输出欢迎消息
                    this.logInfo(`[${selfId}] 登录成功，欢迎 ${userInfo.nickname}`)

                    // 启动机器人
                    await bot.start()
                    bot.online()

                    // 手动触发一次状态更新，确保前端能收到最新状态
                    this.ctx.setTimeout(() => {
                        const eventName = `bilibili-dm-${selfId}/status-update`;
                        this.ctx.emit(eventName as any, this.status[selfId])
                        this.logInfo(`[${selfId}] 手动触发状态更新事件，确保前端收到登录成功状态`)
                    }, 500)

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
            logger.error(`[${selfId}] 登录过程中发生错误，详情: %o`, error)
            this.updateStatus(selfId, {
                status: 'error',
                message: `登录失败: ${error.message || '未知错误'}`
            })
            return false
        }
    }
}
