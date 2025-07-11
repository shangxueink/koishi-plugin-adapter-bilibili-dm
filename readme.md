# koishi-plugin-adapter-bilibili-dm

[![npm](https://img.shields.io/npm/v/koishi-plugin-adapter-bilibili-dm?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-adapter-bilibili-dm)

Bilibili 私信适配器 for Koishi

## ✨ 特性

-   [x] 支持接收 Bilibili 私信。
-   [x] 支持发送 Bilibili 私信文本、图片。
-   [x] 支持将 B站图片链接转换为 Base64 格式以解决显示问题。

## ⚙️ 配置

### 如何获取 B站 UID

在配置插件之前，您需要获取您的 Bilibili 账号 UID。

*   **手机端参考：**
    [![手机端获取UID](https://i0.hdslb.com/bfs/openplatform/9168ed872d8d132ee32d265b17327bbda5d40588.png)](https://i0.hdslb.com/bfs/openplatform/9168ed872d8d132ee32d265b17327bbda5d40588.png)
*   **电脑端参考：**
    [![电脑端获取UID](https://i0.hdslb.com/bfs/openplatform/b216ed9fd08585fd2b1b7e89cef06618e10553c2.png)](https://i0.hdslb.com/bfs/openplatform/b216ed9fd08585fd2b1b7e89cef06618e10553c2.png)

获取到您的 UID 后，将其填入 Koishi 插件配置项中，然后启用插件即可。

**重要提示：**

*   接入需要账号的 **UID**。
*   需要登录 Bilibili 获取认证信息才能正常发送消息。

### 图片显示问题

Bilibili 图片链接通常会设置 `referrer` 策略。为了在某些环境下能够正常显示这些图片，我们必须以 `no-referrer` 方式访问。本插件提供了一个配置项，可以将 B站图片链接转换为 Base64 格式，以解决显示问题。建议开启此功能。

## 🚧 待办事项 / 已知问题

以下是当前适配器的一些已知问题和未来的计划：

*   **[x] 限制：** B站私信目前只支持发送文本和已上传 B站的图片内容。
*   **[x] 限制：** B站私信可能存在内容屏蔽机制，部分敏感内容可能无法成功发送。
*   **[ ] TODO：** 改进并发处理逻辑，确保所有消息都能被正确接收/发送，减少漏消息的可能性。
    *   **注意：** 由于 B站私信采用轮询 API 的方式，发送和接收消息时可能存在消息丢失的情况。
*   **[ ] TODO：** 支持更多消息类型 (例如：小视频卡片)。
*   **[ ] TODO：** 支持单独配置的网络代理，以应对网络环境限制。

### 多端消息同步问题

请注意，Bilibili 的多端消息同步可能存在不一致的情况。例如，如果您在电脑端发送了消息并收到了对方回复，在手机端可能无法看到对方的回复。

## 🤝 贡献

欢迎提交 Pull Request 或 Issue 来帮助改进此项目。您的贡献将不胜感激！

## 📄 许可证

[MIT License](LICENSE)
