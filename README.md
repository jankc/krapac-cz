# [krapac.cz](https://krapac.cz)

Personal photography portfolio website, now migrated from Gatsby to Astro.

Based on the [Strata template](https://www.gatsbyjs.org/starters/codebushi/gatsby-starter-strata/).

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Hidden galleries

Unlisted galleries live under `content/hidden-galleries/`, in the same
`name.md` + `name.jpg` + `name/` photo layout as `content/galleries/`.
Frontmatter needs `title` and `featuredPhoto`; add an optional `slug` to
decouple the public URL from the filename (no `order` — hidden galleries are
never sorted or listed).

They build at `/{slug}/` (and `/{slug}/{n}/` for each photo) exactly like an
official gallery, but are absent from the homepage index, excluded from the
sitemap, and served with a `noindex, nofollow` meta tag. Anyone with the
direct link can open and share it — unlisted, not private.

## Images (Cloudflare R2)

Gallery photos are **not committed to git**. They live in the `krapac-images`
R2 bucket, served from `https://img.krapac.cz` and resized on the fly by
Cloudflare Image Transformations (`/cdn-cgi/image/...` URLs). The build only
needs `content/images-manifest.json` (committed), which records each image's
dimensions and content hash.

Authoring workflow (unchanged on disk, images are just gitignored):

1. Drop photos into `content/galleries/<name>/` (or `content/hidden-galleries/`)
   exactly as before — full-resolution exports are welcome, visitors always
   receive resized derivatives.
2. Run `npm run images:sync` — uploads new/changed files to R2 (needs
   `npx wrangler login` once) and updates the manifest.
3. Commit the manifest together with the gallery `.md` changes and push.

`npm run images:sync -- --dry-run` previews, `-- --prune` also deletes R2
objects whose local file was removed. The image host can be overridden with
the `PUBLIC_IMAGE_CDN` env var.

## Static Hosting Cache Guidance

Set cache headers at your CDN/hosting layer to keep static assets fast while avoiding stale HTML.

- HTML (`/*.html`, `/`, gallery routes): `Cache-Control: public, max-age=0, must-revalidate`
- Fingerprinted build assets (`/_astro/*`): `Cache-Control: public, max-age=31536000, immutable`
- Gallery images are served by Cloudflare (`img.krapac.cz`) and cached at its edge — no hosting config needed here
- `robots.txt` and sitemap files: `Cache-Control: public, max-age=3600`
