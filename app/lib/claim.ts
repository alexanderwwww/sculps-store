/**
 * The one number the claim pop-up and the server both need.
 *
 * It lives here, in a module with no server code, because the pop-up is
 * rendered in the browser and the route file cannot pull a `.server` module
 * into anything but its loader and action -- the build refuses, correctly.
 * The server remains the authority on what was actually minted; the browser
 * only uses this to say what it is offering.
 */
export const CLAIM_EXTRA_CENTS = 500;
