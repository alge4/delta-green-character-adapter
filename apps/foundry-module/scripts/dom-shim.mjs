/**
 * Minimal DOM surface for registerFoundryModule / mountImportWizardUi diagnosis.
 * Enough for HTMLElement instanceof checks, createElement, querySelector, and append.
 */

class ClassList {
  constructor(owner) {
    this._owner = owner;
    this._tokens = new Set();
  }

  add(...tokens) {
    for (const token of tokens) {
      this._tokens.add(String(token));
    }
    this._owner.className = [...this._tokens].join(" ");
  }

  contains(token) {
    return this._tokens.has(String(token));
  }
}

class ElementShim {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = {};
    this.textContent = "";
    this.className = "";
    this.classList = new ClassList(this);
    this._listeners = new Map();
  }

  get nodeType() {
    return 1;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (typeof node === "string") {
        this.textContent += node;
        continue;
      }
      node.parentElement = this;
      this.children.push(node);
    }
  }

  insertBefore(node, reference) {
    if (node.parentElement) {
      node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
    }
    node.parentElement = this;
    if (reference == null) {
      this.children.push(node);
      return node;
    }
    const index = this.children.indexOf(reference);
    if (index === -1) {
      this.children.push(node);
    } else {
      this.children.splice(index, 0, node);
    }
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) {
      child.parentElement = null;
    }
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }

  remove() {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const queue = [...this.children];
    while (queue.length > 0) {
      const node = queue.shift();
      if (matchesSelector(node, selector)) {
        return node;
      }
      queue.push(...node.children);
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const queue = [...this.children];
    while (queue.length > 0) {
      const node = queue.shift();
      if (matchesSelector(node, selector)) {
        found.push(node);
      }
      queue.push(...node.children);
    }
    return found;
  }

  addEventListener(type, listener) {
    const list = this._listeners.get(type) ?? [];
    list.push(listener);
    this._listeners.set(type, list);
  }
}

function matchesSimple(node, simple) {
  const trimmed = simple.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith(".")) {
    return node.classList.contains(trimmed.slice(1)) || node.className.split(/\s+/).includes(trimmed.slice(1));
  }
  if (trimmed.startsWith("[")) {
    const contains = /^\[([^=\]]+)\*=['"]([^'"]+)['"]\]$/.exec(trimmed);
    if (contains) {
      const actual = node.getAttribute(contains[1]);
      return actual !== null && actual.includes(contains[2]);
    }
    const match = /^\[([^=\]]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/.exec(trimmed);
    if (!match) {
      return false;
    }
    const [, name, expected] = match;
    const actual = node.getAttribute(name);
    if (expected === undefined) {
      return actual !== null;
    }
    return actual === expected;
  }
  return node.tagName === trimmed.toUpperCase();
}

function matchesSelector(node, selector) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      // Support only simple, space-free compound selectors used by register/mount.
      const tokens = part.match(/(\.[a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z][a-zA-Z0-9_-]*)/g) ?? [];
      return tokens.every((token) => matchesSimple(node, token));
    });
}

class HTMLElementShim extends ElementShim {}

export function installDomShim() {
  globalThis.HTMLElement = HTMLElementShim;
  globalThis.document = {
    createElement(tagName) {
      return new HTMLElementShim(tagName);
    },
  };
  globalThis.getComputedStyle = () => ({ position: "static" });
  return {
    HTMLElement: HTMLElementShim,
    createElement: (tagName) => new HTMLElementShim(tagName),
  };
}

export function createApplicationRoot(dom = installDomShim()) {
  const root = dom.createElement("div");
  root.classList.add("application");
  const header = dom.createElement("header");
  header.classList.add("window-header");
  const title = dom.createElement("h1");
  title.classList.add("window-title");
  title.textContent = "Agent: Test";
  const toggle = dom.createElement("button");
  toggle.classList.add("header-control", "icon");
  toggle.setAttribute("data-action", "toggleControls");
  toggle.setAttribute("aria-label", "Toggle Controls");
  const close = dom.createElement("button");
  close.classList.add("header-control", "icon");
  close.setAttribute("data-action", "close");
  header.append(title, toggle, close);
  const bio = dom.createElement("div");
  bio.setAttribute("data-tab", "bio");
  root.append(header, bio);
  return { root, header, bio };
}
