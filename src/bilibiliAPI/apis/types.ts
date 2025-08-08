/* eslint-disable @typescript-eslint/naming-convention */

import { BilibiliDmBot } from '../../bot/bot'

// 基础响应接口
export interface BilibiliResponse<T = any> {
    code: number
    message: string
    ttl: number
    data: T
}

// 自定义错误类型
export class BilibiliError extends Error {
    public readonly biliCode: number
    public readonly originalMessage: string

    constructor(message: string, code: number) {
        super(`${message} (Code: ${code})`)
        this.name = 'BilibiliError'
        this.biliCode = code
        this.originalMessage = message
    }
}

// 动态相关类型定义
export interface DynamicAuthor {
    mid: number
    name: string
    face: string
    face_nft: boolean
    following: boolean | null
    jump_url: string
    label: string
    official_verify: {
        desc: string
        type: number
    }
    pendant: {
        expire: number
        image: string
        image_enhance: string
        image_enhance_frame: string
        name: string
        pid: number
        n_pid: number
    }
    pub_action: string
    pub_location_text: string
    pub_time: string
    pub_ts: number
    type: string
    vip: {
        avatar_subscript: number
        avatar_subscript_url: string
        due_date: number
        label: {
            bg_color: string
            bg_style: number
            border_color: string
            img_label_uri_hans: string
            img_label_uri_hans_static: string
            img_label_uri_hant: string
            img_label_uri_hant_static: string
            label_theme: string
            path: string
            text: string
            text_color: string
            use_img_label: boolean
        }
        nickname_color: string
        status: number
        theme_type: number
        type: number
    }
    decorate?: {
        card_url: string
        fan: {
            color: string
            color_format: any
            is_fan: boolean
            num_str: string
            number: number
        }
        id: number
        jump_url: string
        name: string
        type: number
    }
    nft_info?: {
        region_icon: string
        region_type: number
        show_status: number
    }
}

export interface RichTextNode {
    orig_text: string
    text: string
    type: string
    emoji?: {
        icon_url: string
        size: number
        text: string
        type: number
    }
    jump_url?: string
    rid?: string
    goods?: {
        jump_url: string
        type: number
    }
    icon_name?: string
}

export interface DynamicDesc {
    rich_text_nodes: RichTextNode[]
    text: string
}

export interface DynamicMajor {
    type: string
    ugc_season?: {
        aid: number
        badge: {
            bg_color: string
            color: string
            text: string
        }
        cover: string
        desc: string
        disable_preview: number
        duration_text: string
        jump_url: string
        stat: {
            danmaku: string
            play: string
        }
        title: string
    }
    article?: {
        covers: string[]
        desc: string
        id: number
        jump_url: string
        label: string
        title: string
    }
    draw?: {
        id: number
        items: Array<{
            height: number
            size: number
            src: string
            tags: any[]
            width: number
        }>
    }
    archive?: {
        aid: string
        badge: {
            bg_color: string
            color: string
            text: string
        }
        bvid: string
        cover: string
        desc: string
        disable_preview: number
        duration_text: string
        jump_url: string
        stat: {
            danmaku: string
            play: string
        }
        title: string
        type: number
    }
    live_rcmd?: {
        content: string
        reserve_type: number
    }
    common?: {
        badge: {
            bg_color: string
            color: string
            text: string
        }
        biz_type: number
        cover: string
        desc: string
        id: string
        jump_url: string
        label: string
        sketch_id: string
        style: number
        title: string
    }
    pgc?: {
        badge: {
            bg_color: string
            color: string
            text: string
        }
        cover: string
        epid: number
        jump_url: string
        season_id: number
        stat: {
            danmaku: string
            play: string
        }
        sub_type: number
        title: string
        type: number
    }
    courses?: {
        badge: {
            bg_color: string
            color: string
            text: string
        }
        cover: string
        desc: string
        id: number
        jump_url: string
        sub_title: string
        title: string
    }
    music?: {
        cover: string
        id: number
        jump_url: string
        label: string
        title: string
    }
    opus?: {
        fold_action: any[]
        jump_url: string
        pics: any[]
        summary: {
            rich_text_nodes: RichTextNode[]
            text: string
        }
        title: string | null
    }
    live?: {
        badge: {
            bg_color: string
            color: string
            text: string
        }
        cover: string
        desc_first: string
        desc_second: string
        id: number
        jump_url: string
        live_state: number
        reserve_type: number
        title: string
    }
    none?: {
        tips: string
    }
}

