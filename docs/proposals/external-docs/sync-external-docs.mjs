#!/usr/bin/env node
// Sync reference pages from tool repositories into the docs tree.
//
// Reads ../external-docs.json, fetches each source at the given ref (a sparse,
// shallow git checkout), and writes the Markdown files into the docs tree with:
//   - front matter: title, `custom_edit_url` pointing to the source file (so
//     "Edit this page" sends contributors upstream), `format: md` (CommonMark,
//     no MDX surprises), and the source commit;
//   - links to files that are synced too kept relative; links to anything else
//     rewritten to absolute GitHub URLs at the synced commit;
//   - a note at the top saying where the page comes from.
// The destination directory is fully regenerated: never edit it by hand.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Prototype location: docs/proposals/external-docs/. Once adopted, move the
// script to docs/scripts/ and the manifest to docs/external-docs.json.
const here = path.dirname(fileURLToPath(import.meta.url))
const siteDir = path.resolve(here, '../..')
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'external-docs.json'), 'utf8'))
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

for (const src of manifest.sources) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xo-docs-sync-'))
  try {
    git(['clone', '--quiet', '--depth=1', '--filter=blob:none', '--sparse', '--branch', src.ref, `https://github.com/${src.repo}.git`, tmp])
    git(['sparse-checkout', 'set', src.from], tmp)
    const sha = git(['rev-parse', 'HEAD'], tmp)
    const srcDir = path.join(tmp, src.from)
    const destDir = path.join(siteDir, src.to)
    fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })

    const files = fs.readdirSync(srcDir, { recursive: true }).filter(f => f.endsWith('.md'))
    const synced = new Set(files.map(f => path.join(src.from, f)))
    const blob = p => `https://github.com/${src.repo}/blob/${sha}/${p}`

    for (const rel of files) {
      const srcPath = path.join(src.from, rel)
      let body = fs.readFileSync(path.join(srcDir, rel), 'utf8')

      // Title: first H1, removed from the body (Docusaurus renders the title)
      const h1 = body.match(/^# (.+)$/m)
      const title = h1 ? h1[1].trim() : path.basename(rel, '.md')
      if (h1) body = body.replace(h1[0], '')

      // Rewrite relative links that point outside the synced set
      body = body.replace(/\]\(\s*([^)\s#][^)\s]*?)(#[^)\s]*)?\s*\)/g, (m, target, anchor = '') => {
        if (/^[a-z]+:/i.test(target)) return m // absolute URL
        const resolved = path.normalize(path.join(path.dirname(srcPath), target))
        if (synced.has(resolved)) return m // stays relative, Docusaurus resolves it
        return `](${blob(resolved)}${anchor})`
      })

      const frontMatter = [
        '---',
        `title: ${JSON.stringify(title)}`,
        `custom_edit_url: ${blob(srcPath).replace(`/blob/${sha}/`, `/edit/${src.ref}/`)}`,
        'format: md',
        `source_repo: ${src.repo}`,
        `source_commit: ${sha}`,
        '---',
        '',
        ':::note Synced page',
        `This page comes from the [${src.repo}](https://github.com/${src.repo}) repository ([source](${blob(srcPath)})). To change it, edit it there: it is copied here automatically.`,
        ':::',
        '',
        '',
      ].join('\n')

      const out = path.join(destDir, rel)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, frontMatter + body.replace(/^\s+/, ''))
    }

    fs.writeFileSync(
      path.join(destDir, '_category_.json'),
      JSON.stringify({ label: src.label, position: src.position, link: { type: 'generated-index' } }, null, 2) + '\n'
    )
    console.log(`${src.repo}@${sha.slice(0, 12)}: ${files.length} page(s) -> ${src.to}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
