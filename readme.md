# koishi-plugin-adapter-bilibili-dm

[![npm](https://img.shields.io/npm/v/koishi-plugin-adapter-bilibili-dm?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-adapter-bilibili-dm)


Bilibili 私信适配器

## ✨ 特性 

-   [x] 支持接收 Bilibili 私信。
-   [x] 支持发送 Bilibili 私信文本、图片。
-   [x] . . .


## ⚙️ 配置 


找到B站账号UID，并且填入配置项。然后开启插件即可啦~


**重要提示：**
*   接入需要账号的 **UID**。
*   需要登录 Bilibili 获取认证信息才能正常发送消息。

## 🚧 待办事项 / 已知问题


以下是当前适配器的一些已知限制和未来计划：

-   **消息回复延迟：**
    -   [ ] **问题：** 回复消息可能存在延迟，通常在 3 到 30 秒内回复均为正常范围。

-   **并发回复问题：**
    -   [ ] **问题：** 在并发回复多条消息时，可能会出现部分消息漏回复的情况。
    -   [ ] **TODO：** 改进并发处理逻辑，确保所有消息都能被正确发送。

-   **偶发重复回复：**
    -   [ ] **问题：** 偶发性地出现重复回复同一条消息的情况。
    -   [ ] **TODO：** 尚未找到稳定的复现方法，需进一步排查原因并修复。

-   **内容限制：**
    -   [x] **限制：** B站私信目前只支持发送文本和已上传B站的图片内容。
    -   [ ] **TODO：** 支持更多消息类型

## 🤝 贡献

欢迎提交 Pull Request 或 Issue 来帮助改进此适配器。

## 📄 许可证

[MIT License](LICENSE)