export interface DynamicAdditional {
    type: string
    common?: {
        button: {
            jump_style?: {
                icon_url: string
                text: string
            }
            jump_url: string
            type: number
            check?: {
                icon_url: string
                text: string
            }
            status?: number
            uncheck?: {
                icon_url: string
                text: string
            }
        }
        cover: string
        desc1: string
        desc2: string
        head_text: string
        id_str: string
        jump_url: string
        style: number
        sub_type: string
        title: string
    }
    reserve?: {
        button: {
            check?: {
                icon_url: string
                text: string
            }
            status: number
            type: number
            uncheck?: {
                icon_url: string
                text: string
                toast: string
                disable?: number
            }
            jump_style?: {
                icon_url: string
                text: string
            }
            jump_url?: string
        }
        desc1: {
            style: number
            text: string
        }
        desc2: {
            style: number
            text: string
            visible: boolean
        }
        jump_url: string
        reserve_total: number
        rid: number
        state: number
        stype: number
        title: string
        up_mid: number
        desc3?: {
            jump_url: string
            style: number
            text: string
        }
    }
    goods?: {
        head_icon: string
        head_text: string
        items: Array<{
            brief: string
            cover: string
            id: string
            jump_desc: string
            jump_url: string
            name: string
            price: string
        }>
        jump_url: string
    }
    vote?: {
        choice_cnt: number
        default_share: number
        desc: string
        end_time: number
        join_num: number
        status: number
        type: any
        uid: number
        vote_id: number
    }
    ugc?: {
        cover: string
        desc_second: string
        duration: string
        head_text: string
        id_str: string
        jump_url: string
        multi_line: boolean
        title: string
    }
}

export interface DynamicTopic {
    id: number
    jump_url: string
    name: string
}

export interface DynamicStat {
    comment: {
        count: number
        forbidden: boolean
        hidden?: boolean
    }
    forward: {
        count: number
        forbidden: boolean
    }
    like: {
        count: number
        forbidden: boolean
        status: boolean
    }
}

export interface DynamicInteraction {
    items: Array<{
        desc: {
            rich_text_nodes: RichTextNode[]
            text: string
        }
        type: number
    }>
}

export interface DynamicFold {
    ids: string[]
    statement: string
    type: number
    users: any[]
}

export interface DynamicDispute {
    desc: string
    jump_url: string
    title: string
}

export interface DynamicTag {
    text: string
}

export interface DynamicMore {
    three_point_items: Array<{
        label: string
        type: string
        modal?: {
            cancel: string
            confirm: string
            content: string
            title: string
        }
        params?: {
            dynamic_id?: string
            status?: boolean
        }
    }>
}

export interface DynamicModules {
    module_author: DynamicAuthor
    module_dynamic: {
        additional: DynamicAdditional | null
        desc: DynamicDesc | null
        major: DynamicMajor | null
        topic: DynamicTopic | null
    }
    module_more: DynamicMore
    module_stat: DynamicStat
    module_interaction?: DynamicInteraction
    module_fold?: DynamicFold
    module_dispute?: DynamicDispute
    module_tag?: DynamicTag
}

export interface DynamicBasic {
    comment_id_str: string
    comment_type: number
    like_icon: {
        action_url: string
        end_url: string
        id: number
        start_url: string
    }
    rid_str: string
}

export interface DynamicItem {
    basic: DynamicBasic
    id_str: string
    modules: DynamicModules
    type: string
    visible: boolean
    orig?: DynamicItem
}

