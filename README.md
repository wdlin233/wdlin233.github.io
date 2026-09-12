# wdlin's Blog

Personal blog built with [Astro](https://astro.build/) and migrated to
[MultiTerm](https://github.com/stelcodes/multiterm-astro).

## Structure

- `multiterm/`: the active MultiTerm theme and routes
- `src/content/blog/`: existing blog posts
- `src/pages/about.md`: existing About content
- `src/pages/links.md`: existing Links content
- `multiterm/site.config.ts`: site navigation, social links, and color themes

## Commands

```bash
npm install
npm run dev
npm run check
npm run build
```

The original post slugs are preserved, so existing `/posts/<slug>/` URLs remain valid.

## License

The MultiTerm theme is licensed under the MIT License. See
[`LICENSE-MultiTerm.txt`](LICENSE-MultiTerm.txt).
