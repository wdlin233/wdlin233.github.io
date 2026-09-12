import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const posts = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '**/*.mdx'],
    base: './src/content/blog',
    generateId: ({ entry, data }) =>
      typeof data.slug === 'string' ? data.slug : entry.replace(/\.(md|mdx)$/, ''),
  }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string(),
        pubDatetime: z.coerce.date(),
        modDatetime: z.coerce.date().nullable().optional(),
        description: z.string(),
        author: z.string().default('wdlin'),
        tags: z.array(z.string()).default([]),
        draft: z.boolean().default(false),
        featured: z.boolean().default(false),
        hideFromHome: z.boolean().default(false),
        canonicalURL: z.string().optional(),
        ogImage: image().or(z.string()).optional(),
        series: z.string().optional(),
        coverImage: z.object({ src: image(), alt: z.string() }).optional(),
        toc: z.boolean().default(true),
      })
      .transform((data) => ({
        ...data,
        published: data.pubDatetime,
        updated: data.modDatetime,
      })),
})

const home = defineCollection({
  loader: glob({ pattern: 'home.md', base: './multiterm/content' }),
  schema: ({ image }) =>
    z.object({
      avatarImage: z
        .object({ src: image(), alt: z.string().default('My avatar') })
        .optional(),
      githubCalendar: z.string().optional(),
    }),
})

const pages = defineCollection({
  loader: glob({ pattern: ['about.md', 'links.md'], base: './src/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    layout: z.string().optional(),
  }),
})

export const collections = { posts, home, pages }
