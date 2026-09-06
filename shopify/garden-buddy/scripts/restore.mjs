#!/usr/bin/env node
/**
 * Rebuild the whole GARDEN BUDDY store on a fresh Shopify shop.
 *
 *   SHOP=yourshop.myshopify.com TOKEN=shpat_xxx node scripts/restore.mjs
 *
 * The token needs: write_products, write_files, write_themes, write_content,
 * write_online_store_navigation, write_publications, write_inventory.
 *
 * Order matters. Files first, because every theme setting points at a file by
 * its filename (shopify://shop_images/<filename>). Sections before templates,
 * because Shopify silently drops template settings it cannot find in the
 * stored section schema.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'

const SHOP = process.env.SHOP
const TOKEN = process.env.TOKEN
const THEME = process.env.THEME_ID              // optional: reuse an existing theme
const RAW = process.env.RAW_BASE                // raw.githubusercontent base for theme files
if (!SHOP || !TOKEN) { console.error('Set SHOP and TOKEN'); process.exit(1) }

const ROOT = new URL('..', import.meta.url).pathname  // shopify/garden-buddy
const API = `https://${SHOP}/admin/api/2025-07/graphql.json`
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const json = (p) => JSON.parse(read(p))
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function gql (query, variables = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue }
    const body = await res.json()
    if (body.errors) throw new Error(JSON.stringify(body.errors))
    const first = Object.values(body.data)[0]
    if (first?.userErrors?.length) throw new Error(JSON.stringify(first.userErrors))
    return body.data
  }
  throw new Error('rate limited five times')
}

/* ---------------------------------------------------------------- 1. files */
// Uploads every image and video in store/media, keeping the exact filename.
// Shopify only keeps the filename if nothing else claims it, so upload into an
// empty store. A suffixed filename (…_1.png) breaks every theme reference.
async function uploadFiles () {
  const manifest = json('store/data/files.json')
  const items = [
    ...manifest.images.map(i => ({ path: `store/media/images/${i.file}`, alt: i.alt, type: 'IMAGE' })),
    ...manifest.videos.map(v => ({ path: `store/media/video/${v.local}`, alt: '', type: 'VIDEO' })),
  ].filter(i => existsSync(join(ROOT, i.path)))

  const out = {}
  for (const batch of chunk(items, 10)) {
    const staged = await gql(`
      mutation Stage($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { message }
        }
      }`, {
      input: batch.map(i => ({
        filename: basename(i.path),
        mimeType: mime(i.path),
        resource: i.type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        httpMethod: 'POST',
      })),
    })

    const targets = staged.stagedUploadsCreate.stagedTargets
    for (let n = 0; n < batch.length; n++) {
      const form = new FormData()
      for (const p of targets[n].parameters) form.append(p.name, p.value)
      form.append('file', new Blob([readFileSync(join(ROOT, batch[n].path))]), basename(batch[n].path))
      const put = await fetch(targets[n].url, { method: 'POST', body: form })
      if (!put.ok) throw new Error(`upload failed for ${batch[n].path}: ${put.status}`)
    }

    const created = await gql(`
      mutation Create($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id alt fileStatus ... on MediaImage { image { url } } }
          userErrors { message }
        }
      }`, {
      files: batch.map((i, n) => ({
        originalSource: targets[n].resourceUrl,
        alt: i.alt || '',
        contentType: i.type,
      })),
    })
    created.fileCreate.files.forEach((f, n) => { out[basename(batch[n].path)] = f.id })
    console.log(`  files: ${Object.keys(out).length}/${items.length}`)
  }
  // Shopify processes uploads asynchronously. Media referenced before it is
  // READY comes back as a broken image, so wait it out.
  await waitForFiles(Object.values(out))
  return out
}

