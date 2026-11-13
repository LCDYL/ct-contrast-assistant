# CT 对比剂智能选择系统

课程项目的网页演示与算法实现。网页通过六步表单采集输入，展示对比剂品规、注射参数、五项风险分层和决策说明。示例及测试均使用合成数据。

发布目录为 `docs/`，计算在访问者的浏览器中完成。Python 版本保存在 `python/`，用于本地运行和算法对照。GitHub Pages 托管 HTML、CSS 和 JavaScript，可以通过分享网址直接打开网页。[GitHub Pages 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 上传并发布

1. 在 GitHub 新建仓库，选择 **Public**，主分支使用 `main`。
2. 在仓库页面选择 **uploading an existing file**，或 **Add file → Upload files**。打开本地的 `4-github部署` 文件夹，将里面的文件和子文件夹上传到仓库根目录。上传后应直接看到 `docs`、`python`、`tests` 和本说明。
3. 核对根目录的 `.gitignore` 和 `docs/.nojekyll` 也已上传。文件管理器可开启“显示隐藏的项目”。将上传内容提交到 `main`。
4. 打开仓库 **Settings → Pages**。在 **Build and deployment** 中，将 **Source** 设为 **Deploy from a branch**，选择 `main` 和 `/docs`，点击 **Save**。
5. 等待部署完成，在 Pages 设置页打开实际发布地址。可从仓库的 **Actions** 页面查看 Pages 部署结果。
6. 用另一台设备打开该地址，检查首页、内置示例、修改输入后重算和导出报告，然后分享 Pages 设置页给出的网址。

项目网址的形式如下，其中尖括号内文字是占位说明，需替换成实际用户名和仓库名。

```text
https://<用户名>.github.io/<仓库名>/
```

更新网页时，将改后的文件提交到 `main` 的 `docs/`，GitHub Pages 会发布该目录的新内容。[发布来源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 本地预览

在 PyCharm 中打开仓库根目录，选择 Python 3.12，运行 `1_本地预览.py`。程序启动静态预览服务并自动打开浏览器。结束时在运行面板停止程序。

也可以在仓库根目录运行以下命令。

```powershell
python "1_本地预览.py"
```

预览程序使用 Python 标准库。页面计算由浏览器执行，填写表单和生成方案可在本机离线完成。已有 Python 网页版本可从仓库根目录另行启动。

```powershell
python "python/1_启动网页.py" --open-browser
```

## 算法对照

安装 Python 3.12 和 Node.js 后，在 PyCharm 中运行 `2_算法测试.py`，或从仓库根目录运行以下命令。

```powershell
python "2_算法测试.py"
```

测试向 Python 引擎和浏览器算法传入相同的合成表单，逐字段比较数值、风险结果和解释文字。用例共 1,243 组，包括 71 组定向与边界输入、660 组交叉组合及 512 组固定种子输入。每组同时比较完整评估和实时预览，数值的绝对与相对容差均为 `1e-12`，文本、字段及列表顺序精确比较。当前测试结果为 2,486/2,486 项通过。

Node.js 可加入系统 `PATH`。通过环境变量 `NODE_EXE` 也可指定已安装的 Node.js 可执行文件。

## 浏览器验收

浏览器测试使用 Playwright 1.62.1。在仓库根目录安装测试依赖和 Chromium，然后运行验收。

```powershell
npm install
npx playwright install chromium
npm run test:browser
```

已有 Microsoft Edge 时，也可以选择该浏览器。安装测试依赖后，在 PowerShell 中运行以下命令。

```powershell
$env:CT_BROWSER_CHANNEL = "msedge"
npm run test:browser
```

运行将输出各项验收结果。测试检查表单校验、实时指标、示例与手填方案、返回修改、重置、打印及移动视口，也会控制预览和计算的返回顺序来检查重复提交、过期结果及失败恢复。当前在 Microsoft Edge 中完成了 10 类验收，全部通过。测试用 `/ct-contrast-test/` 模拟 GitHub 项目网址的子路径，并核对资源加载和计算过程的网络请求。

算法测试还可通过 `npm run test:algorithm` 启动。需要保存截图、打印 PDF 和结果记录时，可以向浏览器测试传入输出目录。

```powershell
npm run test:browser -- ./test-results
```

## 页面交互

实时指标按当前输入更新，相同预览字段使用已有结果，较早发起的预览按当前输入判断是否显示。方案生成期间提交入口暂时禁用。重置后可重新填写，旧计算结果按版本判断是否显示。

计算异常时，页面显示“暂时无法计算，请核对输入后重试。”，保留表单并恢复提交按钮。核对输入后可以再次生成方案。结果页的“导出报告”使用浏览器打印功能，可在打印窗口保存 PDF。

## 文件结构

| 路径 | 内容 |
| --- | --- |
| `docs/` | GitHub Pages 网页、样式、交互与浏览器算法 |
| `python/` | Python 计算引擎及原本地网页版本 |
| `tests/` | 算法对照、合成用例和浏览器验收 |
| `1_本地预览.py` | 本地静态预览入口 |
| `2_算法测试.py` | 算法对照入口 |
| `package.json` | 浏览器测试依赖与测试命令 |
