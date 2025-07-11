# koishi-plugin-adapter-bilibili-dm

[![npm](https://img.shields.io/npm/v/koishi-plugin-adapter-bilibili-dm?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-adapter-bilibili-dm)

Bilibili 私信适配器 for Koishi

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
    [![手机端获取UID](https://i0.hdslb.com/bfs/openplatform/9168ed872d8d132ee32d265b17327bbda5d40588.png)](https://i0.hdslb.com/bfs/openplatform/9168ed872d8d132ee32d265b17327bbda5d40588.png)
*   **电脑端参考：**
    [![电脑端获取UID](https://i0.hdslb.com/bfs/openplatform/b216ed9fd08585fd2b1b7e89cef06618e10553c2.png)](https://i0.hdslb.com/bfs/openplatform/b216ed9fd08585fd2b1b7e89cef06618e10553c2.png)

</details>

获取到您的 UID 后，将其填入 Koishi 插件配置项中，然后启用插件即可。

---

**重要提示：**

*   接入需要账号的 **UID**。
*   需要登录 Bilibili 获取认证信息才能正常发送消息。

<details>
<summary>点击此展开 APP扫码方法</summary>

*   **APP扫码获取方法：**
    [![APP扫码获取UID](https://i0.hdslb.com/bfs/openplatform/d3f604c1b732ff83f0874ee89027dda8e4c3031a.png)](https://i0.hdslb.com/bfs/openplatform/d3f604c1b732ff83f0874ee89027dda8e4c3031a.png)
</details>



### 图片显示问题

Bilibili 图片设置了 `referrer` 策略。为了在koishi控制台正常显示这些图片，本插件提供了将 B站图片链接转换为 Base64 格式的配置项，以解决显示问题。

## 🚧 待办事项 / 已知问题

### 已知问题与限制

*   [x] **内容限制：** B站私信目前只支持发送文本和已上传至B站的图片内容。
*   [x] **内容屏蔽：** B站私信存在屏蔽机制，部分敏感内容可能无法成功发送。
*   [x] **多端同步问题：** 多端消息同步可能存在不一致的情况（例如：电脑端发送消息后，手机端可能无法看到对方回复）。此问题暂未稳定复现。
*   [ ] **消息丢失：** 发送和接收消息时可能存在消息丢失的情况。

### 待办事项 

*   [ ] **并发处理优化：** 改进并发处理逻辑，确保所有消息都能被正确接收/发送，减少漏消息的可能性。
*   [ ] **更多消息类型支持：** 支持更多消息类型（例如：小视频卡片）。
*   [ ] **网络代理配置：** 支持单独配置网络代理，以应对网络环境限制。
*   [ ] **更规范的代码行为：** 优化代码结构、调用、服务。

## 🤝 贡献

欢迎提交 Pull Request 或 Issue 来帮助改进此项目。您的贡献将不胜感激！

## 📄 许可证

[MIT License](LICENSE)
