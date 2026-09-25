import type { SiteConfig } from '~/types'

const config: SiteConfig = {
  site: 'https://blog.wdlin.com',
  title: "wdlin's Blog",
  description: 'A blog.',
  author: 'wdlin',
  tags: [],
  socialCardAvatarImage: '',
  font: 'JetBrains Mono Variable',
  pageSize: 8,
  trailingSlashes: true,
  navLinks: [
    { name: 'Home', url: '/' },
    { name: 'Posts', url: '/posts/' },
    { name: 'Tags', url: '/tags/' },
    { name: 'Links', url: '/links/' },
    { name: 'About', url: '/about/' },
  ],
  themes: {
    mode: 'light-dark-auto',
    default: 'github-light',
    include: ['github-light', 'github-dark'],
    overrides: {
      'github-light': {
        accent: '#0969da',
        link: '#0969da',
        heading1: '#0969da',
        heading2: '#0969da',
        heading3: '#0969da',
        heading4: '#0969da',
        heading5: '#0969da',
        heading6: '#0969da',
        list: '#0969da',
        separator: '#d0d7de',
      },
      'github-dark': {
        accent: '#1F7ACB',
        link: '#1F7ACB',
        heading1: '#1F7ACB',
        heading2: '#1F7ACB',
        heading3: '#1F7ACB',
        heading4: '#1F7ACB',
        heading5: '#1F7ACB',
        heading6: '#1F7ACB',
        list: '#1F7ACB',
        separator: '#30363d',
      },
    },
  },
  socialLinks: {
    github: 'https://github.com/wdlin233',
    email: 'wdlin233@163.com',
    rss: true,
  },
  giscus: undefined,
  characters: {},
}

export default config
