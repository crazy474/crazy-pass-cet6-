@echo off
chcp 65001 >nul
title 疯狂过六级 - 一键打包与推送至 GitHub
cd /d "%~dp0"

echo =======================================================
echo          🔥 疯狂过六级 · 一键打包与 GitHub 部署工具
echo =======================================================
echo.

echo [1/4] 正在检测 Node.js 环境并自动重新打包离线单文件...
where node >nul 2>&1
if %errorlevel% equ 0 (
    node bundle.js
    echo [成功] 离线单文件已打包至: 疯狂过六级.html
) else (
    echo [跳过] 未检测到 Node.js，跳过本地单文件打包。
)
echo.

echo [2/4] 检查本地 Git 状态...
git status
echo.

git remote get-url origin >nul 2>&1
if %errorlevel% equ 0 (
    echo [3/4] 检测到已配置远程仓库:
    git remote -v
    echo.
) else (
    echo [3/4] 尚未关联 GitHub 远程仓库。
    echo 请先在 GitHub (https://github.com/new) 创建一个空仓库，
    echo 然后将仓库链接粘贴在下方 (例如: https://github.com/your-name/crazy-pass-cet6.git):
    echo.
    set /p REPO_URL="请输入你的 GitHub 仓库 URL: "
    if "%REPO_URL%"=="" (
        echo 错误: 仓库链接不能为空！
        pause
        exit /b
    )
    git remote add origin %REPO_URL%
    echo 成功关联远程仓库: %REPO_URL%
    echo.
)

echo [4/4] 正在推送至 GitHub (main 分支)...
git add index.html style.css app.js words_data.js bundle.js README.md .gitignore 手机扫码访问_疯狂过六级.png 疯狂过六级.html 一键上传GitHub.bat
git commit -m "update: 疯狂过六级全站资源热更新" >nul 2>&1
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo   🎉 恭喜！《疯狂过六级》项目已成功推送到 GitHub！
    echo   🌐 线上体验地址: https://crazy474.github.io/crazy-pass-cet6-/
    echo =======================================================
) else (
    echo.
    echo 提示: 若推送未完成，请检查网络或确认 GitHub 登录授权后再次运行本脚本。
)

echo.
pause
