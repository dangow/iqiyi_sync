# 同步觀影（YouTube / Netflix / 愛奇藝）

## 1. 伺服器
cd server && npm install && npm start   # 預設 ws://localhost:8080
部署到 Render：Root Directory 填 `server`，Build `npm install`，Start `npm start`。
伺服器網址填 wss://你的服務.onrender.com

## 2. 電腦（Chrome 111 以上）
chrome://extensions → 開發人員模式 → 載入未封裝項目 → 選 extension 資料夾。
兩人填一樣的伺服器網址與房間代碼，各自開同一部影片（YouTube / Netflix 要在 /watch 頁面）。
Alt+S：把自己的進度推給對方。

## 3. iPhone / iPad（僅 YouTube）
Safari 開 https://你的服務.onrender.com ，填房間代碼、貼 YouTube 網址。
iOS 規定第一次要自己點一下播放，之後才有機會被遠端控制。

## 自動跳轉
任一人在 YouTube / Netflix / 愛奇藝選了新影片，對方的瀏覽器會自動跳到同一部。
新朋友加入房間時，原本在房裡的人會把目前的影片推給他。
對方跳轉要成功，他必須已經在同一個網站上（首頁也可以，不一定要在播放頁）。
iPhone 網頁版：第一次按按鈕是進房間，之後貼新網址再按一次，就會推給對方。
