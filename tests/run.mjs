/*
 * やること 回帰テスト
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node tests/run.mjs
 *
 * index.html を実ブラウザで開き、追加・完了・書き直し・区分の編集・同期の合わせ方（mergeDB）を確かめる。
 * アプリ本体は依存なしのまま。これは開発時にだけ使う道具。
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8124);

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("playwright が見つかりません。\n  npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const MIME = { ".html":"text/html; charset=utf-8", ".png":"image/png", ".svg":"image/svg+xml" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));
const URL_ = `http://127.0.0.1:${PORT}/index.html`;

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  PASS " + name); } else { fail++; console.log("  FAIL " + name); } };
const group = n => console.log("\n" + n);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on("dialog", d => d.accept());
await page.goto(URL_);

group("初期状態");
ok("区分が5つ", await page.locator("#tabs button[data-cat]").count() === 5);
ok("最初の区分が選ばれている", await page.locator("#tabs button.on").textContent() === "仕事（不動産）");
ok("空の案内", (await page.locator("#list .empty").textContent()).includes("まだ何もありません"));
ok("横にはみ出さない", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

group("追加・完了・戻す");
await page.fill("#addtext", "内見の日程を決める");
await page.press("#addtext", "Enter");
ok("1件増えた", await page.locator("#list .row").count() === 1);
ok("入力欄が空に戻る", await page.inputValue("#addtext") === "");
ok("区分に件数", (await page.locator("#tabs button.on .n").textContent()) === "1");
await page.fill("#addtext", "重説の確認");
await page.press("#addtext", "Enter");
ok("新しいものが上", (await page.locator("#list .row .t").first().textContent()) === "重説の確認");
await page.locator("#list .row .chk").first().click();
ok("完了すると一覧から消える", await page.locator("#list .row").count() === 1);
ok("完了 1件 と出る", (await page.locator("#btn_done").textContent()).includes("完了 1件"));
await page.click("#btn_done");
ok("開くと取り消し線つきで出る", await page.locator("#donebox .row.done").count() === 1);
await page.locator("#donebox .row .chk").click();
ok("丸を押すと戻る", await page.locator("#list .row").count() === 2);

group("書き直し・移動・削除");
await page.locator("#list .row .t").first().click();
await page.fill("#e_text", "重説の確認（金曜まで）");
await page.selectOption("#e_cat", "c_later");
await page.click("#e_save");
ok("移した先に無いので今の区分は1件", await page.locator("#list .row").count() === 1);
await page.click("#tabs button[data-cat=c_later]");
ok("後回しに入った", (await page.locator("#list .row .t").first().textContent()) === "重説の確認（金曜まで）");
await page.locator("#list .row .t").first().click();
await page.click("#e_del");
ok("削除で消える", await page.locator("#list .row").count() === 0);
ok("墓標が残る", await page.evaluate(() => Object.keys(window.__todo.DB.deleted).length === 1));

group("区分の編集");
await page.click("#btn_cats");
ok("中身のある区分の × は押せない", await page.locator("#catlist .catrow").first().locator(".del").isDisabled());
ok("空の区分の × は押せる", !(await page.locator("#catlist .catrow").nth(1).locator(".del").isDisabled()));
await page.locator("#catlist .catrow").nth(1).locator(".del").click();
await page.click("#c_add");
await page.locator("#catlist .catrow").last().locator("input").fill("家");
await page.locator("#catlist .catrow").last().locator(".mv[data-d='-1']").click();
await page.click("#c_save");
const names = await page.locator("#tabs button[data-cat]").allTextContents();
ok("削除・追加・並べ替えが反映", JSON.stringify(names.map(s => s.replace(/\d+$/, ""))) === JSON.stringify(["仕事（不動産）","トレード","後回し","家","買うもの"]));

group("並べ替え（↑↓）と左右スワイプ");
await page.click("#tabs button[data-cat=c_work]");
for (const t of ["A","B","C"]) { await page.fill("#addtext", t); await page.press("#addtext", "Enter"); }
const texts = async () => page.locator("#list .row .t").allTextContents();
ok("新しいものが上（C,B,A… 既存1件が最後）", JSON.stringify((await texts()).slice(0,3)) === JSON.stringify(["C","B","A"]));
await page.click("#btn_sort");
ok("並べ替え中は ↑↓ が出て丸が消える", (await page.locator("#list .row .mv").count()) > 0 && (await page.locator("#list .row .chk").count()) === 0);
await page.locator("#list .row").nth(2).locator(".mv[data-d='-1']").click();
ok("A が1つ上がる", JSON.stringify((await texts()).slice(0,3)) === JSON.stringify(["C","A","B"]));
const stamps = await page.evaluate(() => Object.fromEntries(window.__todo.DB.items.map(x => [x.text, x._m])));
await page.waitForTimeout(5);
await page.locator("#list .row").nth(0).locator(".mv[data-d='1']").click();
const changed = await page.evaluate(s => window.__todo.DB.items.filter(x => s[x.text] !== x._m).map(x => x.text).sort(), stamps);
ok("動かした2件だけ _m が進む", JSON.stringify(changed) === JSON.stringify(["A","C"]));
await page.click("#btn_sort");
ok("完了で元の表示に戻る", (await page.locator("#list .row .chk").count()) === 4);
const swipe = async (x1, x2) => page.evaluate(([x1, x2]) => {
  const mk = (t, x) => new TouchEvent(t, { bubbles:true, touches: t === "touchend" ? [] : [new Touch({identifier:1, target:document.body, clientX:x, clientY:400})], changedTouches:[new Touch({identifier:1, target:document.body, clientX:x, clientY:400})] });
  document.body.dispatchEvent(mk("touchstart", x1)); document.body.dispatchEvent(mk("touchend", x2));
  return window.__todo.cur;
}, [x1, x2]);
ok("左へスワイプで次の区分", (await swipe(300, 100)) === "c_trade");
ok("右へスワイプで前の区分", (await swipe(100, 300)) === "c_work");
await page.click("#tabs button[data-cat=c_work]");

group("再読み込みで残る");
await page.reload();
ok("やることが残る", await page.evaluate(() => window.__todo.DB.items.length === 4));
ok("順番が残る", JSON.stringify((await page.locator("#list .row .t").allTextContents()).slice(0,3)) === JSON.stringify(["A","C","B"]));
ok("区分が残る", await page.locator("#tabs button[data-cat]").count() === 5);

group("同期の合わせ方（mergeDB）");
const r = await page.evaluate(() => {
  const m = window.__todo.mergeDB;
  const L = { cats:[{id:"c1",name:"A",order:0,_m:10}], items:[{id:"i1",text:"古い",cat:"c1",_m:10},{id:"i2",text:"自分だけ",cat:"c1",_m:10}], deleted:{} };
  const R = { cats:[{id:"c1",name:"A2",order:0,_m:20}], items:[{id:"i1",text:"新しい",cat:"c1",_m:20},{id:"i3",text:"相手だけ",cat:"c1",_m:5}], deleted:{} };
  const a = m(JSON.parse(JSON.stringify(L)), R);
  // 相手が消したものは、自分の版より墓標が新しければ消える
  const b = m({ cats:[], items:[{id:"i9",text:"x",cat:"c1",_m:10}], deleted:{} }, { cats:[], items:[], deleted:{ i9: 30 } });
  // 自分がその後に直したものは、古い墓標では消えない
  const c = m({ cats:[], items:[{id:"i9",text:"x",cat:"c1",_m:40}], deleted:{} }, { cats:[], items:[], deleted:{ i9: 30 } });
  return {
    newerWins: a.db.items.find(x=>x.id==="i1").text === "新しい",
    catNewer: a.db.cats[0].name === "A2",
    union: a.db.items.length === 3,
    ahead: a.ahead === true, changed: a.changed === true,
    deadApplied: b.db.items.length === 0 && b.changed === true,
    deadIgnored: c.db.items.length === 1 && c.ahead === true,
  };
});
ok("1件ごとに新しい方が勝つ", r.newerWins);
ok("区分も同じ", r.catNewer);
ok("双方にしか無いものは足し合わせる", r.union);
ok("自分の方が新しいものがあれば送り返す印", r.ahead && r.changed);
ok("相手の墓標で消える", r.deadApplied);
ok("墓標より後に直したものは残る", r.deadIgnored);

await browser.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
