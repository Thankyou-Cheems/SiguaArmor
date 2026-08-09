# 内部审核访问部署 SOP

本 SOP 只适用于未公开内容的临时审核域名。它不会解除
`accessPolicy.publishStatus=blocked`，也不允许部署原始研究资产或 `/__research/`。
公开生产站仍遵守 `DEPLOY-*` 的静态交付边界。

## 1. 已确认的 EdgeOne 能力

2026-07-15 对 `ruikang.wang` 的真实 EdgeOne 免费版控制台做了只读检查：

- 套餐为免费版；
- 规则引擎可以创建空白规则；
- 操作列表中的 `Token 鉴权` 可见、启用且可以选择；
- 选择后显示鉴权方式 `A`、鉴权密钥、有效时长和“生成/校验鉴权 URL”等配置；
- 检查产生的草稿已取消并确认退出，没有保存或发布任何规则。

因此审核路径不需要 EdgeOne 边缘函数。EdgeOne 负责在缓存查询前校验源站签发的短期
URL，并缓存通过鉴权的不可变资源；登录、HTML、水印、Service Worker 和签名接口仍然
回 TencentCloudPublic 源站。

## 2. 当前阻塞项

现有 Vinext 构建仍然输出 Worker/RSC 服务端包，而不是可挂载到网关的独立静态
`index.html`。在生成符合下述 release manifest 的静态审核产物以前，不得部署审核站。

## 3. 生成审核凭证和运行时密钥

以下命令只向标准输出显示一次秘密，不会写文件：

```powershell
npm run review:secrets
npm run review:credential -- --id official-reviewer-a --owner "官方审核 / Reviewer A"
```

将 `credential` 对象并入 `REVIEW_ACCESS_CONFIG.credentials`。只把 `reviewerKey` 发送给对应
审核者；不要发送或提交 `keyHash` 以外的运行时配置。每个审核者使用独立凭证，以便水印
身份可归属、凭证可单独撤销。

`REVIEW_EDGE_TOKEN_SECRET` 是 40 个字符、至少 256 位生成熵的 EdgeOne Type A 密钥。
其字符可能包含 `#` 等符号，写入 Compose env 文件时必须使用单引号，避免注释或插值：

```dotenv
REVIEW_ACCESS_CONFIG='{"version":1,"credentials":[{"id":"official-reviewer-a","owner":"官方审核 / Reviewer A","keyHash":"<sha256>"}]}'
REVIEW_SESSION_SECRET='<base64url secret>'
REVIEW_EDGE_TOKEN_SECRET='<40-character secret>'
REVIEW_EDGE_TOKEN_PARAM=token
REVIEW_EDGE_TOKEN_TTL_SECONDS=60
REVIEW_SESSION_TTL_SECONDS=14400
REVIEW_PUBLIC_ORIGIN=https://review.ruikang.wang
REVIEW_STATIC_ROOT=/srv/review
REVIEW_RELEASE_MANIFEST=/srv/review/release-manifest.json
REVIEW_LISTEN_HOST=0.0.0.0
REVIEW_PORT=8080
```

该文件必须被 Git 忽略并限制为运行账户可读。不要启用
`REVIEW_INSECURE_LOOPBACK=1`；它只用于本机测试。

## 4. 静态审核产物

所有可缓存资源必须位于单个发布专属前缀下，并以完整文件 SHA-256 的至少前 16 位参与
URL。HTML 保持在独立文档路由，不进入该前缀。manifest 示例：

```json
{
  "version": 1,
  "assetPrefix": "/__review/assets/release-20260715/",
  "assets": [
    {
      "urlPath": "/__review/assets/release-20260715/app-0123456789abcdef.js",
      "filePath": "assets/app.js",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "documents": [{ "route": "/", "filePath": "index.html" }]
}
```

网关启动时会执行以下检查，任一失败即不监听端口：

- manifest、凭证和秘密格式正确；
- URL 和文件路径规范化且唯一；
- 文件 realpath 没有穿越或符号链接逃逸；
- 每个资源的实际 SHA-256 与 manifest 相同；
- 根文档存在；
- 静态目录在容器中只读挂载。

## 5. 容器与 Caddy 边界

