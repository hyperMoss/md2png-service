# md2png-service

[English](README.md) | [简体中文](README.zh-CN.md)

通过 HTTP API 或 MCP 工具将 Markdown 渲染为 PNG。支持 GFM 表格、任务列表、七种笔记卡片主题和自定义页脚。图片宽度固定为 800 像素，高度随内容变化，最高为 50,000 像素。

Bun/Hono 网关负责鉴权和图片临时存储，内部 Node/Playwright 渲染器负责生成图片。笔记卡片渲染部分改编自 [zhaoolee/notes](https://github.com/zhaoolee/notes)。

## 使用 Docker 启动

安装带 Compose 插件的 Docker，并启动 Docker 引擎。宿主机无需安装 Node.js、Bun 或浏览器。首次构建会下载 Playwright 镜像和 npm 依赖。

1. 克隆项目并创建本地配置。

	```sh
	git clone https://github.com/hyperMoss/md2png-service.git
	cd md2png-service
	cp .env.example .env
	```

2. 编辑 `.env`，将 `API_KEY` 替换为足够长的随机密钥。可以用 `openssl rand -hex 32` 生成。本机使用时保留 `PUBLIC_BASE_URL=http://localhost:3000`。

3. 构建并在后台启动两个服务。

	```sh
	docker compose up -d --build --wait --wait-timeout 180
	```

4. 检查网关状态。

	```sh
	docker compose ps
	curl -fsS http://localhost:3000/health
	```

	健康检查返回 `{"status":"ok"}`。它只检查网关。继续生成一张图片，才能确认渲染器也能正常工作。

API 地址为 `http://localhost:3000`。本项目没有网页编辑器，访问 `/` 不会显示操作界面。只有网关映射宿主机端口，绑定地址为 `127.0.0.1:3000`。

两个服务均配置了 `restart: unless-stopped`。进程异常退出或 Docker 引擎重启后会自动恢复，手动停止的服务除外。

## 生成并下载图片

下面的命令需要 `curl` 和 `jq`。先读取本地 `.env`，再向 API 发送 Markdown。

```sh
set -a
. ./.env
set +a

curl -fsS "$PUBLIC_BASE_URL/v1/render" \
	-H "Authorization: Bearer $API_KEY" \
	-H 'Content-Type: application/json' \
	-d '{"markdown":"# 你好，Markdown\n\n| 项目 | 状态 |\n| --- | --- |\n| 本地部署 | 完成 |","theme":"bear","footer":{"brand":"我的笔记","via":"md2png"}}' \
	-o /tmp/md2png-result.json

jq . /tmp/md2png-result.json
curl -fsS "$(jq -er '.image_url' /tmp/md2png-result.json)" \
	-H "Authorization: Bearer $API_KEY" \
	-o /tmp/md2png-example.png
```

接口返回 `image_url`、`width`、`height` 和 `size_bytes`。打开 `/tmp/md2png-example.png` 查看图片。图片下载默认需要相同的 Bearer 密钥。要允许浏览器直接预览和下载，在 `.env` 中设置 `PUBLIC_IMAGES=true`，再运行 `docker compose up -d --build --wait` 应用配置。开启后，所有尚未过期的图片链接均无需鉴权，包括此前生成的图片；渲染接口和 MCP 仍需要密钥。设回 `PUBLIC_IMAGES=false` 可恢复图片鉴权。

要发送 Markdown 文件，可以使用项目自带脚本。该脚本还需要宿主机安装 Node.js。

```sh
BASE_URL="$PUBLIC_BASE_URL" THEME=bear sh examples/render.sh examples/demo.md \
	> /tmp/md2png-result.json
curl -fsS "$(jq -er '.image_url' /tmp/md2png-result.json)" \
	-H "Authorization: Bearer $API_KEY" \
	-o /tmp/md2png-file.png
```

将 `examples/demo.md` 替换为自己的文件路径，修改 `THEME` 即可切换主题。

主题、限制、错误码、MCP 调用和图片处理规则见 [API 与配置参考](docs/reference.zh-CN.md)。

宿主机安装 Node.js 24 或更新版本后，可运行 `npm run smoke` 检查已启动的 API、鉴权、PNG 下载和 MCP 工具。脚本读取 `.env`，将示例图片保存到 `/tmp/md2png-smoke.png`，无需先运行 `npm ci`。

## 管理部署

查看日志，或停止、重新启动服务。

```sh
docker compose logs -f --tail=100
docker compose stop
docker compose start
```

修改源码或 `.env` 后，重新构建并应用配置。

```sh
docker compose up -d --build --wait --wait-timeout 180
```

运行 `docker compose down` 会移除容器和网络，保留名为 `images` 的数据卷。图片仍按配置的 TTL 过期，默认保留 24 小时。`docker compose down -v` 还会删除数据卷及其中的图片。

启动或渲染失败时，运行 `docker compose logs --tail=100 gateway worker` 查看日志。渲染接口返回 `502` 表示渲染失败，`/health` 成功并不能证明 Chromium 可以正常生成图片。如果 3000 端口被占用，修改 `docker-compose.yml` 中的宿主机端口，并同步修改 `PUBLIC_BASE_URL`。

需要远程访问时，在网关前配置 HTTPS 反向代理或隧道，将 `PUBLIC_BASE_URL` 改为客户端可以访问的地址，并转发 `Authorization` 请求头。渲染器只允许内部访问。详见[部署边界](docs/reference.zh-CN.md#部署边界)。

## 不使用 Docker 进行开发

安装 Node.js 24 和 Bun，再安装项目依赖和 Playwright Chromium。Linux 下 `--with-deps` 安装系统依赖时可能需要管理员权限。

```sh
npm ci
npx playwright install --with-deps chromium
```

在一个终端启动渲染器。

```sh
npm run worker
```

在另一个终端读取 `.env` 并启动网关。

```sh
set -a
. ./.env
set +a
npm run gateway
```

渲染器默认监听 `127.0.0.1:3001`。安装 Chromium 后可运行检查。

```sh
npm test
npm run typecheck
```

## 许可证与来源

项目使用 Apache-2.0 许可证，[LICENSE](LICENSE) 和 [NOTICE](NOTICE) 保留了上游声明。改编文件及字体限制见[来源与渲染差异](docs/reference.zh-CN.md#来源与渲染差异)。
