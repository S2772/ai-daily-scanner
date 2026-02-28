#!/bin/bash

# AI热点日报系统启动脚本
# 作者: AI助手
# 日期: 2026-02-25

echo "=================================================="
echo "    AI热点日报系统 - 现代化Web界面启动脚本"
echo "=================================================="
echo ""

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到Python3，请先安装Python3"
    exit 1
fi

# 检查Flask是否安装
if ! python3 -c "import flask" &> /dev/null; then
    echo "⚠️  Flask未安装，正在安装Flask..."
    pip3 install flask
    if [ $? -ne 0 ]; then
        echo "❌ Flask安装失败，请手动安装: pip3 install flask"
        exit 1
    fi
    echo "✅ Flask安装成功"
fi

# 检查数据库文件
if [ ! -f "ai_daily.db" ]; then
    echo "⚠️  数据库文件不存在，将创建空数据库"
    echo "    请运行爬虫脚本填充数据: python3 scraper.py"
fi

# 检查必要的文件
if [ ! -f "webapp.py" ]; then
    echo "❌ webapp.py不存在"
    exit 1
fi

if [ ! -d "templates" ]; then
    echo "❌ templates目录不存在"
    exit 1
fi

if [ ! -d "static" ]; then
    echo "❌ static目录不存在"
    exit 1
fi

# 检查模板和静态文件
if [ ! -f "templates/dashboard.html" ]; then
    echo "⚠️  templates/dashboard.html不存在"
fi

if [ ! -f "static/dashboard.css" ]; then
    echo "⚠️  static/dashboard.css不存在"
fi

if [ ! -f "static/dashboard.js" ]; then
    echo "⚠️  static/dashboard.js不存在"
fi

echo ""
echo "✅ 环境检查完成"
echo ""

# 显示系统信息
echo "系统信息:"
echo "  Python版本: $(python3 --version)"
echo "  Flask版本: $(python3 -c "import flask; print(flask.__version__)")"
echo "  工作目录: $(pwd)"
echo "  数据库: $(ls -la ai_daily.db 2>/dev/null || echo '不存在')"
echo ""

# 启动选项
echo "请选择启动选项:"
echo "  1) 正常启动 (默认端口 5000)"
echo "  2) 指定端口启动"
echo "  3) 调试模式启动"
echo "  4) 查看帮助"
echo "  5) 退出"
echo ""

read -p "请输入选项 [1-5]: " choice

case $choice in
    1)
        echo "正在启动服务器..."
        python3 webapp.py
        ;;
    2)
        read -p "请输入端口号: " port
        if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1024 ] || [ "$port" -gt 65535 ]; then
            echo "❌ 无效的端口号，请输入1024-65535之间的数字"
            exit 1
        fi
        echo "正在启动服务器，端口: $port..."
        python3 webapp.py --port $port
        ;;
    3)
        echo "正在启动调试模式..."
        export FLASK_ENV=development
        python3 webapp.py
        ;;
    4)
        echo ""
        echo "帮助信息:"
        echo "  1. 首次使用请确保已安装Python3和Flask"
        echo "  2. 数据库文件会自动创建，但需要运行爬虫填充数据"
        echo "  3. 访问地址: http://localhost:5000"
        echo "  4. 默认端口为5000，如果被占用可以指定其他端口"
        echo "  5. 调试模式会显示更详细的错误信息"
        echo ""
        echo "文件结构:"
        echo "  webapp.py        - Web服务器主程序"
        echo "  templates/       - HTML模板文件"
        echo "  static/          - CSS和JavaScript文件"
        echo "  ai_daily.db      - SQLite数据库"
        echo "  scraper.py       - 数据爬虫脚本"
        echo "  start.sh         - 此启动脚本"
        echo ""
        echo "常见问题:"
        echo "  Q: 页面显示空白或错误？"
        echo "  A: 检查templates和static目录下的文件是否存在"
        echo ""
        echo "  Q: 没有数据？"
        echo "  A: 运行爬虫脚本: python3 scraper.py"
        echo ""
        echo "  Q: 端口被占用？"
        echo "  A: 使用选项2指定其他端口"
        echo ""
        ;;
    5)
        echo "退出"
        exit 0
        ;;
    *)
        echo "使用默认选项: 正常启动"
        python3 webapp.py
        ;;
esac