只把仓库中的 `review-gateway/` 目录作为 Docker build context，避免把工作区、忽略文件或
审核秘密发送给构建器。网关容器只能在 Compose 内部网络暴露 `8080`，不得配置宿主机
`ports:`：

```yaml
services:
  review-gateway:
    build:
      context: <sigua-armor-checkout>/review-gateway
      dockerfile: Dockerfile
    env_file:
      - <ignored-review-env-file>
    expose:
      - "8080"
    volumes:
      - <approved-static-review-artifact>:/srv/review:ro
    restart: unless-stopped
```

专用审核域名的 Caddy 路由只允许反向代理：

```caddyfile
review.ruikang.wang {
    reverse_proxy review-gateway:8080
}
```

不得在该域名、其他域名或 IP 路由中增加指向同一目录的 `file_server`。直接访问源站 IP
并伪造 Host 时仍会进入网关；缓存未命中的资源还必须同时通过签名会话和 Type A URL
验证。

## 6. EdgeOne 规则

先建立一个专用审核子域名，再创建两条规则。腾讯云控制台中位置为：
`站点加速 -> 规则引擎 -> 创建规则 -> 新增空白规则`。

### 6.1 审核域名默认规则

条件：Host 等于专用审核域名。

操作：

- 节点缓存 TTL：不缓存；
- 浏览器缓存 TTL：不缓存；
- 不启用离线缓存；
- 保持 HTTPS 和源站回源头配置。

该规则覆盖登录页、HTML、`/__review/unlock`、`/__review/activate`、
`/__review/sw.js`、`/__review/sign`、错误页和任何未来 API。

### 6.2 不可变资源规则

条件：Host 等于专用审核域名，且 URL Path 以前述 release-specific `assetPrefix` 开头。
把此规则放在比默认规则更高的实际优先级；当前 EdgeOne 规则引擎中下方规则优先级更高。

操作：

- Token 鉴权：方式 A；
- 主鉴权密钥：与 `REVIEW_EDGE_TOKEN_SECRET` 完全相同；
- 鉴权参数名：与 `REVIEW_EDGE_TOKEN_PARAM` 完全相同，默认 `token`；
- 有效时长：与 `REVIEW_EDGE_TOKEN_TTL_SECONDS` 完全相同，默认 60 秒；
- 节点缓存 TTL：只让成功的 `200`/`206` 使用较长 TTL，例如 30 天；
- 状态码缓存 TTL：`3xx`、`4xx`、`5xx` 均不缓存，防止一次无会话回源响应污染资源缓存；
- 浏览器缓存 TTL：不缓存；
- 只匹配内容寻址资源前缀，绝不匹配 HTML 或控制接口。

EdgeOne 在 Token 鉴权通过后会从缓存键忽略鉴权参数，因此不同审核者可以命中同一资源
缓存。每次更换发布前缀或曾经存在未鉴权缓存时，先清除旧审核域名缓存，再分享链接。

如免费版安全规则配额允许，再对精确路径 `/__review/unlock` 添加客户端级频率限制；源站
仍保留独立的失败次数和全局预算，不能把 EdgeOne 限频当作唯一保护。

## 7. 上线前验证

先运行本地契约门：

```powershell
npm run test:contracts:review
node --check review-gateway/server.mjs
node --check review-gateway/review-service-worker.js
npm run lint
```

真实审核域名必须逐项验证：

1. 未登录访问 HTML 只得到解锁页，响应为 `private, no-store`。
2. 未签名、篡改和过期资源 URL 在 EdgeOne 返回 `403`。
3. 登录后 HTML 显示与该密钥绑定的全屏水印，且 EdgeOne 不命中 HTML/签名接口缓存。
4. 同一已授权资源第二次访问显示 EdgeOne cache hit，而源站没有第二次传输资源正文。
5. 浏览器 Cache Storage 中没有受保护资源；浏览器 TTL 为不缓存。
6. 源站直连在缺少会话或缺少有效 Type A Token 时不能读取资源。
7. Range 请求返回正确单段 `206`；多段或越界请求返回 `416`。
8. 网关容器端口未发布到宿主机，Caddy 没有任何绕过网关的静态文件路由。
9. 构建产物不含旧 Squad Armor 二进制资产、`authoring-vault/` 或 `/__research/`。

任何一项失败都保持审核域名关闭，不允许退化为“先缓存明文、以后再补鉴权”。
