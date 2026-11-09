# 当前自动化入口

以README中的Client链接和`.github/workflows/ai-enrich.yml`为当前可用流程：每6小时增量执行、Git检查点续跑、自动生成简介、核验npm和Git精确来源、统一Pages发布。用户已授权将指定env中的订阅Key保存为仓库MINIMAX_API_KEY Secret。无需为每批重新输入Key或做逐条人工批准；发布数据的reviewLevel明确为automated。

自动任务每批上限800次模型尝试、4,000,000加权token预算，手动与定时运行共享滚动6小时累计最多800次尝试，已完成和在途请求均计入；限流或不确定请求会暂停并保留状态。预算只约束本管线，不声称已读取账户剩余配额。失败/不确定项不会被无限重试；有有效旧结果时复用，无AI时回退原介绍。

硬中断恢复：付费调用前把整批租约推送到Git。若runner在保存结果前消失，相关未决任务隔离为uncertain，不自动重复计费；需核查Actions日志与状态后显式重试。正常完成和always保存阶段会清理租约并保存逐条状态。

Client原生源自动核验npm归档完整性或Git提交、包身份、bundle补丁与声明的兼容范围；由Client按自身版本选择兼容条目，不固定某台机器的版本。输出使用随仓库提供的官方format1解析器验证。无可核验安装信息的仓库仍保留在全量catalog.json中。

以下是前期本地试验与审阅命令，保留用于排错，不再是自动任务的必需步骤。

# Registry LLM 管线操作

代码已实现本地增量处理、SQLite逐次保存、额度门禁、审阅和独立导出，以及公开Registry组装和客户端读取。实际模型运行默认隐藏输入订阅Key，用户已授权时也可使用指定env文件；GitHub Actions没有模型凭据，也不会调用模型。

## 已准备的修订任务

本工作区的 `.local/ai-catalog/state.sqlite3` 已离线准备62条修订任务，来源为原100条试验的固定SHA正文，首轮已发送62次请求，结果为20条候选、42条引用/结构失败；42条已准备v5修订，尚未追加调用。详见 [复测报告](llm-retest-62-report.md)。原始证据在工作区同级 `ai-review-baseline-100`；旧脚本仍保留，只用于追溯，不把旧格式结果混入新管线。

```sh
cd dsh-plugin-marketplace
python3 tools/ai-catalog/cli.py status
```

其他机器从当前Registry重新计划，默认最多抓取100个变化项目。GitHub正文读取可使用已有的 `GH_TOKEN` 或 `REGISTRY_GITHUB_TOKEN` 环境变量，MiniMax Key仅在用户明确授权的`--env-file`中读取，或通过隐藏输入提供；不会扫描其他配置。

```sh
python3 tools/ai-catalog/cli.py import-approved
python3 tools/ai-catalog/cli.py plan --dry-run --limit 30000
python3 tools/ai-catalog/cli.py plan --limit 100
```

`--dry-run`不抓取正文、不调用模型；它按现有本地任务状态列候选，首次运行将列全量。在线plan固定仓库SHA抓正文，再按实际模型输入指纹去重；星数改变不导致新请求，代码提交但摘要输入不变只更新来源绑定。没有可引用资料的任务标记source_failed，不浪费模型调用。失败记录见本地 `plan-report.json`。不可用资料保存为source_failed，避免一条永久坏源卡住后续项目；需要重试时用 `plan --retry-sources`。GitHub鉴权和限流错误会停止计划，保留待重试状态。

## 额度与启动

当前用户的TokenPlanStarter年度会员后台明确显示周额度无限制。该账户使用 `--weekly-unlimited`，不需要周已用比例、周重置时间或week-ratio。5小时预算、快照时效和速率限制仍然生效。例如：

```sh
python3 tools/ai-catalog/cli.py quota --used5 4 --weekly-unlimited --reset5 ACTUAL_RESET_TIME_WITH_TIMEZONE
python3 tools/ai-catalog/cli.py run --limit 62
```

支持同等JSON形式：`{"used5":4,"weekly_unlimited":true,"reset5":"实际ISO时间","observed_at":"实际观测时间"}`。必须显式声明无限制，不能把周已用0%当成无限制；切回有限周额度后重新校准。以下双窗口示例适用于有周限额的套餐。

5小时与周额度必须同时有近期观测。运行门禁最多使用80%额度，包含已发出的预留和结果不确定的请求。百分比是“已用”，不是“剩余”；日期必须含时区，避免把北京时间当UTC。下面数值只是格式示例，请换成后台实际数字及未来重置时间：

