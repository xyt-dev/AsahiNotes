import * as path from "node:path";
import { defineConfig } from "@rspress/core";
import katex from "rspress-plugin-katex";
import mermaid from "rspress-plugin-mermaid";

export default defineConfig({
	root: path.join(__dirname, "docs"),
	title: "AsahiNotes",
	icon: "/rspress-icon.png",
	// logo: {
	//   light: '/rspress-light-logo.png',
	//   dark: '/rspress-dark-logo.png',
	// },
	themeConfig: {
		socialLinks: [],
	},
	markdown: {
		shiki: {
			onError(error) {
				if (
					error instanceof Error &&
					error.message.includes("Language `math`")
				) {
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
				theme: "base",
				themeVariables: {
					background: "#282828",
					primaryColor: "#3c3836",
					primaryTextColor: "#ebdbb2",
					primaryBorderColor: "#83a598",
					secondaryColor: "#504945",
					secondaryTextColor: "#ebdbb2",
					secondaryBorderColor: "#8ec07c",
					tertiaryColor: "#1d2021",
					tertiaryTextColor: "#d5c4a1",
					tertiaryBorderColor: "#7c6f64",
					lineColor: "#a89984",
					textColor: "#ebdbb2",
					mainBkg: "#3c3836",
					secondBkg: "#504945",
					border1: "#83a598",
					border2: "#8ec07c",
					noteBkgColor: "#fabd2f",
					noteTextColor: "#282828",
					noteBorderColor: "#fe8019",
					errorBkgColor: "#fb4934",
					errorTextColor: "#282828",
					fontFamily: "inherit",
				},
			},
		}),
	],
});
