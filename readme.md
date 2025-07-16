# koishi-plugin-adapter-bilibili-dm

[![npm](https://img.shields.io/npm/v/koishi-plugin-adapter-bilibili-dm?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-adapter-bilibili-dm)  [![npm downloads](https://img.shields.io/npm/dm/koishi-plugin-adapter-bilibili-dm)](https://www.npmjs.com/package/koishi-plugin-adapter-bilibili-dm)


Bilibili 私信适配器 for Koishi

![preview.gif](https://raw.githubusercontent.com/Roberta001/koishi-plugin-adapter-bilibili-dm/refs/heads/main/screenshots/preview.gif)
    

## ✨ 特性

-   [x] 支持接收 Bilibili 私信。
-   [x] 支持图片上传B站。
-   [x] 支持发送 Bilibili 私信文本、图片。
-   [x] 支持获取用户公开信息。
-   [x] 支持多开适配器。

## ⚙️ 配置

### 如何获取 B站 UID

在配置插件之前，您需要获取您的 Bilibili 账号 UID。

<details>
<summary>点击此展开 UID查看方法</summary>

*   **手机端参考：**
    ![手机端获取UID](https://i0.hdslb.com/bfs/openplatform/9168ed872d8d132ee32d265b17327bbda5d40588.png)
*   **电脑端参考：**
    ![电脑端获取UID](https://i0.hdslb.com/bfs/openplatform/b216ed9fd08585fd2b1b7e89cef06618e10553c2.png)

</details>

获取到您的 UID 后，将其填入 Koishi 插件配置项中，然后启用插件即可。

---

**重要提示：**

*   接入需要账号的 **UID**。
*   需要登录 Bilibili 获取认证信息才能正常发送消息。

<details>
<summary>点击此展开 APP扫码方法</summary>

*   **APP扫码获取方法：**
    ![APP扫码获取UID](https://i0.hdslb.com/bfs/openplatform/d3f604c1b732ff83f0874ee89027dda8e4c3031a.png)

    ![控制台登录](https://i0.hdslb.com/bfs/openplatform/330ff2dfb8f83d62afbb8ed3ffe4e2acc9c5ed39.png)
</details>

### 图片显示问题

Bilibili 图片设置了 `referrer` 策略。为了在koishi控制台正常显示这些图片，本插件提供了将 B站图片链接转换为 Base64 格式的配置项，以解决显示问题。


## 🚧 待办事项 / 已知问题

### 已知问题与限制

*   [x] **内容限制：** B站私信目前只支持发送文本和已上传至B站的图片内容。
*   [x] **内容屏蔽：** B站私信存在屏蔽机制，部分敏感内容可能无法成功发送。
*   [x] **多端同步问题：** 多端消息同步可能存在不一致的情况（例如：电脑端发送消息后，手机端可能无法看到对方回复）。此问题暂未稳定复现。
*   [ ] **消息延迟：** 发送/接收消息存在 `3 ~ 10` 秒延迟，均为正常现象。
*   [ ] **消息丢失：** 发送和接收消息时可能存在消息丢失的情况。

### 待办事项 

*   [ ] **并发处理优化：** 改进并发处理逻辑，确保所有消息都能被正确接收/发送，减少漏消息的可能性。
*   [ ] **更多消息类型支持：** 支持更多消息类型（例如：小视频卡片）。
*   [ ] **网络代理配置：** 支持单独配置网络代理，以应对网络环境限制。
*   [ ] **优化前后端处理：** 增加代码的鲁棒性。
*   [ ] **更规范的代码行为：** 优化代码结构、调用、服务。


## 📚 支持的 API 调用

<details>
<summary>点击此展开 支持的API调用</summary>

### `session.bot` 


*   **`sendMessage(channelId: string, content: Fragment): Promise<string[]>`**
    *   向指定频道发送消息。
    *   示例: `await session.bot.sendMessage(session.channelId, 'Hello from Koishi!');`

*   **`sendPrivateMessage(userId: string, content: Fragment): Promise<string[]>`**
    *   向指定用户发送私信。
    *   示例: `await session.bot.sendPrivateMessage(session.userId, 'Hello private!');`

*   **`getMessage(channelId: string, messageId: string): Promise<any | undefined>`**
    *   获取指定频道中的特定消息详情。
    *   示例: `const message = await session.bot.getMessage(session.channelId, session.messageId);`

*   **`deleteMessage(channelId: string, messageId: string): Promise<void>`**
    *   撤回指定频道中的特定消息。
    *   示例: `await session.bot.deleteMessage(session.channelId, messageId);`

### `session.bot.internal`

*   **`followUser(uid: string): Promise<boolean>`**
    *   关注指定 UP 主。
    *   示例: `await session.bot.internal.followUser('123456');`

*   **`unfollowUser(uid: string): Promise<boolean>`**
    *   取消关注指定 UP 主。
    *   示例: `await session.bot.internal.unfollowUser('123456');`

*   **`getFollowedUsers(): Promise<any[]>`**
    *   获取当前账号关注的 UP 主列表。
    *   示例: `const followedUsers = await session.bot.internal.getFollowedUsers();`

*   **`getPersonalDynamics(uid: string): Promise<DynamicItem[]>`**
    *   获取指定 UP 主的动态列表。
    *   示例: `const personalDynamics = await session.bot.internal.getPersonalDynamics(session.userId);`

*   **`getDynamicDetail(dynamicId: string): Promise<DynamicItem | null>`**
    *   获取指定动态的详细信息。
    *   示例: `const dynamicDetail = await session.bot.internal.getDynamicDetail('1234567890123456789');`

*   **`getAllFollowedDynamics(): Promise<DynamicItem[]>`**
    *   获取所有关注的 UP 主的最新动态列表。
    *   示例: `const allFollowedDynamics = await session.bot.internal.getAllFollowedDynamics();`

</details>

## 🤝 贡献

欢迎提交 Pull Request 或 Issue 来帮助改进此项目。

### 如何在项目模板中开发此仓库


<details>
<summary>点击此展开 如何在项目模板中开发此仓库</summary>

1.  **创建项目模板** 🚀

    ```shell
    yarn create koishi
    ```

    一路回车，直到弹出 Koishi 的 WebUI。

2.  **进入项目模板根目录** 📂

    先在 Koishi 终端按下 `Ctrl + C` 退出项目模板，然后 `cd` 进入目录：

    ```shell
    cd koishi-app
    ```

3.  **克隆本仓库** ⬇️

    ```shell
    yarn clone Roberta001/koishi-plugin-adapter-bilibili-dm
    ```

4.  **以开发模式启动** 🚧
    
    ```shell
    yarn dev
    ```

</details>

## 📄 许可证

[MIT License](LICENSE)