```sh
python3 tools/ai-catalog/cli.py quota \
  --used5 4 --used-week 1 \
  --reset5 2026-11-10T03:00:00+08:00 \
  --reset-week 2026-11-15T00:00:00+08:00 \
  --week-ratio 0.25
python3 tools/ai-catalog/cli.py run --limit 62
```

`week-ratio`是同一模型工作负载的“周额度百分点增量 / 5小时额度百分点增量”，示例0.25不是已测值。也可以在同一窗口的处理前后各记录一次后台观测，程序用两次增量校准。周比例未知时正式runner拒绝启动，防止把5小时的4%直接当成周额度。此前旧试验或62条旧修订入口可以提供这一校准观测，不会自动读取其他账户凭据。

快照最多新鲜5分钟。账户其他工具的使用会减少可用额度。没有可自动读取的quota源时，每批运行后重新记录后台用量再继续；估算门禁不保证绝不消耗已购积分包。不会主动购买积分、充值、升级或切换按量Key。

如官方CLI `mmx quota`在当前安装中确实输出已核验的JSON，可用 `--mmx-quota`。适配器只接受已知标准字段，不猜测CLI文本和账户映射；未知输出拒绝运行，回到人工录入。仓库未安装或登录mmx，未验证用户当前CLI的输出形式，不宣称已经实现对所有版本的自动读取。

还可用用户维护的JSON快照文件：

```json
{
  "observed_at": "2026-11-09T23:00:00+08:00",
  "used5": 4,
  "used_week": 1,
  "reset5": "2026-11-10T03:00:00+08:00",
  "reset_week": "2026-11-15T00:00:00+08:00",
  "week_ratio": 0.25
}
```

```sh
python3 tools/ai-catalog/cli.py run --limit 100 --quota-file /absolute/path/quota.json
```

单批上限100次尝试。首次并发3、30RPM、180k估算TPM，可配置到并发6、60RPM、300k估算TPM；这不是服务端承诺值。明确429退避至少60秒并降低速率，每任务最多两次限流重试。超时及未知服务错误标uncertain，停止新请求；已在途请求返回后仍逐条落盘。

在可靠自动额度源可用后，`--batches 20 --wait-windows`可以保持进程和Key在内存中分批运行、等待已观测窗口恢复。新窗口开始前重新读取额度。人工文件未及时更新会停止，不猜刷新。Mac退出或休眠后运行 `resume`，重新隐藏输入Key；已完成和候选不会重复请求。

## 审阅与修订

```sh
python3 tools/ai-catalog/cli.py review-list > /tmp/dsh-review.json
python3 tools/ai-catalog/cli.py sample /tmp/dsh-sample.json
python3 tools/ai-catalog/cli.py approve gh:123 --reason '已对照固定SHA原文核对功能、条件和分类'
python3 tools/ai-catalog/cli.py approve-batch /tmp/dsh-sample.json --reason '抽样与风险项逐条核对通过'
python3 tools/ai-catalog/cli.py export
```

首次62条应逐条人工核查。以后sample随机抽至少10%，同时覆盖类别、长尾与风险项。approve-batch要求该抽样文件内所有必审条目已逐条批准，并核对整批inputHash未变化；有风险标记的不能只获批次批准。批次批准与逐条审核在公开数据中明确区分。证据短引必须可在实际输入段落原样定位，但不把可定位等同于内容推理正确。

```sh
python3 tools/ai-catalog/cli.py repair gh:123 --reason '摘要超长；重新生成一次'
python3 tools/ai-catalog/cli.py retry-uncertain gh:123 --reason '已核查无法恢复响应，接受可能重复计费'
python3 tools/ai-catalog/cli.py override gh:123 /absolute/path/corrected-output.json --reason '人工更正启用条件'
```

每个输入最多一次内容修订；不截短摘要制造通过。`retry-uncertain`必须显式调用，不因任务租约或重启自动重发。人工override绑定语义指纹；新输入不会悄悄取代旧决定。

审核导出使用临时目录构建完整新代，再替换 `ai-data/v1`；失败保留旧代。SQLite每条事务保存，批次完成做一致性备份到 `.local/ai-catalog/backups/latest.sqlite3`。灾后可用 `import-approved`恢复Git里已审核结果，未导出的候选和尝试需SQLite备份；不能只靠Git声称能恢复全部历史。

## 本地构建与Actions

```sh
corepack pnpm ai:test
corepack pnpm --filter dsh-plugin-registry typecheck
corepack pnpm --filter dsh-plugin-registry test
corepack pnpm --filter dsh-plugin-registry generate:schemas
corepack pnpm --filter dsh-plugin-registry publish:registry
```