export interface DynamicFeedResponse {
    has_more: boolean
    items: DynamicItem[]
    offset: string
    update_baseline: string
    update_num: number
}

export interface DynamicDetailResponse {
    item: DynamicItem
}

// 用户关注相关类型
export interface FollowingUser {
    mid: number
    attribute: number
    mtime: number
    tag: any[]
    special: number
    uname: string
    face: string
    sign: string
    official_verify: {
        type: number
        desc: string
    }
    vip: {
        vipType: number
        vipDueDate: number
        dueRemark: string
        accessStatus: number
        vipStatus: number
        vipStatusWarn: string
        themeType: number
        label: {
            path: string
            text: string
            label_theme: string
            text_color: string
            bg_style: number
            bg_color: string
            border_color: string
        }
        avatar_subscript: number
        nickname_color: string
    }
    nft_icon: string
    rec_reason: string
    track_id: string
}

export interface FollowingListResponse {
    list: FollowingUser[]
    re_version: number
    total: number
    has_more: boolean
}

// 动态事件数据类型
export interface DynamicEventData {
    dynamicId: string
    type: string
    author: {
        uid: number
        name: string
        face: string
        action: string
        timestamp: number
    }
    content: {
        text: string
        type: string
        video?: {
            aid: string
            bvid: string
            title: string
            desc: string
            cover: string
            url: string
        }
        images?: string[]
        article?: {
            id: number
            title: string
            desc: string
            covers: string[]
            url: string
        }
        live?: {
            id: number
            title: string
            cover: string
            url: string
            isLive: boolean
        }
    }
    rawData: DynamicItem
}

// 搜索相关类型定义
export interface SearchUser {
    type: 'bili_user'
    mid: number
    uname: string
    usign: string
    fans: number
    videos: number
    upic: string
    verify_info: string
    level: number
    gender: number
    is_upuser: number
    is_live: number
    room_id?: number
    res?: Array<{
        aid: number
        bvid: string
        title: string
        pubdate: number
        arcurl: string
        pic: string
        play: string
        dm: number
        coin: number
        fav: number
        desc: string
        duration: string
        is_pay: number
        is_union_video: number
    }>
    official_verify?: {
        type: number
        desc: string
    }
    hit_columns: string[]
}

export interface SearchVideo {
    type: 'video'
    id: number
    author: string
    mid: number
    typeid: string
    typename: string
    arcurl: string
    aid: number
    bvid: string
    title: string
    description: string
    arcrank: string
    pic: string
    play: number
    video_review: number
    favorites: number
    tag: string
    review: number
    pubdate: number
    senddate: number
    duration: string
    badgepay: boolean
    hit_columns: string[]
    view_type: string
    is_pay: number
    is_union_video: number
    rec_tags: any
    new_rec_tags: any[]
    rank_score: number
}

export interface SearchLiveRoom {
    type: 'live_room'
    roomid: number
    uid: number
    title: string
    cover: string
    user_cover: string
    system_cover: string
    area: number
    area_name: string
    area_v2_id: number
    area_v2_name: string
    area_v2_parent_id: number
    area_v2_parent_name: string
    online: number
    live_status: number
    live_time: string
    tags: string
    is_attention: number
    attentions: number
    hit_columns: string[]
    uname: string
    face: string
    rank_score: number
}

export interface SearchLiveUser {
    type: 'live_user'
    uid: number
    uname: string
    face: string
    gender: number
    is_live: number
    room_id: number
    roomid: number
    is_attention: number
    attentions: number
    live_status: number
    hit_columns: string[]
    rank_score: number
}

export interface SearchArticle {
    type: 'article'
    id: number
    title: string
    desc: string
    image_urls: string[]
    publish_time: number
    ctime: number
    stats: {
        view: number
        favorite: number
        like: number
        dislike: number
        reply: number
        share: number
        coin: number
    }
    mid: number
    author: string
    category_id: number
    category_name: string
    template_id: number
    hit_columns: string[]
    like: number
    view: number
    rank_score: number
}

