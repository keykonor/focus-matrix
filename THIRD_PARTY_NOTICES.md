# Third-party software

Focus Matrix's original source is available under the MIT license in LICENSE.
Third-party components retain their own licenses. This project does not claim
exclusive ownership of its dependencies or bundled upstream code.

- React, React DOM, Vite, TypeScript, Vitest and the Tauri JavaScript packages:
  see the license files distributed with the exact packages in package-lock.json.
- Tauri, its plugins, reqwest and other Rust dependencies: see the individual
  crate license declarations for the versions pinned by src-tauri/Cargo.lock.
- The vendored Sites Vite plugin's MIT notice is retained at
  cloud-site/build/sites-vite-plugin.LICENSE (copyright OpenAI).
- The vendored shadcn license is retained at
  cloud-site/vendor/shadcn-tailwind-4.13.0.LICENSE.md.
- Next.js, vinext, Cloudflare tooling and other web dependencies retain the
  notices supplied by the packages in cloud-site/package-lock.json.
- NSIS and Microsoft WebView2 are separate components, with their own licenses.
  Downloading an installer does not grant rights beyond those component licenses.

No third-party fonts, stock photos or music are intentionally bundled. The
repository's icon source/provenance has not been independently verified. No
additional rights in external trademarks or assets are asserted here.

For an exact installed dependency tree use `npm ls --all` and `cargo tree
--manifest-path src-tauri/Cargo.toml --locked`; retain the corresponding upstream
license texts when redistributing those components. This notice is an index,
not a substitute for the upstream license files.
