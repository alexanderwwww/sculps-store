# Deploy Mine Solver to the cloud (use it from your iPhone, no computer needed)

Once deployed, you get a permanent public link like `https://mine-solver.onrender.com`
that you can open on your iPhone anytime — even on cellular. You can do this
**entirely from your phone's browser.**

## Option A: Render.com (free, recommended)

1. Go to **https://render.com** and sign up (free — use "Sign in with GitHub")
2. Make sure this repo is pushed to your GitHub account
3. On Render: **New +** → **Web Service**
4. Connect your GitHub and pick the **sculps-store** repo
5. Render auto-detects the `Dockerfile` — just confirm:
   - Runtime: **Docker**
   - Plan: **Free**
6. Click **Create Web Service**
7. Wait ~5 min for the first build (Playwright image is big)
8. Open the URL it gives you → bookmark it on your iPhone home screen

> Free tier note: the app "sleeps" after 15 min of no use. First load after
> sleeping takes ~30 sec to wake up, then it's fast. Totally fine for a prank.

## Option B: Railway.app (also free-ish)

1. Go to **https://railway.app** → sign in with GitHub
2. **New Project** → **Deploy from GitHub repo** → pick **sculps-store**
3. Railway detects the `Dockerfile` and builds automatically
4. Under **Settings → Networking**, click **Generate Domain**
5. Open that domain on your iPhone

## Add it to your iPhone home screen (looks like a real app)

1. Open the deployed URL in **Safari**
2. Tap the **Share** button (square with arrow)
3. Tap **Add to Home Screen**
4. Name it "Mine Solver" → now it has its own icon like a real app 💣

## Troubleshooting

- **Build fails**: check the host's build logs. Usually a typo in requirements.txt.
- **App loads but board not found**: the target site may use a layout we don't
  have a profile for yet — send me the URL and I'll add support.
- **Slow first load**: free tier waking from sleep. Wait 30 sec, refresh.
