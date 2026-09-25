// Bundles js/app.js and everything it imports into dist/app.js, so the browser
// makes one request instead of walking a chain of CDN imports.
// The source keeps its CDN URLs; here they're redirected to the npm packages.
import * as esbuild from 'esbuild';

const cdnToNpm = {
  name: 'cdn-to-npm',
  setup(build) {
    build.onResolve({ filter: /^https:\/\/www\.gstatic\.com\/firebasejs\// }, async args => {
      const name = args.path.match(/firebase-([a-z]+)\.js$/)[1];
      return build.resolve(`firebase/${name}`, { kind: args.kind, resolveDir: process.cwd() });
    });
    build.onResolve({ filter: /^https:\/\/esm\.sh\/yjs@/ }, args =>
      build.resolve('yjs', { kind: args.kind, resolveDir: process.cwd() }));
  }
};

await esbuild.build({
  entryPoints: ['js/app.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: true,
  target: 'es2022',
  outfile: 'dist/app.js',
  plugins: [cdnToNpm],
  logLevel: 'info'
});
