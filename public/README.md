# Public Assets

此文件夹用于存放静态资源（如二维码图片）。

由于图片是二进制文件，AI 无法直接生成。
项目配置了 `postinstall` 脚本，当您运行 `npm install` 时，
`scripts/download-assets.js` 会自动下载 `wechat-pay.jpg` 和 `alipay.jpg` 到此目录。
