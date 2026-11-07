# Google Search Console & SEO monitoring (PlayFit Club)

Site: https://playfitclub.com/

This guide covers manual steps that cannot be completed from the repo alone.

## 1. Add the property

1. Open [Google Search Console](https://search.google.com/search-console).
2. Prefer a **Domain** property for `playfitclub.com` (covers http/https and www/non-www).
3. Or use a **URL-prefix** property for `https://playfitclub.com/`.

## 2. Verify ownership

### Domain property (recommended)

1. In GSC, choose **Domain** → enter `playfitclub.com`.
2. Copy the DNS **TXT** record Google shows.
3. Add that TXT record at your DNS host (where the domain is managed).
4. Wait for DNS propagation, then click **Verify** in GSC.
5. Do not invent a token—use only the value Google displays.

### URL-prefix property (HTML meta tag)

1. In GSC, choose **URL prefix** → `https://playfitclub.com/`.
2. Choose **HTML tag** verification and copy the `content` value.
3. Set one of these env vars on the Vercel project for `apps/web` (do not commit the real token):
   - `GOOGLE_SITE_VERIFICATION`
   - or `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
4. Redeploy so root metadata includes the verification tag.
5. Click **Verify** in GSC.

## 3. Submit the sitemap

1. Confirm live: https://playfitclub.com/sitemap.xml
2. Confirm robots: https://playfitclub.com/robots.txt (should list the sitemap).
3. In GSC → **Sitemaps** → submit `https://playfitclub.com/sitemap.xml` (or `sitemap.xml`).

Public URLs currently intended for indexing include:

- `/`
- `/games`
- `/fit-run`
- `/online-running-games`
- `/browser-games`
- `/webcam-games`
- `/pricing`
- `/for-gyms`
- `/privacy`
- `/terms`

Private play/auth/dashboard routes are `noindex` and disallowed in `robots.ts`.

## 4. Request indexing

1. Use **URL Inspection** for each new landing page after deploy.
2. Confirm “URL is on Google” or request indexing when eligible.
3. Prefer sitemap coverage first; use inspection for priority pages.

## 5. Check indexing issues

In GSC, review:

- **Pages** (indexing) for excluded / crawled / not indexed reasons
- **Sitemaps** for discovered vs submitted
- **Experience** / Core Web Vitals if available
- Mobile usability signals if shown

## 6. Keyword monitoring plan (manual)

Primary queries to watch (impressions, clicks, CTR, average position):

- online games
- free online games
- browser games
- running games online
- endless runner games
- games without download
- webcam games
- motion controlled games

Also watch related terms from supporting copy: online running game, free browser games, games to play on laptop, camera controlled games.

In GSC **Performance**:

1. Filter by query and by page (`/fit-run`, `/online-running-games`, `/browser-games`, `/webcam-games`, `/`).
2. Compare **Search type: Web**.
3. Split **Device**: Mobile vs Desktop.
4. Review **Pages** for which landing URLs earn impressions.
5. Export CSV periodically; do not invent traffic numbers.

There is no automated GSC API wiring required for this plan. Optional server reporting for GA4/Vercel remains under `/admin/analytics` when those env vars are set.

## 7. Analytics (GA4)

- Measurement ID defaults to public `G-736X842XQL` when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset.
- Override with `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Vercel if you rotate properties.
- Tracked marketing/play signals include page views, `play_clicked`, `fit_run_selected`, `game_started`, and `game_completed`.
- Camera frames and pose landmarks are never sent to analytics.

## 8. After deploy checklist

- [ ] DNS or HTML verification completed in GSC
- [ ] Sitemap submitted
- [ ] New landing URLs inspected
- [ ] Performance report saved as baseline (even if impressions are zero)
- [ ] GA4 Realtime shows a test visit and a Play Demo click
