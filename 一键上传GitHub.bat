@echo off
chcp 65001 >nul
title 疯狂过六级 - 一键推送至 GitHub
cd /d "%~dp0"

echo =======================================================
echo          🔥 疯狂过六级 · 一键上传 GitHub 部署工具
echo =======================================================
echo.
echo [1/3] 检查本地 Git 状态...
git status
echo.

git remote get-url origin >nul 2>&1
if %errorlevel% equ 0 (
    echo [2/3] 检测到已配置远程仓库:
    git remote -v
    echo.
) else (
    echo [2/3] 尚未关联 GitHub 远程仓库。
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

echo [3/3] 正在推送至 GitHub (main 分支)...
echo (如果是首次推送，Windows 将自动弹出 GitHub 浏览器安全登录窗口，点击授权即可)
echo.
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo   🎉 恭喜！《疯狂过六级》项目已成功推送到 GitHub！
    echo =======================================================
) else (
    echo.
    echo 提示: 若推送未完成，请检查网络或确认 GitHub 登录授权后再次运行本脚本。
)

echo.
pause
