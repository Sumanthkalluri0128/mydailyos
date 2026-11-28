# Why the app is slow to open, and what to do about it

Render's free web services **spin down after about 15 minutes without traffic**. The next request has to wait for Render to
start the machine again (typically 30–60 s) before FlexFit's code even runs. Nothing inside the app can speed up that part —
the fix is to make sure the service doesn't go to sleep, or to pay for one that doesn't.

## What the app now does by itself (v8.4 / v7.4)
* The server starts answering `/api/health` immediately and connects to the database in the background (before, it waited for
  the database and for index building on every model first).
* Both apps ping `/api/health` the moment they open, and show a **"Waking up the server…"** banner instead of a blank wait.
* Screens show the last saved data straight away (mobile and web caches) while fresh data loads.

## Keep it awake (free) — pick ONE
1. **UptimeRobot** (recommended): create a free account → *Add New Monitor* → type **HTTP(s)** → URL
   `https://YOUR-SERVICE.onrender.com/api/health` → interval **5 minutes**.
2. **GitHub Actions**: `.github/workflows/keep-alive.yml` is included. Add a repository secret `API_URL` and it pings every 10 minutes.

Render's free plan includes a monthly pool of instance hours; one service running 24/7 fits inside it, but if you run several
free services in the same workspace, check Render's current free-tier limits before pinging them all.

## Make it permanent
Render's paid *Starter* instance never sleeps. If FlexFit is used daily by real people, that is the dependable fix.