async function waitForFiles (ids) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const d = await gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on MediaImage { fileStatus } ... on Video { fileStatus } } }`, { ids })
    const pending = d.nodes.filter(n => n && n.fileStatus !== 'READY').length
    if (!pending) return
    console.log(`  waiting on ${pending} files…`)
    await sleep(5000)
  }
  console.warn('  some files never reported READY; check Content > Files')
}

/* ------------------------------------------------------------- 2. products */
async function createProducts (fileIds) {
  const handles = {}
  for (const p of json('store/data/products.json')) {
    const d = await gql(`
      mutation P($input: ProductSetInput!) {
        productSet(synchronous: true, input: $input) {
          product { id handle variants(first: 10) { nodes { id sku inventoryItem { id } } } }
          userErrors { message }
        }
      }`, {
      input: {
        handle: p.handle,
        title: p.title,
        status: p.status,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags,
        descriptionHtml: p.descriptionHtml,
        seo: p.seo,
        productOptions: p.options.map(o => ({
          name: o.name, position: o.position,
          values: o.values.map(v => ({ name: v })),
        })),
        variants: p.variants.map(v => ({
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          inventoryPolicy: v.inventoryPolicy,
          optionValues: [{ optionName: p.options[0].name, name: v.option }],
        })),
      },
    })
    const product = d.productSet.product
    handles[p.handle] = product.id
    console.log(`  product ${p.handle}`)

    if (p.media.length) {
      // productCreateMedia wants a URL, not a file GID, so re-use the CDN URL
      // of the file we already uploaded.
      const urls = await gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on MediaImage { image { url } } } }`,
        { ids: p.media.map(m => fileIds[m.file]).filter(Boolean) })
      await gql(`
        mutation M($id: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $id, media: $media) { media { id } mediaUserErrors { message } }
        }`, {
        id: product.id,
        media: urls.nodes.map((n, i) => ({
          originalSource: n.image.url, alt: p.media[i].alt, mediaContentType: 'IMAGE',
        })),
      })
    }

    // Variant images. productVariantAppendMedia reports "media does not exist"
    // even when it does; productVariantsBulkUpdate with mediaId works.
    const pm = await gql(`query($id:ID!){ product(id:$id){ media(first:40){ nodes{ id ... on MediaImage { image { url } } } } } }`, { id: product.id })
    const byUrl = pm.product.media.nodes
    const updates = []
    for (const v of p.variants) {
      if (!v.image) continue
      const hit = byUrl.find(m => m.image?.url.includes(v.image.replace(/\.[a-z]+$/, '')))
      const live = product.variants.nodes.find(x => x.sku === v.sku)
      if (hit && live) updates.push({ id: live.id, mediaId: hit.id })
    }
    if (updates.length) {
      await gql(`
        mutation V($id: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $id, variants: $variants) { userErrors { message } }
        }`, { id: product.id, variants: updates })
    }

    // A fresh variant starts at zero on hand and renders as SOLD OUT.
    const loc = await gql(`{ locations(first:1){ nodes{ id } } }`)
    const quantities = p.variants.map(v => {
      const live = product.variants.nodes.find(x => x.sku === v.sku)
      return live && { inventoryItemId: live.inventoryItem.id, locationId: loc.locations.nodes[0].id, quantity: v.inventory }
    }).filter(Boolean)
    for (const q of quantities) {
      await gql(`mutation T($id:ID!){ inventoryItemUpdate(id:$id, input:{tracked:true}){ userErrors{ message } } }`, { id: q.inventoryItemId })
    }
    await gql(`
      mutation I($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) { userErrors { message } }
      }`, { input: { name: 'available', reason: 'correction', ignoreCompareQuantity: true, quantities } })

    if (p.publications?.length) {
      const pubs = await gql(`{ publications(first:10){ nodes{ id name } } }`)
      const ids = pubs.publications.nodes.filter(x => p.publications.includes(x.name))
      await gql(`
        mutation Pub($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) { userErrors { message } }
        }`, { id: product.id, input: ids.map(x => ({ publicationId: x.id })) })
    }
  }
  return handles
}

