# 核心接口约定：提交意见反馈（实验 3）

本文件是主路径上最关键一步的接口约定唯一出处。核对范围仅此一步，其余动作见 `docs/data-fields.md`。

## 接口形式与位置

- **名称**：`submit-fb`（提交意见反馈）
- **形式**：**页面表单提交**，不是 HTTP 接口。页面上带 `data-act="submit-fb"` 的按钮触发，文档级事件委托 `document.addEventListener('click', …)` 分发到动作表；无网络请求、无路由、无请求头。
- **实现位置**：`index.html` 内动作表的 `'submit-fb'` 分支；写入目标为 `localStorage` 单键 `sztu_canteen_db_v1` 中的 `feedbacks` 数组。
- **为什么选它**：主路径是"学生按窗口提意见 → 管理员受理回复 → 学生看到结果"，这一步产生整条链路的主记录，后续状态流转与统计都挂在它上面。

## 请求

| 参数 | 来源 | 类型 | 规则 |
| --- | --- | --- | --- |
| `windowId` | "反馈窗口"下拉（`set-fbwin` 写入 `state.fbWin`） | string | 必填，取值必须是存在且未下架的 `windows.id`；未选时取第一个窗口 |
| `type` | "问题类型"四选一（`set-fbtype` 写入 `state.fbType`） | enum | 必填，饭菜质量 / 卫生状况 / 价格收费 / 服务态度；缺省"饭菜质量" |
| `text` | 描述框 `#fbText` | string | 必填，首尾空白裁剪后长度 **5–200**；表单侧另有 `maxlength="200"` |

`author`、`createdAt`、`id`、`status`、`reply`、`repliedAt` **由系统生成，不接受外部传入**：`author` 取 `profile.nickname`，`createdAt` 取本机毫秒时间戳，`id` 由 `uid()` 生成，`status` 恒为 `pending`，`reply` 恒为 `''`，`repliedAt` 恒为 `null`。

## 成功

**写入**：`db.feedbacks` 追加一条并 `save()` 落本地存储；页面提示（绿色）**"反馈已提交，食堂管理员会尽快受理"**；卡片进入"全部反馈"并倒序置顶，状态标签 `待处理`，下方显示"⏳ 等待食堂管理员受理…"。

**返回字段**（即写入的记录）：`id`、`windowId`、`author`、`type`、`text`、`status`、`reply`、`repliedAt`、`createdAt`。

**示例**（`id` 与 `createdAt` 为示意值，实际由系统生成，以实测输出为准）：

```json
{"id":"f5","windowId":"w2","author":"吴同学","type":"价格收费","text":"麻辣香锅最近分量偏少，价格却涨了两元","status":"pending","reply":"","repliedAt":null,"createdAt":1730000000000}
```

## 失败

失败**不写库**、不弹错误页，只给红色提示条并保留表单输入与焦点。下表的错误码是**本约定文件用于文档标识的状态名**；实现未返回结构化错误体，失败以"提示文字 + 记录数不变"体现，无 HTTP 状态。

| 约定错误码 | 触发条件 | 给使用者看的提示文字 | 数据状态 |
| --- | --- | --- | --- |
| `E_TEXT_TOO_SHORT` | `text` 裁剪后少于 5 字 | **至少写 5 个字，方便管理员定位问题** | 不写库，焦点回到 `#fbText` |
| `E_REPLY_EMPTY` | 关联动作"受理回复"的回复框为空 | **请先填写回复内容** | `status` 保持 `pending`，不写 `adminLogs` |
| `E_REJECT_REASON_EMPTY` | 关联动作"驳回"的理由为空 | **请填写驳回理由** | `status` 保持 `pending`，弹窗不关闭 |
| `E_NOT_ADMIN` | 关联动作"进入管理后台"，当前 `role !== 'admin'` | **仅食堂管理员身份可进入管理后台** | 视图不变，不渲染后台内容 |

## 约束与已知限制

- 所有用户输入在渲染前经 `esc()` 转义；反馈文本不解析 HTML。
- 无幂等键：连续点两次提交会写入两条不同 `id` 的记录，本期不修，演示时只点一次。
- 无真实鉴权：`role` 只决定界面入口与提示，不能当作权限校验。
- 数据只在本机浏览器，清理站点数据即丢失；不跨设备、不跨账号。
