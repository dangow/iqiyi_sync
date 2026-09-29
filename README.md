# 愛奇藝同步觀影

## 1. 架設中繼伺服器
cd server && npm install && npm start      # 預設 ws://localhost:8080

朋友要連得到，二選一：
- 臨時用：另開終端機執行 `cloudflared tunnel --url http://localhost:8080`，會得到 https://xxx.trycloudflare.com，
  伺服器網址就填 wss://xxx.trycloudflare.com
- 長期用：把 server 資料夾部署到 Render / Fly.io / Railway（會自動提供 wss://）

## 2. 安裝擴充套件（兩人都要）
Chrome → chrome://extensions → 開啟「開發人員模式」→「載入未封裝項目」→ 選 extension 資料夾

## 3. 使用
兩人點擴充套件圖示，填同樣的伺服器網址與房間代碼 → 各自打開同一集 → 任一人播放/暫停/拖進度，另一邊就會跟著動。
