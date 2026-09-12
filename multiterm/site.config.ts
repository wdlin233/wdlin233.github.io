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
    mode: 'select',
    default: 'catppuccin-mocha',
    include: [
      'catppuccin-mocha',
      'catppuccin-latte',
      'github-dark',
      'github-light',
      'gruvbox-dark-medium',
      'rose-pine',
      'tokyo-night',
      'min-light',
    ],
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