公开产物位于 `publish/registry/v1`。28,996个ID完整保留；没有已批准且来源匹配的AI结果时回退原介绍和规则分类。AI更新触发公开revision变化；每条详情附内容hash，客户端拒收混合版本的详情，缓存按revision隔离。

`registry-sync.yml`只写事实，`registry-publish.yml`统一合并并发布Pages。它从最新main读取AI成果和事实，用共享发布锁避免互相覆盖；构建发现main已前进则拒绝部署旧快照。CI离线验证AI证据、schema和完整目录，模型任务不放入外部PR。托管模型工作流仍保持未启用，后续若明确授权保存凭据再扩展。

## 原生源适配

当前原生适配基于上游format1，支持独立检查过的精确npm版本，必须声明有效且兼容的 `engines.dsh`。上游依据：[格式说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.md)、[读取器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/plugin-market-index/README.md)。

```sh
python3 tools/ai-catalog/verify_native.py dsh-plugin-registry/registry/v1 .local/ai-catalog/native-proofs --limit 100
corepack pnpm --filter dsh-plugin-registry export:native ../../publish/registry/v1 ../../.local/ai-catalog/native-proofs ACTUAL_DSH_VERSION ../../publish/native/format1
```

将ACTUAL_DSH_VERSION替换为实际目标客户端版本。检查器只读取包元数据和tar归档，不解包到文件系统、不运行脚本；校验SHA512完整性、源仓库身份、精确name/version和bundle补丁文件。生命周期脚本、过期核验证据、重复包身份、不兼容范围或未核验的Git安装源都排除，并输出report.json。暂不解析npm字符串作者声明，遇到该形式先排除；后续接入维护中的npm规范化器再扩大覆盖。

原生展示介绍来自源包manifest，AI摘要和标签作为市场搜索关键词/分类，避免把生成内容冒充包作者元数据。原生输出是metadata-verified，不是install-tested。尚未在用户实际客户端导入测试；默认Pages发布不包含原生目录，确认实际目标版本和核验结果后再纳入发布。

## 本轮实际修改范围

新增Python生产模块、测试、独立 `ai-data/v1`、TS AI组装器与受限原生导出器、统一发布工作流；修改Registry schema/同步manifest、客户端AI字段/搜索/详情缓存、package命令及锁文件。现有事实快照未修改，星数排序保持现有逻辑。完整设计与逐文件清单见 [设计](llm-pipeline-design.md)。

## 本地验证结果

本轮离线检查：Python37项、Registry61项、Marketplace61项，共159项测试通过；两包TypeScript检查和构建通过。工作流YAML可解析，新增依赖与锁文件的importer一致，JSON schemas已重新生成。

完整28,996条发布视图成功组装两次，revision一致；当前批准AI数为0，28,996条均回退事实介绍。原事实快照无变更。正式SQLite现保留62次真实模型attempt，当前20条candidate、42条v5 prepared，尚无approved；未安装插件、未提交推送或部署。

待实际验证：新额度观测与终端隐藏输入订阅Key后的42条v5修订回归（当前用户周无限制，无需周比例校准）、用户实际DSH客户端版本与原生源导入。GitHub托管执行尚未运行，`mmx quota`用户本机输出尚未适配验证。上述结果不能当成模型内容质量或安装成功率。

正式v5模型只选择编号原文片段与事实转述，由程序附上原文quote；公开JSON仍保留paragraph_id、quote、fact。模型原始输出单独保存，不能把解析所得quote说成模型逐字生成。

## 用户授权的 env 文件鉴权

用户已明确授权读取 `~/.config/keys/minimax/minimax.env` 中的 `MINIMAX_API_KEY`。可非交互续跑：

```sh
python3 tools/ai-catalog/cli.py resume --limit 26 --env-file ~/.config/keys/minimax/minimax.env
```

解析器只读取该命名赋值，支持常见单引号、双引号、export及注释；不source文件、不执行shell替换，不把Key写入进程环境、日志、数据库或请求预览，不复制保存凭据。仍拒绝按量Key。此授权替代了之前每次必须隐藏输入的操作方式，保留其他预算和重试约束。39项Python离线测试通过。

滚动窗口账本保存在`ai-state/window-usage.json`，从此前last-run记录迁移已有调用；同一窗口内可手动补跑剩余额度，不再整批冷却5小时。输出会报告requestedAttemptLimit、allowedAttemptLimit与windowAttempts。
