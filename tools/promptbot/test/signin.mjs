import { chromium } from "playwright";
import { attachWand } from "/home/user/sculps-store/tools/promptbot/wand.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--ignore-certificate-errors"] });
let bad=0;
for (const [url, want] of [["https://chatgpt.com/",true],["https://chatgpt.com/c/abc",true],["https://gemini.google.com/app",true],["https://accounts.google.com/v3/signin",false],["https://auth.openai.com/log-in",false],["https://chatgpt.com/auth/login",false],["https://chatgpt.com/auth/logout",false],["https://auth0.openai.com/u/login",false]]) {
  const page = await browser.newPage();
  await page.route("**/*", r => r.fulfill({ contentType:"text/html", body:"<body>x</body>" }));
  await page.goto(url);
  await attachWand(page);
  await page.waitForTimeout(200);
  const has = await page.evaluate(()=>Boolean(window.__wand));
  console.log(has===want?"PASS":"FAIL", url, "overlay:", has);
  if (has!==want) bad++;
  await page.close();
}
await browser.close(); process.exit(bad?1:0);
