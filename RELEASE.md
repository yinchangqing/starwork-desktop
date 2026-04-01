## GitHub Releases 自动更新（公开发布 + 签名）

### 1) 需要的 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions → New repository secret 添加：

- CSC_LINK：Windows 代码签名证书（PFX）的 base64 字符串
- CSC_KEY_PASSWORD：PFX 密码

说明：
- electron-builder 读取 `CSC_LINK`/`CSC_KEY_PASSWORD` 进行签名。
- `GH_TOKEN` 使用 GitHub Actions 内置的 `GITHUB_TOKEN`，工作流已配置。

### 2) 生成 CSC_LINK（PFX → base64）

在本机 PowerShell 执行：

```powershell
$pfxPath = "C:\path\to\cert.pfx"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($pfxPath)) | Set-Clipboard
```

把剪贴板里的内容粘贴到 GitHub Secret：CSC_LINK。

### 3) 发版流程

1. 修改 [package.json](file:///c:/Users/40925/OneDrive/%E6%A1%8C%E9%9D%A2/%E6%97%A5%E7%A8%8B/package.json) 的 `version`。
2. 打 tag 并 push（示例：v0.1.1）：
   - `git tag v0.1.1`
   - `git push origin v0.1.1`
3. GitHub Actions 工作流会自动运行并把以下产物上传到对应 Release：
   - Windows NSIS 安装包（.exe）
   - `latest.yml`（更新元数据）
   - 其他 electron-builder 生成的更新所需文件

### 4) 客户端侧（自动更新触发）

已接入：
- 菜单：帮助 → 检查更新…
- 桌面壳：发现新版本会询问下载，下载完成会询问重启安装