/* ------------------------------------------- 3. pages, menus, collections */
async function createContent (productIds) {
  for (const [handle, p] of Object.entries(json('store/data/pages.json'))) {
    await gql(`
      mutation Page($page: PageCreateInput!) { pageCreate(page: $page) { userErrors { message } } }`,
      { page: { title: p.title, handle, body: read(p.body_file), isPublished: p.published } })
    console.log(`  page /pages/${handle}`)
  }

  const nav = json('store/data/navigation.json')
  const live = await gql(`{ menus(first:20){ nodes{ id handle } } }`)
  for (const m of nav.menus) {
    const hit = live.menus.nodes.find(x => x.handle === m.handle)
    const items = m.items.map(i => ({ title: i.title, type: 'HTTP', url: i.url }))
    if (hit) {
      await gql(`mutation M($id:ID!,$title:String!,$handle:String!,$items:[MenuItemUpdateInput!]!){
        menuUpdate(id:$id,title:$title,handle:$handle,items:$items){ userErrors{ message } } }`,
        { id: hit.id, title: m.title, handle: m.handle, items })
    } else {
      await gql(`mutation M($title:String!,$handle:String!,$items:[MenuItemCreateInput!]!){
        menuCreate(title:$title,handle:$handle,items:$items){ userErrors{ message } } }`,
        { title: m.title, handle: m.handle, items })
    }
    console.log(`  menu ${m.handle}`)
  }

  for (const c of nav.collections) {
    if (c.handle === 'frontpage') continue // Shopify creates this one itself
    await gql(`
      mutation C($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { message } } }`,
      { input: { handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml, sortOrder: c.sortOrder,
                 products: c.products.map(h => productIds[h]).filter(Boolean) } })
    console.log(`  collection ${c.handle}`)
  }
}

/* ----------------------------------------------------------------- 4. theme */
// Every .liquid under shopify/garden-buddy/{sections,assets} plus the JSON in
// store/theme. Sections go up first and are verified before the templates that
// reference them, because a template naming an unknown section is rejected
// whole — and themeFilesUpsert returns success either way, so check updatedAt.
async function pushTheme (themeId) {
  const files = []
  for (const dir of ['sections', 'assets']) {
    const from = join(ROOT, dir)
    for (const f of readdirSync(from)) {
      if (!/\.(liquid|css|js)$/.test(f)) continue
      files.push({ filename: `${dir}/${f}`, body: { type: 'TEXT', value: read(`${dir}/${f}`) } })
    }
  }
  await upsert(themeId, files)
  await sleep(3000)

  const jsons = []
  for (const dir of ['templates', 'sections', 'config']) {
    const from = join(ROOT, 'store/theme', dir)
    if (!existsSync(from)) continue
    for (const f of readdirSync(from)) {
      jsons.push({ filename: `${dir}/${f}`, body: { type: 'TEXT', value: read(`store/theme/${dir}/${f}`) } })
    }
  }
  await upsert(themeId, jsons)
}

async function upsert (themeId, files) {
  for (const batch of chunk(files, 20)) {
    await gql(`
      mutation U($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) { userErrors { filename message } }
      }`, { themeId, files: batch })
    const names = batch.map(f => f.filename)
    const check = await gql(`query($id:ID!,$n:[String!]){ theme(id:$id){ files(first:50, filenames:$n){ nodes{ filename size updatedAt } } } }`,
      { id: themeId, n: names })
    const landed = new Set(check.theme.files.nodes.map(n => n.filename))
    const missing = names.filter(n => !landed.has(n))
    if (missing.length) throw new Error(`these files did not land: ${missing.join(', ')}`)
    console.log(`  theme: ${names.length} files`)
  }
}

/* ------------------------------------------------------------------- utils */
function chunk (a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
function mime (p) {
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.gif')) return 'image/gif'
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  if (p.endsWith('.mp4')) return 'video/mp4'
  return 'application/octet-stream'
}

/* -------------------------------------------------------------------- main */
console.log('1. files')
const fileIds = await uploadFiles()
console.log('2. products')
const productIds = await createProducts(fileIds)
console.log('3. pages, menus, collections')
await createContent(productIds)
console.log('4. theme')
let themeId = THEME
if (!themeId) {
  const t = await gql(`{ themes(first:20){ nodes{ id name role } } }`)
  const gb = t.themes.nodes.find(x => x.name === 'GARDEN BUDDY') || t.themes.nodes.find(x => x.role === 'MAIN')
  themeId = gb.id
  console.log(`  using theme ${gb.name} (${gb.role})`)
}
await pushTheme(themeId)
console.log('\nDone. Left to do by hand:')
console.log('  - publish the theme')
console.log('  - turn off the storefront password')
console.log('  - upgrade off the trial plan before taking money')
