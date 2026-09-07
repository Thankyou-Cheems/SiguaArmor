# 工作目录与发布维护

日常使用当前 `main`。运行 `npm run workspace:status` 查看分支、工作树和本地修改。独立编辑使用短期 `codex/<task>` 分支，并行工作树放在忽略的 `.local/worktrees/`。任务状态写入维护记录或 Issue，分支存在不代表工作未完成。

移除工作树前，核对提交保留、dirty/untracked 文件、ignored 保管内容与活动进程。已接受源码合入主线，重要产品版本用 annotated tag 标记；实际发布以部署核对为准。

当前学校维护入口是[功能说明](narva-school.md)和[性能架构](performance-architecture.md)。研究候选、失败历史、制作工具和私有分支恢复信息统一保存在私有 Research。不要将私有历史合并或推送到公开仓库。

只向 origin 推送明确列出的产品 refs。`.gitignore` 只能排除未跟踪文件，不能清除已公开的提交、tag、Release 或他人副本。
