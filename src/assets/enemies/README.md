# 敵人圖片

把圖檔放在這個資料夾，檔名用敵人 id，遊戲就會改用圖片；沒放圖的敵人仍用程式繪製。

| 檔名 | 敵人 |
|---|---|
| `slime.png` / `slime.webp` | 史萊姆 |
| `caveBat.png` / `caveBat.webp` | 洞穴蝙蝠 |
| `skeleton.png` / `skeleton.webp` | 骷髏戰士 |
| `gargoyle.png` / `gargoyle.webp` | 石像鬼 |
| `slimeKing.png` / `slimeKing.webp` | 史萊姆王（Boss） |

- 檔名大小寫要一致（`caveBat`，不是 `cavebat`）。同一隻敵人同時有 png 和 webp 時用 webp。
- **透明背景**：受擊閃白會把不透明的像素染白，有底色的話整個方框都會變白。
- **尺寸**：建議 256×256 以上的正方形。畫面上約 50～78 像素，高解析度螢幕最多放大 3 倍。不是正方形的圖會等比縮放置中。
- 角色面向玩家、留一點邊，輪廓在小尺寸下也要認得出來。
- 新增圖檔後要重新建置（`npm run build`），離線快取會自動包含新圖。
