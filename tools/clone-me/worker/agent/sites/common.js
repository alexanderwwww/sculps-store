/**
 * sites/common.js — the finders every recipe is built out of.
 *
 * Role, aria-label, visible text. Never a generated class name. Every finder
 * returns null when it finds nothing, so a recipe can say "I could not find
 * the like button" instead of pressing whatever happened to be nearby.
 */
(function (root) {
  "use strict";
  var O = root.__organicNS || (root.__organicNS = {});
  if (O.find) return;
  O.sites = O.sites || {};

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var st = root.getComputedStyle ? root.getComputedStyle(el) : null;
    if (st && (st.visibility === "hidden" || st.display === "none" || st.opacity === "0"))
      return false;
    return true;
  }

  function all(sel, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(sel));
  }

  /** Elements whose aria-label matches, exactly or by a regexp. */
  function byLabel(match, scope) {
    var test =
      match instanceof RegExp
        ? function (v) {
            return match.test(v);
          }
        : function (v) {
            return v.toLowerCase() === String(match).toLowerCase();
          };
    return all("[aria-label]", scope).filter(function (el) {
      return test((el.getAttribute("aria-label") || "").trim()) && visible(el);
    });
  }

  function oneByLabel(match, scope) {
    var hits = byLabel(match, scope);
    return hits.length ? hits[0] : null;
  }

  /** Elements with an explicit or implicit role. */
  function byRole(role, scope) {
    var implicit = { button: "button", link: "a[href]", textbox: "input,textarea" }[role] || "";
    var sel = '[role="' + role + '"]' + (implicit ? "," + implicit : "");
    return all(sel, scope).filter(visible);
  }

  /** The first element of a role whose visible text matches. */
  function byText(role, match, scope) {
    var test =
      match instanceof RegExp
        ? function (v) {
            return match.test(v);
          }
        : function (v) {
            return v.toLowerCase().indexOf(String(match).toLowerCase()) >= 0;
          };
    var hits = byRole(role, scope).filter(function (el) {
      return test(((el.innerText || el.textContent || "") + "").replace(/\s+/g, " ").trim());
    });
    return hits.length ? hits[0] : null;
  }

  /** A text field: role=textbox, contenteditable, or a labelled input. */
  function field(match, scope) {
    var labelled = byLabel(match, scope).filter(function (el) {
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable ||
        el.getAttribute("role") === "textbox"
      );
    });
    if (labelled.length) return labelled[0];
    var ph = all("input[placeholder],textarea[placeholder]", scope).filter(function (el) {
      var p = el.getAttribute("placeholder") || "";
      return (match instanceof RegExp ? match.test(p) : p.toLowerCase().indexOf(String(match).toLowerCase()) >= 0) && visible(el);
    });
    if (ph.length) return ph[0];
    var ce = all('[contenteditable="true"],[role="textbox"]', scope).filter(visible);
    return ce.length ? ce[0] : null;
  }

  /** The nearest ancestor that behaves like a button (for an icon inside one). */
  function clickable(el) {
    var n = el;
    for (var i = 0; n && i < 6; i++, n = n.parentElement) {
      if (!n.tagName) continue;
      if (n.tagName === "BUTTON" || n.getAttribute("role") === "button" || n.tagName === "A")
        return n;
    }
    return el;
  }

  O.find = {
    visible: visible,
    all: all,
    byLabel: byLabel,
    oneByLabel: oneByLabel,
    byRole: byRole,
    byText: byText,
    field: field,
    clickable: clickable,
  };
})(window);