export interface ComprehensiveSearchResponse {
    seid: string
    page: number
    pagesize: number
    numResults: number
    numPages: number
    suggest_keyword: string
    rqt_type: string
    cost_time: Record<string, string>
    exp_list: Record<string, boolean>
    egg_hit: number
    pageinfo: Record<string, {
        numResults: number
        total: number
        pages: number
    }>
    top_tlist: Record<string, number>
    show_column: number
    show_module_list: string[]
    result: Array<{
        result_type: string
        data: any[]
    }>
}

export interface TypeSearchResponse {
    seid: number
    page: number
    pagesize: number
    numResults: number
    numPages: number
    suggest_keyword: string
    rqt_type: string
    cost_time: Record<string, string>
    exp_list: Record<string, boolean>
    egg_hit: number
    pageinfo?: {
        live_room?: {
            numPages: number
            numResults: number
            total: number
            pages: number
        }
        live_user?: {
            numPages: number
            numResults: number
            total: number
            pages: number
        }
    }
    result: any[] | {
        live_room?: SearchLiveRoom[]
        live_user?: SearchLiveUser[]
    }
    show_column: number
}

export interface SearchOptions {
    // 分页
    page?: number

    // 排序方式（用于视频、专栏、相簿）
    order?: 'totalrank' | 'click' | 'pubdate' | 'dm' | 'stow' | 'scores' | 'attention'

    // 用户排序（用于用户搜索）
    userOrder?: '0' | 'fans' | 'level'
    orderSort?: 0 | 1 // 0: 由高到低, 1: 由低到高

    // 用户类型筛选
    userType?: 0 | 1 | 2 | 3 // 0: 全部, 1: UP主, 2: 普通用户, 3: 认证用户

    // 视频时长筛选
    duration?: 0 | 1 | 2 | 3 | 4 // 0: 全部, 1: <10分钟, 2: 10-30分钟, 3: 30-60分钟, 4: >60分钟

    // 视频分区筛选
    tids?: number // 0: 全部分区

    // 专栏/相簿分区筛选
    categoryId?: number
}

// Internal API 接口定义
export interface InternalInterface {
    // 用户关注相关
    followUser(uid: string): Promise<boolean>
    unfollowUser(uid: string): Promise<boolean>
    getFollowedUsers(maxPages?: number): Promise<FollowingUser[]>
    getUserInfo(uid: string): Promise<any>
    isFollowing(uid: string): Promise<boolean>
    batchCheckFollowing(uids: string[]): Promise<Record<string, boolean>>

    // 动态相关
    getAllFollowedDynamics(offset?: string, updateBaseline?: string): Promise<DynamicItem[]>
    getPersonalDynamics(uid: string, offset?: string): Promise<DynamicItem[]>
    getDynamicDetail(dynamicId: string): Promise<DynamicItem | null>

    // 动态监听
    startDynamicPolling(interval?: number): void
    stopDynamicPolling(): void
    isPollingActive(): boolean
    setPollInterval(interval: number): void
    getCurrentBaseline(): string
    setBaseline(baseline: string): void

    // 搜索相关
    comprehensiveSearch(keyword: string): Promise<ComprehensiveSearchResponse | null>
    searchUsers(keyword: string, options?: SearchOptions): Promise<SearchUser[]>
    searchVideos(keyword: string, options?: SearchOptions): Promise<SearchVideo[]>
    searchLive(keyword: string, options?: SearchOptions): Promise<{ liveRooms: SearchLiveRoom[], liveUsers: SearchLiveUser[] }>
    searchArticles(keyword: string, options?: SearchOptions): Promise<SearchArticle[]>
    searchUsersByName(username: string, exactMatch?: boolean): Promise<SearchUser[]>
    searchUpUsers(keyword: string, options?: SearchOptions): Promise<SearchUser[]>
}