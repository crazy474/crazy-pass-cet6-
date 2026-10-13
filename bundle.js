const fs = require("fs");
const path = require("path");

const workDir = __dirname;
const appJsPath = path.join(workDir, "app.js");
const indexHtmlPath = path.join(workDir, "index.html");
const styleCssPath = path.join(workDir, "style.css");
const wordsDataPath = path.join(workDir, "words_data.js");
const bundleHtmlPath = path.join(workDir, "疯狂过六级.html");

console.log("正在打包生成独立纯离线单文件: 疯狂过六级.html ...");

const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
const styleCss = fs.readFileSync(styleCssPath, "utf-8");
const wordsData = fs.readFileSync(wordsDataPath, "utf-8");
const appJs = fs.readFileSync(appJsPath, "utf-8");

let bundleHtml = indexHtml;
bundleHtml = bundleHtml.replace(/<link\s+rel=["']stylesheet["']\s+href=["']style\.css[^"']*["']\s*>/i, () => "<style>\n" + styleCss + "\n</style>");
bundleHtml = bundleHtml.replace(/<script\s+src=["']words_data\.js[^"']*["']><\/script>/i, () => "<script>\n" + wordsData + "\n</script>");
bundleHtml = bundleHtml.replace(/<script\s+src=["']app\.js[^"']*["']><\/script>/i, () => "<script>\n" + appJs + "\n</script>");

fs.writeFileSync(bundleHtmlPath, bundleHtml, "utf-8");
console.log("打包成功！输出路径:", bundleHtmlPath, "文件大小:", (fs.statSync(bundleHtmlPath).size / 1024 / 1024).toFixed(2), "MB");
