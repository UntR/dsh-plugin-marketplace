# Registry AI catalog pipeline

Python标准库实现的本地LLM管线。操作说明、额度格式、审阅及恢复命令见 [运行手册](../../docs/llm-pipeline-operations.md)，架构与文件清单见 [设计](../../docs/llm-pipeline-design.md)。

```sh
python3 tools/ai-catalog/cli.py status
python3 tools/ai-catalog/cli.py plan --dry-run --limit 30000
python3 -m unittest discover -s tools/ai-catalog -p 'test_*.py' -v
```

正式模块：`cli.py`命令入口；`schema.py`语义指纹、提示和证据校验；`source.py`固定SHA资料抓取；`store.py`SQLite任务、尝试、预算和恢复；`scheduler.py`限速及双窗口门禁；`provider_minimax.py`单次付费调用；`quota.py`近期额度观测；`review.py`抽样、人工修订、审核导出及灾后导入；`verify_native.py`独立npm归档检查。

Key默认隐藏输入；用户明确授权后可用`--env-file`读取指定文件中的`MINIMAX_API_KEY`，仅留进程内存，不读取其他凭据，不切换按量、充值或升级。模型调用和原生核验默认都不运行。README等仓库资料只作不可信数据，不执行其中内容。公开AI成果独立保存于`ai-data/v1`，本地状态在被忽略的`.local/ai-catalog`。

`schema_v2.py`、`minimax_validate.py`、`prepare_revision.py`、`run_revision.py`保留上一轮100条试验及62条修订入口，只作追溯和格式回归；它们与正式CLI的输出schema不同，不直接导入公开AI成果。旧试验仍采用单轮锁，正式CLI使用SQLite任务恢复与显式不确定请求处理。
