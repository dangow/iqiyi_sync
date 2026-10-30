# 同步觀影 watch-sync

和朋友各自用自己的帳號，同時看同一部影片：播放、暫停、拖進度都會同步，其中一人選了新影片，另一人的瀏覽器會自動跳到同一部。

## 支援平台

| 平台 | 電腦（Chrome） | iPhone / iPad |
|---|---|---|
| 愛奇藝（iqiyi.com、iq.com） | 支援 | 支援（Safari + Userscripts 腳本） |
| YouTube | 支援（`/watch` 頁面） | 支援（伺服器附的網頁版，貼 YouTube 網址） |
| Netflix | 支援（`/watch` 頁面） | 不支援 |
| Android | 目前沒有支援的方案 | — |

電腦、iPhone、iPad 可以同一個房間混用，人數不限。

## 運作原理

```
你的瀏覽器 ──┐
             ├──  WebSocket 伺服器（server/）  ──┤
朋友的瀏覽器 ─┘      依「房間代碼」轉發訊息
```

每個人播放的仍然是自己帳號、從平台載入的影片。程式只做兩件事：

1. 監聽你的播放、暫停、拖進度，把「動作 + 目前秒數」傳給同房間的人。
2. 收到別人的動作後，在自己的播放器上做同樣的操作。

## 檔案結構

```
watch-sync/
├─ server/
│  ├─ server.js          WebSocket 轉發伺服器（含 20 秒心跳）
│  ├─ package.json
│  └─ public/index.html  iPhone / iPad 看 YouTube 的網頁
├─ extension/            電腦 Chrome 擴充套件
│  ├─ manifest.json
│  ├─ main.js            頁面內：找 <video>、同步播放、自動跳轉
│  ├─ bridge.js          頁面與背景之間傳話
│  ├─ background.js      連 WebSocket（避開網站的 CSP 限制）
│  └─ popup.html / popup.js   設定視窗
├─ ios/
│  └─ watch-sync-iqiyi.user.js   iPhone / iPad 看愛奇藝的腳本
└─ README.md
```

---

## 1. 架設伺服器（只需要一個人做）

### 方案 A：部署到 Render（推薦，網址固定）

1. 把這個專案放上 GitHub。
2. 到 https://render.com 登入，New → Web Service，選你的 repo。
3. 設定：
   - Root Directory：`server`
   - Build Command：`npm install`
   - Start Command：`npm start`
   - Instance Type：Free
4. 部署完成後會得到 `https://你的服務.onrender.com`，把 `https` 改成 `wss`，就是**伺服器網址**：
   ```
   wss://你的服務.onrender.com
   ```

注意：Render 免費方案閒置一段時間會休眠，第一次連線要等 30～50 秒喚醒。想暫時停掉服務，可以在服務頁面選 Suspend，要用時再 Resume，網址不會變。

### 方案 B：自己的電腦 + cloudflared（臨時用）

```powershell
cd server
npm install
npm start
```

另開一個視窗：

```powershell
cloudflared tunnel --url http://localhost:8080
```

會得到 `https://xxxx.trycloudflare.com`，改成 `wss://xxxx.trycloudflare.com` 當伺服器網址。

這個方案的缺點：網址**每次重開都會換**，要重新告訴朋友並重新設定；免費通道也可能不穩定（會出現 503）。自己一個人在同一台電腦測試時，可以直接用 `ws://localhost:8080`。

> Windows PowerShell 5.1 不支援 `&&`，指令請分行執行。

---

## 2. 電腦：安裝 Chrome 擴充套件（每個人都要）

需要 Chrome 111 以上。

1. 打開 `chrome://extensions`，開啟右上角「開發人員模式」。
2. 按「載入未封裝項目」，選 `extension` 資料夾。
3. 點擴充套件圖示，填：
   - **伺服器網址**：`wss://...`
   - **房間代碼**：所有人填一樣的
4. 按「儲存並連線」。
5. 各自打開同一部影片。YouTube、Netflix 要在 `/watch` 頁面；愛奇藝在播放頁。

> 擴充套件只會在頁面載入時注入。**安裝完或第一次設定後，要重新整理影片頁**，之後改設定則不需要。

### 左上角狀態標籤

| 顏色 / 文字 | 意思 |
|---|---|
| 紅「尚未設定伺服器/房間」 | 回擴充套件圖示填設定 |
| 紅「連線中…」「連線失敗」「斷線，重連中…」 | 網址錯誤、伺服器休眠或不穩，見下方疑難排解 |
| 紅「已連線，等朋友加入」 | 你連上了，對方還沒進同一個房間 |
| 綠「已連線（房內 N 人）」 | 正常，可以同步 |

### 快捷鍵

- **Alt+S**：把我現在的進度推給對方（覺得兩邊差了幾秒時使用）。

---

## 3. iPhone / iPad

### 3-1 看愛奇藝：Safari + Userscripts 腳本

