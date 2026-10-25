# 校园与实验室 3DGS 漫游网站

此目录可直接作为 GitHub Pages 的仓库根目录，不需要安装依赖或构建。

## 用网页上传（适合首次发布）

1. 登录 GitHub，新建 Public 仓库，例如 campus-3dgs-demo；可勾选 Add a README file 初始化 main 分支。
2. 进入仓库，选择 Add file → Upload files。
3. 把本目录里的全部文件及 assets、vendor 文件夹一起上传到仓库根目录。需要解压后上传文件，不能只上传 ZIP，也不要在根目录外面再套一层文件夹。
4. 确认仓库根目录直接有 index.html、campus.html、lab.html、assets/、vendor/ 和 .nojekyll，然后提交更改。若上传时 README.md 与已有文件同名，可使用本包的版本替换。
5. 打开 Settings → Pages。Source 选择 Deploy from a branch；Branch 选 main；目录选 /(root)；点击 Save。
6. 等待 Pages 部署成功，使用此页显示的 Visit site 链接。GitHub 文档说明发布最多可能需要约10分钟。

## 浏览地址

主页： https://你的GitHub用户名.github.io/campus-3dgs-demo/
校园： https://你的GitHub用户名.github.io/campus-3dgs-demo/campus.html
实验室： https://你的GitHub用户名.github.io/campus-3dgs-demo/lab.html
镜头编辑：同一网站的 studio.html?scene=school&route=courtyard

上面的用户名和仓库名是示例，请以 Settings → Pages 显示的实际地址为准。

## 内容与操作

包含两个真实场景、6段 MP4、两个网页 SPZ 模型、全部镜头轨迹、缩略图及固定版本渲染依赖。视频和模型资源均在本仓库，没有依赖原站点的模型/视频地址。

左侧选路线；点击镜头跳转；“自由探索”支持路线播放、鼠标和 WASD/QE 移动；“编辑镜头”支持记录镜头、导入导出 JSON 和实时录制视频。自由探索和编辑需要 WebGL2 与硬件加速。当前为自由飞行，无碰撞检测。

.nojekyll 必须保留，否则默认 Jekyll 构建可能忽略 vendor/，造成渲染依赖丢失。

本包单个文件均低于 GitHub 网页上传的25MiB限制，文件数量低于单批100文件限制。包内包含 SPZ 压缩模型；完整原始 PLY 不属于网页部署资源。

## 以后更新

修改对应文件后上传并提交到 main 分支，Pages 会重新发布。实验室配置在 assets/routes.json，校园配置在 assets/school/routes.json。路线JSON变更后，已有MP4不会自动重新渲染，需要同时替换对应视频。

GitHub Pages 的网络可达性仍取决于访客所在网络，迁移不会保证所有网络都能访问。

依赖许可证位于 vendor/THREE-LICENSE.txt 和 vendor/SPARK-LICENSE.txt。
