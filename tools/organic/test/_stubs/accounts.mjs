/** Test stand-in for accounts.mjs (the real one is another agent's). ORGANIC_STUB_SIGNEDIN="tiktok:@tester,instagram:@ig" */
const table = Object.fromEntries((process.env.ORGANIC_STUB_SIGNEDIN ?? "").split(",").filter(Boolean).map((s) => s.split(":")));
export async function signedIn(page, platform) {
  return { connected: Boolean(table[platform]), friction: null };
}
export async function whoAmI(page, platform) {
  return table[platform] ?? null;
}
