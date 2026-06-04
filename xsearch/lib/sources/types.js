// The TikTok data-source contract.
// Every source (mock, scraper, Apify, Kalodata...) implements this same shape,
// so the rest of the app never cares WHERE the data came from.
//
// A source returns ProductSignal[] — raw market signal, BEFORE scoring/sourcing.
//
// @typedef {Object} ProductSignal
// @property {string} id            stable id (hash of title+source)
// @property {string} title         product name as seen on TikTok
// @property {string} [category]    inferred niche/category
// @property {number} [retailPrice] price seen in the video/shop, if any
// @property {Object} engagement    { views, likes, comments, shares }
// @property {number} [velocity]    growth signal (e.g. views/day), if the source provides it
// @property {string} [thumbnail]   image url
// @property {string} [sourceUrl]   link to the TikTok video / shop listing
// @property {Object} [raw]         original payload for debugging
//
// @typedef {Object} SearchOpts
// @property {number} [limit]       how many products to return (default 20)
// @property {number} [sinceDays]   recency window (default 7)
// @property {string} [region]      e.g. "US"
//
// @typedef {Object} TikTokSource
// @property {string} name
// @property {(query: string, opts?: SearchOpts) => Promise<ProductSignal[]>} search

export {};
