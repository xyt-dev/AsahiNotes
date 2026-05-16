import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import katex from 'rspress-plugin-katex';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'AsahiNotes',
  icon: '/rspress-icon.png',
  // logo: {
  //   light: '/rspress-light-logo.png',
  //   dark: '/rspress-dark-logo.png',
  // },
  themeConfig: {
    socialLinks: [
    ],
  },
  markdown: {
    shiki: {
      onError(error) {
        if (error instanceof Error && error.message.includes('Language `math`')) {
          return;
        }
        throw error;
      },
    },
  },
  plugins: [katex()],
});
