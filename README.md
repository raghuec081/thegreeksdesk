# TheGreeksDesk — Deployment Guide

## What's in this folder
- `index.html` — the full website
- `api/quote.js` — a serverless function that securely fetches live prices from Finnhub (your API key never touches the browser)
- `package.json` — required so Vercel recognizes this as a project

## Step 1 — Push this to GitHub
1. Go to github.com → click **New repository**
2. Name it `thegreeksdesk` → keep it **Private** (recommended) or Public, your choice → click **Create repository**
3. On the next page, click **uploading an existing file**
4. Drag in all three files/folders from this project (`index.html`, `api` folder, `package.json`, this `README.md`)
5. Click **Commit changes**

## Step 2 — Deploy to Vercel
1. Go to vercel.com → **Sign up** → choose **Continue with GitHub** (this links the two accounts)
2. Click **Add New → Project**
3. Find and **Import** your `thegreeksdesk` repo
4. Before clicking Deploy, open **Environment Variables** and add:
   - Name: `FINNHUB_API_KEY`
   - Value: *(paste your Finnhub API key here — found on your Finnhub dashboard)*
5. Click **Deploy** — takes about a minute. You'll get a live URL like `thegreeksdesk.vercel.app`

## Step 3 — Connect your domain
1. In your Vercel project, go to **Settings → Domains**
2. Type `thegreeksdesk.com` → **Add**
3. Vercel will show you either:
   - Two DNS records to add (an A record + a CNAME), **or**
   - Nameservers to switch to
4. Go to your GoDaddy account → your domain → **DNS** (or **Nameservers**) settings → enter what Vercel showed you
5. Wait — this can take anywhere from a few minutes to ~24 hours to fully activate

## After that
Every time you want to update the site, just edit the file on GitHub (or push new code) — Vercel automatically redeploys within seconds.
