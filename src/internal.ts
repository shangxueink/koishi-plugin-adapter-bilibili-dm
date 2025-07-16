import { BilibiliDmBot } from './bot';
import { Context } from 'koishi';
import { logInfo, loggerError } from './index';

interface DynamicItem {
    id_str: string;
    type: string;
    modules: {
        module_author: {
            mid: number;
            name: string;
            face: string;
            pub_action: string;
            pub_ts: number;
        };
        module_dynamic: {
            desc?: {
                text: string;
            };
            major?: {
                type: string;
                archive?: {
                    aid: string;
                    bvid: string;
                    title: string;
                    desc: string;
                    cover: string;
                    jump_url: string;
                };
                draw?: {
                    items: Array<{ src: string }>;
                };
                article?: {
                    id: number;
                    title: string;
                    desc: string;
                    covers: string[];
                    jump_url: string;
                };
                live?: {
                    id: number;
                    title: string;
                    cover: string;
                    jump_url: string;
                    live_state: number; // 0: 直播结束, 1: 正在直播
                };
            };
        };
    };
}

export class Internal {
    private bot: BilibiliDmBot;
    private ctx: Context;
    private pollIntervalId: (() => void) | null = null;
    private isPolling: boolean = false;
    private lastDynamicBaseline: string = '0';

    constructor(bot: BilibiliDmBot, ctx: Context) {
        this.bot = bot;
        this.ctx = ctx;
    }

    // #region bilibili user

    /**
     * 关注指定 UP 主
     * @param uid UP 主的 UID
     * @returns Promise<boolean> 是否成功关注
     */
    async followUser(uid: string): Promise<boolean> {
        try {
            const res = await this.bot.http.http.post(
                'https://api.bilibili.com/x/relation/modify',
                new URLSearchParams({
                    fid: uid,
                    act: '1', // 1: 关注
                    re_src: '11', // 个人空间
                    csrf: this.bot.http['biliJct'], // 从 HttpClient 获取 biliJct
                    csrf_token: this.bot.http['biliJct']
                })
            );
            if (res.code === 0) {
                logInfo(`成功关注 UP 主: ${uid}`);
                return true;
            } else {
                loggerError(`关注 UP 主 ${uid} 失败: ${res.message} (Code: ${res.code})`);
                return false;
            }
        } catch (error) {
            loggerError(`关注 UP 主 ${uid} 时发生错误: `, error);
            return false;
        }
    }

    /**
     * 取消关注指定 UP 主
     * @param uid UP 主的 UID
     * @returns Promise<boolean> 是否成功取消关注
     */
    async unfollowUser(uid: string): Promise<boolean> {
        try {
            const res = await this.bot.http.http.post(
                'https://api.bilibili.com/x/relation/modify',
                new URLSearchParams({
                    fid: uid,
                    act: '2', // 2: 取关
                    re_src: '11', // 个人空间
                    csrf: this.bot.http['biliJct'], // 从 HttpClient 获取 biliJct
                    csrf_token: this.bot.http['biliJct']
                })
            );
            if (res.code === 0) {
                logInfo(`成功取消关注 UP 主: ${uid}`);
                return true;
            } else {
                loggerError(`取消关注 UP 主 ${uid} 失败: ${res.message} (Code: ${res.code})`);
                return false;
            }
        } catch (error) {
            loggerError(`取消关注 UP 主 ${uid} 时发生错误: `, error);
            return false;
        }
    }

    /**
     * 获取关注的用户列表
     * @returns Promise<any[]> 关注的用户列表
     */
    async getFollowedUsers(): Promise<any[]> {
        try {
            // B站获取关注列表的API通常是 /x/relation/followings
            // 假设每页50个，最多获取10页
            let page = 1;
            let hasMore = true;
            const allFollowings: any[] = [];
            while (hasMore && page <= 10) { // 限制页数，避免无限循环
                const res = await this.bot.http.http.get(
                    'https://api.bilibili.com/x/relation/followings',
                    {
                        params: {
                            vmid: this.bot.selfId, // 自己的UID
                            pn: page, // 页码
                            ps: 50, // 每页数量
                        }
                    }
                );
                if (res.code === 0 && res.data) {
                    allFollowings.push(...res.data.list);
                    hasMore = res.data.has_more;
                    page++;
                } else {
                    loggerError(`获取关注列表失败: ${res.message} (Code: ${res.code})`);
                    hasMore = false;
                }
            }
            logInfo(`成功获取 ${allFollowings.length} 个关注的用户`);
            return allFollowings;
        } catch (error) {
            loggerError('获取关注的用户列表时发生错误: ', error);
            return [];
        }
    }

    // #region bilibili dynamic

    /**
    * 获取指定 UP 主的动态
    * @param uid UP 主的 UID
    * @returns Promise<any[]> 指定 UP 主的动态列表
    */
    async getPersonalDynamics(uid: string): Promise<DynamicItem[]> {
        logInfo(`尝试获取 UP 主 ${uid} 的个人动态`);
        try {
            const res = await this.bot.http.http.get(
                'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
                {
                    params: {
                        host_mid: uid,
                        type: 'all',
                        platform: 'web',
                    }
                }
            );
            if (res.code === 0 && res.data?.items) {
                logInfo(`成功获取 UP 主 ${uid} 的 ${res.data.items.length} 条动态`);
                return res.data.items;
            } else {
                loggerError(`获取 UP 主 ${uid} 动态失败: ${res.message} (Code: ${res.code})`);
                return [];
            }
        } catch (error) {
            loggerError(`获取 UP 主 ${uid} 动态时发生错误: `, error);
            return [];
        }
    }

    /**
     * 获取动态详情
     * @param dynamicId 动态 ID
     * @returns Promise<DynamicItem | null> 动态详情
     */
    async getDynamicDetail(dynamicId: string): Promise<DynamicItem | null> {
        try {
            const res = await this.bot.http.http.get(
                'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail',
                {
                    params: {
                        id: dynamicId,
                        features: 'itemOpusStyle,opusBigCover,onlyfansVote,endFooterHidden,decorationCard,onlyfansAssetsV2,ugcDelete,onlyfansQaCard,commentsNewVersion',
                        platform: 'web',
                        gaia_source: 'main_web',
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    }
                }
            );
            if (res.code === 0 && res.data?.item) {
                logInfo(`成功获取动态 ${dynamicId} 的详情`);
                return res.data.item;
            } else {
                loggerError(`获取动态 ${dynamicId} 详情失败: ${res.message} (Code: ${res.code})`);
                return null;
            }
        } catch (error) {
            loggerError(`获取动态 ${dynamicId} 详情时发生错误: `, error);
            return null;
        }
    }

    /**
     * 获取所有关注的 UP 主的动态
     * @returns Promise<any[]> 所有关注的 UP 主的动态列表
     */
    async getAllFollowedDynamics(): Promise<DynamicItem[]> {
        try {
            const res = await this.bot.http.http.get(
                'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
                {
                    params: {
                        type: 'all',
                        platform: 'web',
                    }
                }
            );
            if (res.code === 0 && res.data?.items) {
                logInfo(`成功获取所有关注 UP 主的 ${res.data.items.length} 条动态`);
                // 更新 baseline
                if (res.data.update_baseline) {
                    this.lastDynamicBaseline = res.data.update_baseline;
                }
                return res.data.items;
            } else {
                loggerError(`获取所有关注 UP 主动态失败: ${res.message} (Code: ${res.code})`);
                return [];
            }
        } catch (error) {
            loggerError('获取所有关注 UP 主动态时发生错误: ', error);
            return [];
        }
    }

}

// #endregion
