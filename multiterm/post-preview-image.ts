import type { ImageMetadata } from 'astro'
import type { CollectionEntry } from 'astro:content'

const assets = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{png,jpg,jpeg,webp,gif,avif,svg}',
  { eager: true },
)

export function getPostPreviewImage(post: CollectionEntry<'posts'>) {
  const content = (post.body || '').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
  const pattern = /!\[([^\]]*)\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)|<img\b[^>]*>/gi

  for (const match of content.matchAll(pattern)) {
    const source = match[2] ?? match[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
    const alt = match[1] ?? match[0].match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''

    if (!source) continue
    if (/^https?:\/\//i.test(source)) return { src: source, alt }
    if (source.startsWith('/') && !source.startsWith('//')) {
      return { src: source, alt }
    }

    const path = new URL(source, 'https://local/src/content/blog/_').pathname
    const asset = assets[decodeURIComponent(path)]?.default
    if (asset) return { src: asset.src, alt }
  }

  return undefined
}