1. App Store 安裝免費的 **Userscripts**（需要 iOS 15 以上）。
2. 設定 → Safari → 擴充功能 → Userscripts：開啟，權限設成「所有網站：允許」。
3. 把 `ios/watch-sync-iqiyi.user.js` 傳到手機（AirDrop、iCloud，或用 LINE 傳給自己再存進「檔案」），放進 Userscripts 的資料夾（「檔案」App → 我的 iPhone → Userscripts）。檔名必須以 `.user.js` 結尾。
4. 用 **Safari** 打開愛奇藝網頁版（愛奇藝 App 不行），重新整理。
5. 第一次會跳出輸入框，填伺服器網址與房間代碼。

左上角兩個按鈕：

- 點狀態文字：修改伺服器網址 / 房間代碼。
- 點「↻」：把我的進度推給對方（等於電腦的 Alt+S）。

如果 iPhone 上的愛奇藝版面不一樣或一直要你開 App，可以在 Safari 的「AA」選單選「要求電腦版網站」再重新整理。

### 3-2 看 YouTube：網頁版

1. Safari 開 `https://你的服務.onrender.com`。
2. 填房間代碼、貼上 YouTube 網址，按「進入房間並載入影片」。
3. 之後想換影片，貼新網址再按一次，就會推給對方。「推送我的進度給對方」可以手動對齊進度。

### iOS 的共通限制

- **iOS 擋自動播放**：被遠端按播放時可能先被擋住。腳本版會顯示「點一下頁面即可加入同步」，點一下就行；網頁版則是第一次要自己點一下播放。
- **鎖屏或切到別的 App 一陣子，連線會被 iOS 中斷**，回到畫面後會自動重連，再按「↻」或請對方按 Alt+S 對齊。
- 愛奇藝請用 Safari 網頁版，App 內的播放器抓不到。

---

## 自動跳轉

- 任何人在愛奇藝 / YouTube / Netflix 選了新影片，同房間的人會自動跳到同一部。
- 新朋友加入房間時，原本在房裡的人會把目前的影片推給他。
- 剛加入或剛跳轉到新影片的人，會自動向對方要目前進度並跳過去（電腦、iPhone 腳本都支援）。
- 對方要跳轉成功，他必須已經在**同一個網站**上（首頁也可以，不一定要在播放頁）；只允許同網站之間的跳轉，不會被導去別處。
- iPhone 腳本有防迴圈保護：同一個網址 30 秒內只會自動跳一次。

---

## 疑難排解

| 現象 | 原因與做法 |
|---|---|
| 完全沒有左上角標籤 | 擴充套件是在頁面開著之後才安裝 / 更新的：到 `chrome://extensions` 重新載入，再 F5。iOS 則確認 Userscripts 已啟用該腳本並重新整理。 |
| 紅色「尚未設定伺服器/房間」 | 設定是空的，到擴充套件圖示重新填（移除重裝擴充套件會清掉設定）。 |
| Console 出現 `ERR_NAME_NOT_RESOLVED` | 伺服器網址已失效。最常見是 cloudflared 重開後網址變了：用新網址覆蓋，兩邊都要。 |
| 對方看到 `unexpected response code 503` | cloudflared 免費通道不穩或掛了，改用 Render。 |
| 「已連線，等朋友加入」但朋友明明連上了 | 兩邊房間代碼不一樣（注意大小寫），或朋友還沒重新整理影片頁。 |
| 綠色但沒有同步 | 按 F12 看 Console 有沒有錯誤；確認兩邊在同一部影片；先在任一邊按 Alt+S（iPhone 按 ↻）。 |
| 被遠端播放時沒動作（iOS） | 被瀏覽器擋住自動播放，在頁面上點一下。 |
| Render 一開始連不上 | 免費方案休眠中，等 30～50 秒讓它喚醒。 |
| iPhone 腳本裝了沒反應 | 檔名是不是被改掉了（必須是 `.user.js`）；舊版 `iqiyi-sync.user.js` 要刪掉，避免兩支同時執行。 |
| 愛奇藝改版後失效 | 多半是播放器結構變了，`<video>` 沒被抓到，需要調整 `main.js` / 腳本的偵測方式。 |

---

## 安全與使用須知

- **房間代碼就是門**：知道伺服器網址和房間代碼的人都能加入並控制播放，請取長一點、不好猜的，例如 `abc-iqiyu-78ew`，不要用 `room1`。
- 房間內**任何人**都能暫停或拖進度，人多時先講好誰來操作。
- 伺服器只轉發很小的文字訊息（動作、秒數、影片網址），不會經手影片內容，也不會儲存任何帳號資料。
- 每個人都需要自己的平台帳號，並自行遵守各平台的使用條款。

## 更新

- 改了 `extension/` 裡的檔案：到 `chrome://extensions` 按重新載入，再重新整理影片頁。
- 改了 `ios/` 腳本：覆蓋 Userscripts 資料夾裡的同名檔案，再重新整理頁面。
- 改了 `server/`：重新部署（Render 在 push 到 GitHub 後會自動重新部署）。
