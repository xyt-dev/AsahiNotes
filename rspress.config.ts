import * as path from 'node:path';
import { defineConfig } from '@rspress/core';
import katex from 'rspress-plugin-katex';
import mermaid from 'rspress-plugin-mermaid';

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
  plugins: [
    katex(),
    mermaid({
      mermaidConfig: {
        theme: 'base',
        themeVariables: {
          background: '#1e1e2e',
          primaryColor: '#313244',
          primaryTextColor: '#cdd6f4',
          primaryBorderColor: '#89b4fa',
          secondaryColor: '#45475a',
          secondaryTextColor: '#cdd6f4',
          secondaryBorderColor: '#b4befe',
          tertiaryColor: '#181825',
          tertiaryTextColor: '#cdd6f4',
          tertiaryBorderColor: '#6c7086',
          lineColor: '#bac2de',
          textColor: '#cdd6f4',
          mainBkg: '#313244',
          secondBkg: '#45475a',
          border1: '#89b4fa',
          border2: '#b4befe',
          noteBkgColor: '#f9e2af',
          noteTextColor: '#1e1e2e',
          noteBorderColor: '#fab387',
          errorBkgColor: '#f38ba8',
          errorTextColor: '#1e1e2e',
          fontFamily: 'inherit',
        },
      },
    }),
  ],
});
