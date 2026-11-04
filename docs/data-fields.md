# 主路径数据字段表（实验 3）

本文件是字段约定的唯一出处，只列主路径用到的对象。整库存于浏览器 `localStorage` 单键 `sztu_canteen_db_v1`，值为一个 JSON 对象；初始数据由 `index.html` 内 `seed()` 生成，之后一律经 `load()/save()` 读写。**无后端、无数据库表、无网络请求。**

## 主路径与涉及对象

主路径：进站 → 筛菜 → 打卡 → 评价 → 提交反馈 → 管理员受理回复 → 学生查看结果 → 消费与营养统计。

| 对象 | 用途 | 主路径中的写入时机 |
| --- | --- | --- |
| `profile` | 当前使用者与身份 | 进站时写昵称、身份 |
| `canteens` | 五个食堂，供筛选与展示 | 只读（初始数据） |
| `windows` | 27 个窗口，反馈挂载点 | 只读；管理员下架时改 `removed` |
| `dishes` | 70 道菜，打卡与评价的对象 | 只读；管理员改价/下架时写入 |
| `reviews` | 菜品评价 | 提交评价时新增一条 |
| `feedbacks` | **意见反馈（核心接口写这里）** | 提交反馈新增、受理/驳回改状态 |
| `meals` | 就餐流水，统计的数据源 | 打卡新增、删除流水减少 |
| `adminLogs` | 后台处理记录 | 受理回复、驳回、改价、下架时新增 |

## 字段类型与规则

**`feedbacks`（核心）**

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` | string | 必填、全库唯一，由 `uid()` 生成 |
| `windowId` | string | 必填，取值必须是存在且未下架的 `windows.id` |
| `author` | string | 必填，取 `profile.nickname`，不接受表单传入 |
| `type` | enum | 必填，四选一：饭菜质量 / 卫生状况 / 价格收费 / 服务态度；缺省"饭菜质量" |
| `text` | string | 必填，首尾空白裁剪后 **5–200 字** |
| `status` | enum | 必填，`pending` / `resolved` / `rejected`；新建恒为 `pending` |
| `reply` | string | 可空，新建恒为 `''`；`resolved`/`rejected` 时必填 |
| `repliedAt` | number \| null | 新建恒为 `null`；受理/驳回时写毫秒时间戳 |
| `createdAt` | number | 必填，毫秒时间戳，由系统生成 |

**`reviews`**：`id`(string, 唯一)、`dishId`(string, 必填, 外键→`dishes.id`)、`author`(string, 必填)、`rating`(int, **1–5**)、`text`(string, 非空)、`likes`(int, ≥0)、`createdAt`(number, 毫秒)、`removed`(bool)。

**`meals`**：`id`(string, 唯一)、`dishId`/`windowId`(string, 外键)、`dishName`(string)、`price`(number, >0)、`kcal`/`protein`/`fat`/`carb`(number, ≥0)、`date`(string, `YYYY-MM-DD`)、`author`(string, 当前恒为"我")。

**`dishes`**：`id`(string, 唯一)、`windowId`(string, 外键)、`name`(string, 非空)、`price`(number, 1–99)、`kcal`/`protein`/`fat`/`carb`(number, ≥0)、`tags`(string[])、`meals`(enum[]: breakfast/lunch/dinner/supper)、`removed`(bool, 软删除)。

**`windows`**：`id`(string, 唯一)、`canteenId`(string, 外键→`canteens.id`)、`name`(string)、`cat`(string)、`meals`(enum[])、`removed`(bool)。
**`canteens`**：`id`/`code`/`name`/`area`(string)、`removed`(bool)。
**`profile`**：`nickname`(string, 进站必填)、`studentId`(string, 选填, **主路径不使用**)、`role`(enum student|admin)。
**`adminLogs`**：`id`/`action`/`target`/`detail`(string)、`createdAt`(number, 毫秒)。

## 关于问答助手 / AIGC 课题的说明

本课题是**学校食堂信息系统**，不是含助手的问答课题，也不是 AIGC 生成链课题，因此**没有**"材料条目、问题、回答、依据、未收录标记"，也**没有**"每一步产物及其输入"这类对象。用户的自由文本按 `reviews.text`、`feedbacks.text`、`feedbacks.reply` 三条字段存放；可追溯的依据是 `windowId`（指向具体窗口）与 `createdAt`（时间），不额外建问答表。

## 已知取舍

- 无唯一索引与事务：`id` 靠 `uid()`（时间戳 + 随机串）保证实际不重复，重复点击提交会新增多条，**本期不修**。
- 无口令、无会话、无账号表：`profile.role` 只用于界面呈现与入口显示，**不是鉴权**。
- `studentId` 属多余字段，见报告第 6 节整改项。
