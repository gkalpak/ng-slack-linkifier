javascript:/* eslint-disable-line no-unused-labels *//*
 * # NgSlackLinkifier vX.Y.Z-VERSION
 *
 * ## What it does
 *
 * **It converts...**
 *
 * - Markdown-like links (of the form `[some text](/some/url)`) to actual links.
 *
 * - URLs to GitHub issues/PRs to short links. E.g.:
 *   - `https://github.com/angular/angular/issues/12345` --> `#12345`
 *   - `https://github.com/angular/angular-cli/pull/23456` --> `angular-cli#23456`
 *   - `https://github.com/not-angular/some-lib/pull/34567` --> `not-angular/material2#34567`
 *
 * - GitHub issues/PRs of the format `[[<owner>/]<repo>]#<issue-or-pr>` to links. If omitted `<owner>` and `<repo>`
 *   default to `angular`. E.g.:
 *   - `#12345` or `angular#12345` or `angular/angular#12345` -->
 *     `[#12345](https://github.com/angular/angular/issues/12345)`
 *   - `angular-cli#23456` --> link to `https://github.com/angular/angular-cli/issues/23456`
 *   - `not-angular/some-lib#12345` --> link to `https://github.com/not-angular/some-lib/issues/34567`
 *
 * - URLs to Jira-like issues for `angular-team` to short links. (Recognizes the format `XYZ-<number>`.) E.g.:
 *   - `https://angular-team.atlassian.net/browse/FW-12345` --> `FW-12345`
 *   - `https://angular-team.atlassian.net/browse/TOOL-23456` --> `TOOL-23456`
 *   - `https://angular-team.atlassian.net/browse/COMP-34567` --> `COMP-34567`
 *
 * - Jira-like issues for `angular-team` to links. (Recognizes the format `XYZ-<number>`.) E.g.:
 *   - `FW-12345` --> `[FW-12345](https://angular-team.atlassian.net/browse/FW-12345)`
 *   - `TOOL-23456` --> `[TOOL-23456](https://angular-team.atlassian.net/browse/TOOL-23456)`
 *   - `COMP-34567` --> `[COMP-34567](https://angular-team.atlassian.net/browse/COMP-34567)`
 *
 * **It shows...**
 *
 * - Popups with basic info (title, description, author, state, labels), when hovering over links to GitHub issues/PRs.
 *
 * ---
 * **Note:**
 * Currently, GitHub URLs are recognized if they end in the GitHub issue/PR number.
 * E.g. `.../issues/12345` is recongized, but `.../issues/12345/files` or `.../issues/12345#issuecomment-67890` isn't.
 */
(() => {'use strict';

  /* Constants */
  const NAME = 'NgSlackLinkifier';
  const VERSION = 'X.Y.Z-VERSION';

  const CLASS_GITHUB_LINK = 'nsl-github';
  const CLASS_JIRA_LINK = 'nsl-jira';
  const CLASS_PROCESSED = 'nsl-processed';
  const CLASS_POST_PROCESSED = 'nsl-post-processed';

  /*
   * Encoded entities need to be broken up, so that they are not auto-decoded, when the script is used as a bookmarklet.
   * (NOTE: The used method for breaking up those entities should survive minification.)
   */
  const P = '%';

  /* Classes */
  class Deferred {
    constructor() {
      this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
    }
  }

  class GithubUtils {
    constructor(token) {
      this._cacheMaxAge = 60000;
      this._cache = new Map();

      this._headers = token && {Authorization: `token ${token}`};
    }

    cleanUp() {
      this._cache.clear();
    }

    getIssueInfo(owner, repo, issue) {
      const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}`;
      return this._getJson(url).
        then(data => ({
          number: issue,
          title: data.title,
          description: data.body.trim(),
          author: {
            avatar: data.user.avatar_url,
            username: data.user.login,
            url: data.user.html_url,
          },
          state: data.state,
          labels: data.labels.map(l => l.name),
        })).
        catch(err => {
          throw new Error(`Error getting GitHub info for ${owner}/${repo}#${issue}:\n${err.message || err}`);
        });
    }

    async _getErrorForResponse(res) {
      const headers = res.headers;
      let data = await res.json();

      if (!data.message) data = {message: JSON.stringify(data)};

      if ((res.status === 403) && (headers.get('X-RateLimit-Remaining') == '0')) {
        const limit = headers.get('X-RateLimit-Limit');
        const reset = new Date(headers.get('X-RateLimit-Reset') * 1000);

        data.message = `0/${limit} API requests remaining until ${reset.toLocaleString()}.\n${data.message}`;
      }

      return new Error(`${res.status} (${res.statusText}) - ${data.message}`);
    }

    _getFromCache(url) {
      if (!this._cache.has(url)) return undefined;

      const {date, response} = this._cache.get(url);

      if ((Date.now() - date) > this._cacheMaxAge) {
        this._cache.delete(url);
        return undefined;
      }

      return response;
    }

    _getJson(url) {
      let response = this._getFromCache(url);

      if (!response) {
        response = fetch(url, {headers: this._headers}).
          then(async res => res.ok ? res.json() : Promise.reject(await this._getErrorForResponse(res))).
          catch(err => {
            if (this._getFromCache(url) === response) this._cache.delete(url);
            throw err;
          });

        this._cache.set(url, {date: Date.now(), response});
      }

      return response;
    }
  }

  class IgnoredError extends Error {
  }

  class InMemoryStorage {
    /* An in-memory implementation of the `Storage` interface. */

    get length() { return this._keys().length; }

    constructor() {
      this._resetItems();
    }

    clear() {
      this._resetItems();
    }

    getItem(key) {
      return this._has(key) ? this._items[key] : null;
    }

    key(index) {
      const keys = this._keys();
      return (index < keys.length) ? keys[index] : null;
    }

    removeItem(key) {
      delete this._items[key];
    }

    setItem(key, value) {
      this._items[key] = `${value}`;
    }

    _has(key) {
      return Object.prototype.hasOwnProperty.call(this._items, key);
    }

    _keys() {
      return Object.keys(this._items);
    }

    _resetItems() {
      this._items = Object.create(null);
    }
  }

  class Linkifier {
    constructor(postProcessNode = () => undefined) {
      this._postProcessNode = postProcessNode;
      this._observer = new MutationObserver(mutations =>
        mutations.forEach(m =>
          /* Delay processing to allow Slack complete it's own DOM manipulation (e.g. converting URLs to links). */
          m.addedNodes && setTimeout(() => this.processAll(m.addedNodes), 500)));
    }

    cleanUp() {
      this._observer.disconnect();
    }

    observe(elem) {
      this._observer.observe(elem, {childList: true, subtree: true});
    }

    processAll(nodes, forcePostProcess = false) {
      /*
       * - `.c-message__body`: Normal messages.
       * - `.c-message_attachment__body`: Attachments (e.g. posted by GeekBot in #fw-standup).
       * - `.c-message_kit__text`: Thread messages.
       */
      const selectors = '.c-message__body, .c-message_attachment__body, .c-message_kit__text';
      const processedParents = new Set();

      nodes.forEach(n => {
        if (processedParents.has(n.parentNode)) return;

        const isAncestorOfInterest = n.closest ?
          n.closest(selectors) :
          (n.parentNode && n.parentNode.closest(selectors));

        if (isAncestorOfInterest) {
          /* A child of a message body element was added. */
          this._processNode(n.parentNode, forcePostProcess);
        } else if (n.querySelectorAll) {
          /* An element that might contain message bodies was added. */
          n.querySelectorAll(selectors).forEach(n => this._processNode(n, forcePostProcess));
        }
      });
    }

    _acceptNodeInTextNodeWalker(node) {
      return (node.parentNode &&
          (node.parentNode.nodeName !== 'A') &&
          (!node.parentNode.parentNode || (node.parentNode.parentNode.nodeName !== 'A'))) ?
        NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }

    _processNode(node, forcePostProcess) {
      const processedNodes = new Set([
        ...this._processNodeMdLinks(node),
        ...this._processNodeGithub(node),
        ...this._processNodeJira(node),
      ]);

      processedNodes.forEach(n => n.classList.add(CLASS_PROCESSED));
      if (forcePostProcess || processedNodes.size) this._postProcessNode(node);
    }

    /* Process GitHub-like issues/PRs. */
    _processNodeGithub(node) {
      const processedNodes = new Set();

      const acceptNode = x => this._acceptNodeInTextNodeWalker(x);
      const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {acceptNode}, false);
      let t;

      while ((t = treeWalker.nextNode())) {
        const textMatch = /(?:(?:([\w-]+)\/)?([\w-]+))?#(\d+)\b/.exec(t.textContent);

        if (textMatch) {
          const [, owner = 'angular', repo = 'angular', issue] = textMatch;
          const url = `https://github.com/${owner}/${repo}/issues/${issue}`;
          const link = Object.assign(document.createElement('a'), {
            href: url,
            target: '_blank',
            textContent: url,
          });

          const trailingText = document.createTextNode(t.textContent.slice(textMatch.index + textMatch[0].length));

          t.textContent = t.textContent.slice(0, textMatch.index);
          t.after(link);
          link.after(trailingText);

          processedNodes.add(link);
        }
      }

      node.querySelectorAll(`a:not(.${CLASS_PROCESSED})`).forEach(link => {
        const hrefMatch = /^https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/(?:issues|pull)\/(\d+)$/.exec(link.href) ||
          /* eslint-disable-next-line max-len */
          new RegExp(`^https://slack-redir\\.net/link\\?url=https${P}3A${P}2F${P}2Fgithub\\.com${P}2F([\\w-]+)${P}2F([\\w-]+)${P}2F(?:issues|pull)${P}2F(\\d+)$`).exec(link.href);

        if (hrefMatch) {
          const [, owner, repo, issue] = hrefMatch;

          link.classList.add(CLASS_GITHUB_LINK);
          link.dataset.nslOwner = owner;
          link.dataset.nslRepo = repo;
          link.dataset.nslNumber = issue;

          processedNodes.add(link);
        }

        const htmlMatch = /^https:\/\/github\.com\/([\w-]+)\/([\w-]+)\/(?:issues|pull)\/(\d+)$/.exec(link.innerHTML);

        if (htmlMatch) {
          const [, owner, repo, issue] = htmlMatch;

          const isOwnerNg = owner === 'angular';
          const isRepoNg = repo === 'angular';
          const repoSlug = `${isOwnerNg ? '' : `${owner}/`}${(isOwnerNg && isRepoNg) ? '' : repo}`;

          link.innerHTML = `<b>${repoSlug}#${issue}</b>`;

          processedNodes.add(link);
        }
      });

      return processedNodes;
    }

    /* Process Jira-like issues. */
    _processNodeJira(node) {
      const processedNodes = new Set();

      const acceptNode = x => this._acceptNodeInTextNodeWalker(x);
      const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {acceptNode}, false);
      let t;

      while ((t = treeWalker.nextNode())) {
        const textMatch = /(?<!https:\/\/angular-team\.atlassian\.net\/browse\/)\b([A-Z]+-\d+)\b/.exec(t.textContent);

        if (textMatch) {
          const url = `https://angular-team.atlassian.net/browse/${textMatch[1]}`;
          const link = Object.assign(document.createElement('a'), {
            href: url,
            target: '_blank',
            textContent: url,
          });

          const trailingText = document.createTextNode(t.textContent.slice(textMatch.index + textMatch[0].length));

          t.textContent = t.textContent.slice(0, textMatch.index);
          t.after(link);
          link.after(trailingText);

          processedNodes.add(link);
        }
      }

      node.querySelectorAll(`a:not(.${CLASS_PROCESSED})`).forEach(link => {
        const hrefMatch = /^https:\/\/angular-team\.atlassian\.net\/browse\/([A-Z]+-\d+)$/.exec(link.href) ||
          /* eslint-disable-next-line max-len */
          new RegExp(`^https://slack-redir\\.net/link\\?url=https${P}3A${P}2F${P}2Fangular-team\\.atlassian\\.net${P}2Fbrowse${P}2F([A-Z]+-\\d+)$`).exec(link.href);

        if (hrefMatch) {
          link.classList.add(CLASS_JIRA_LINK);
          link.dataset.nslNumber = hrefMatch[1];
          processedNodes.add(link);
        }

        const htmlMatch = /^https:\/\/angular-team\.atlassian\.net\/browse\/([A-Z]+-\d+)$/.exec(link.innerHTML);

        if (htmlMatch) {
          link.innerHTML = `<b>${htmlMatch[1]}</b>`;
          processedNodes.add(link);
        }
      });

      return processedNodes;
    }

    /* Process markdown-like links. */
    _processNodeMdLinks(node) {
      const processedNodes = new Set();

      node.querySelectorAll(`a:not(.${CLASS_PROCESSED})`).forEach(link => {
        const prev = link.previousSibling;
        const prevMatch = prev && (prev.nodeType === Node.TEXT_NODE) && /\[([^\]]+)]\(/.exec(prev.textContent);

        const next = prevMatch && link.nextSibling;
        const nextMatch = next && (next.nodeType === Node.TEXT_NODE) && /\)/.exec(next.textContent);

        if (nextMatch) {
          prev.textContent = prev.textContent.slice(0, -prevMatch[0].length);
          next.textContent = next.textContent.slice(nextMatch[0].length);

          link.innerHTML = `<b>${prevMatch[1]}</b>`;
          processedNodes.add(link);
        }
      });

      return processedNodes;
    }
  }

  class LogUtils {
    constructor(prefix) {
      this._prefix = `[${prefix}]`;
    }

    cleanUp() {
      /* Nothing to clean up. */
    }

    log(...args) {
      console.log(this._prefix, ...args);
    }

    warn(...args) {
      console.warn(this._prefix, ...args);
    }

    error(...args) {
      console.error(this._prefix, ...args);
    }
  }

  class Program {
    constructor() {
      this._KEYS = {
        githubToken: 1,
      };

      this._logUtils = new LogUtils(`${NAME} v${VERSION}`);
      this._secretUtils = new SecretUtils();
      this._storageUtils = new StorageUtils(NAME);
      this._linkifier = new Linkifier(node => this._addListeners(node));
      this._uiUtils = new UiUtils();
      this._ghUtils = null;

      this._cleanUpFns = [
        () => this._linkifier.cleanUp(),
        () => this._logUtils.cleanUp(),
        () => this._secretUtils.cleanUp(),
        () => this._storageUtils.cleanUp(),
        () => this._uiUtils.cleanUp(),
      ];

      this._destroyedDeferred = new Deferred();
    }

    cleanUp() {
      this._logUtils.log('Uninstalling...');

      this._destroyedDeferred.reject(new IgnoredError('Cleaning up.'));
      this._cleanUpFns.forEach(fn => fn());
      this._cleanUpFns = [];

      this._logUtils.log('Uninstalled.');
    }

    async main() {
      try {
        if (window.__ngSlackLinkifyCleanUp) window.__ngSlackLinkifyCleanUp();

        this._logUtils.log('Installing...');

        window.__ngSlackLinkifyCleanUp = () => {
          this.cleanUp();
          window.__ngSlackLinkifyCleanUp = null;
        };

        await Promise.race([this._init(), this._destroyedDeferred.promise]);

        const root = document.querySelector('#client_body');
        this._linkifier.processAll([root], true);
        this._linkifier.observe(root);

        this._logUtils.log('Installed.');
      } catch (err) {
        this._onError(err);
      }
    }

    _addListeners(node) {
      const processedNodes = new Set();

      node.querySelectorAll(`.${CLASS_GITHUB_LINK}:not(.${CLASS_POST_PROCESSED})`).forEach(link => {
        processedNodes.add(link);
        this._addListenersForLink(link, data => this._getPopupContentForGithubIssue(data));
      });

      node.querySelectorAll(`.${CLASS_JIRA_LINK}:not(.${CLASS_POST_PROCESSED})`).forEach(link => {
        processedNodes.add(link);
        this._addListenersForLink(link, data => this._getPopupContentForJira(data));
      });

      processedNodes.forEach(n => {
        n.classList.add(CLASS_POST_PROCESSED);
        this._cleanUpFns.push(() => n.classList.remove(CLASS_POST_PROCESSED));
      });
    }

    _addListenersForLink(link, getPopupContent) {
        const linkStyle = link.style;
        const linkData = link.dataset;
        const cursorStyle = 'help';
        let interactionId = 0;

        const onMouseenter = async evt => {
          try {
            const id = interactionId;

            await new Promise(resolve => setTimeout(resolve, 500));
            if (id !== interactionId) return;  /* Abort if already "mouseleft". */

            linkStyle.cursor = 'progress';

          const html = await getPopupContent(linkData);
            if (id !== interactionId) return;  /* Abort if already "mouseleft". */

            linkStyle.cursor = cursorStyle;

          this._uiUtils.showPopup(html, evt);
        } catch (err) {
          this._onError(err);
        }
      };

      const onMouseleave = () => {
        ++interactionId;
        linkStyle.cursor = cursorStyle;
        this._uiUtils.scheduleHidePopup(500);
      };

      linkStyle.cursor = cursorStyle;
      link.addEventListener('mouseenter', onMouseenter);
      link.addEventListener('mouseleave', onMouseleave);

      this._cleanUpFns.push(
        () => link.removeEventListener('mouseenter', onMouseenter),
        () => link.removeEventListener('mouseleave', onMouseleave));
    }

    async _getPopupContentForGithubIssue(data) {
      const colorPerState = {closed: 'red', draft: 'gray', merged: 'darkorchid', open: 'green'};

      const owner = data.nslOwner;
      const repo = data.nslRepo;
      const number = data.nslNumber;

      const info = await this._ghUtils.getIssueInfo(owner, repo, number);
            const description = info.description.replace(/^<!--[^]*?-->\s*/, '');

      return `
              <p style="display: flex; font-size: 0.75em; justify-content: space-between;">
                <span>
                  <img src="${info.author.avatar}" width="25" height="25" style="border-radius: 6px;" />
                  <a href="${info.author.url}" target="_blank">@${info.author.username}</a>
                </span>
                <span style="text-align: right;">
                  ${info.labels.sort().map(l => `
                    <small style="
                          border: 1px solid;
                          border-radius: 6px;
                          line-height: 2.5em;
                          margin: 0 3px;
                          padding: 2px 4px;
                          text-align: center;
                          white-space: nowrap;
                        ">${l}</small>
                  `).join('\n')}
                </span>
              </p>
              <p style="align-items: flex-start; display: flex; font-size: 1.25em;">
                <span style="
                      background-color: ${colorPerState[info.state]};
                      border-radius: 6px;
                      color: white;
                      font-size: 0.75em;
                      justify-content: center;
                      margin-right: 5px;
                      padding: 2px 4px;
                      text-align: center;
                    ">
                  ${info.state.toUpperCase()}
                </span>
                <b>${info.title}</b>
          <span style="color: gray; margin-left: 5px;">#${info.number}</span>
              </p>
              <br />
              <pre>${description}</pre>
            `;
          }

    async _getPopupContentForJira(data) {
        /* TODO(gkalpak): Implement popup for Jira issues. */
      return `
        <div style="color: orange; font-size: 1.25em; text-align: center;">
          [${data.nslNumber}] Fetching info for Jira issues is not yet supported :(
        </div>
      `;
    }

    async _getToken(storageKey, name, description) {
      const encryptedToken = this._storageUtils.inMemory.get(storageKey) ||
        this._storageUtils.session.get(storageKey) ||
        this._storageUtils.local.get(storageKey) ||
        await this._promptForToken(storageKey, name, description);

      if (!encryptedToken) return;

      try {
        return await this._secretUtils.decrypt(encryptedToken);
      } catch (err) {
        this._storageUtils.inMemory.delete(storageKey);
        this._storageUtils.session.delete(storageKey);
        this._storageUtils.local.delete(storageKey);

        throw err;
      }
    }

    async _init() {
      const githubTokenName = 'GitHub access token';
      const githubToken = await this._getToken(this._KEYS.githubToken, githubTokenName, `
        <p>
          It can be used to make authenticated requests to GitHub's API, when retrieving issue/PR info. Authenticated
          requests have a much higher limit for requests per hour (at the time of writing 5000 vs 60 for anonymous
          requests).
        </p>
        <p>Providing a ${githubTokenName} is <b>optional</b>.</p>
      `);
      this._ghUtils = new GithubUtils(githubToken);
    }

    _promptForToken(storageKey, name, description, force = false) {
      const allPrompts = this._storageUtils.local.get('prompts') || {};
      const prompts = allPrompts[storageKey] || (allPrompts[storageKey] = {});

      if (!force && prompts.noCheckOnStartup) return;

      const ctxName = `${NAME}-ctx-${Date.now()}`;
      const ctx = window[ctxName] = {
        token: '',
        storage: 'local',
        noCheckOnStartup: !!prompts.noCheckOnStartup,
      };

      const dialogTemplate = `
        <h2>No ${name} detected</h2>
        <hr />
        <p>It seems like you have not provided a ${name}.</p>
        <p>${description}</p>
        <hr />
        <p>Would you like to provide one now?</p>
        <p>
          <form>
            <label style="display: block;">
              Token:
              <input
                  type="password"
                  placeholder="(required)"
                  value="${ctx.token}"
                  oninput="javascript:window['${ctxName}'].token = event.target.value;"
                  />
            </label>
            <label style="display: block;">
              Store:
              <select value="${ctx.store}" onchange="javascript:window['${ctxName}'].storage = event.target.value;">
                <option value="local">Permanently (for this browser)</option>
                <option value="session">Only for current session</option>
              </select>
            </label>
            <label style="display: block; text-align: right;">
              Do not ask again:
              <input
                  type="checkbox"
                  style="margin-left: 15px; transform: translateX(-50%) scale(2);"
                  ${ctx.noCheckOnStartup ? 'checked' : ''}
                  onclick="javascript:window['${ctxName}'].noCheckOnStartup = event.target.checked"
                  />
            </label>
          </form>
        </p>
      `;

      return this._uiUtils.
        showDialog(dialogTemplate, 'Store token', 'Not now').
        finally(() => delete window[ctxName]).
        then(async ok => {
          prompts.noCheckOnStartup = ctx.noCheckOnStartup;
          this._storageUtils.local.set('prompts', allPrompts);

          if (!ok) return;

          const storage = this._storageUtils[ctx.storage];
          if (!ctx.token || !storage) {
            const warnMsg =
              `Unable to store the ${name}: Invalid data provided (token or storage target).\n` +
              '(Proceeding without a token.)';

            this._logUtils.warn(warnMsg);
            this._uiUtils.showSnackbar(`<div style="color: orange;">${warnMsg.replace(/\n/g, '<br />')}</div>`, 5000);

            return;
          }

          const encryptedToken = await this._secretUtils.encrypt(ctx.token);
          storage.set(storageKey, encryptedToken);
          this._uiUtils.showSnackbar(`<b style="color: green;">Successfully stored ${name}.</b>`, 2000);

          return encryptedToken;
        });
    }

    _onError(err) {
      if (err instanceof IgnoredError) return;

      this._logUtils.error(err);
      this._uiUtils.showSnackbar(
        '<pre style="background-color: white; border: none; color: red;">' +
          `<b>${err.message || err}</b><br />` +
          '<small>(See the console for more details.)</small>' +
        '</pre>',
        10000);
    }
  }

  class SecretUtils {
    constructor() {
      this._crypto = window.crypto.subtle;
      this._version = '1';

      this._decoder = new TextDecoder();
      this._encoder = new TextEncoder();
      this._algorithm = {name: 'AES-CBC', iv: this._encoder.encode('SupposedlyRandom')};
      this._superSecretKey = null;

      this._ready = this._init();
    }

    cleanUp() {
      /* Nothing to clean up. */
    }

    async decrypt(encrypted) {
      await this._ready;
      const [v, numbersStr, ...rest] = encrypted.split(':');
      const numbers = numbersStr && numbersStr.split(',').filter(Boolean).map(Number);

      if (rest.length || !numbers || !numbers.length || numbers.some(Number.isNaN)) {
        throw new Error(`Unable to decrypt \`${encrypted}\`: Invalid or unknown format.`);
      } else if (v !== this._version) {
        throw new Error(`Unable to decrypt \`${encrypted}\`: Version mismatch (expected: ${this._version}).`);
      }

      const buf = await this._crypto.decrypt(this._algorithm, this._superSecretKey, Uint16Array.from(numbers));
      return this._decoder.decode(buf);
    }

    async encrypt(decrypted) {
      await this._ready;
      const buf = await this._crypto.encrypt(this._algorithm, this._superSecretKey, this._encoder.encode(decrypted));
      return `${this._version}:${new Uint16Array(buf).join(',')}`;
    }

    async _init() {
      /*
       * NOTE:
       * The idea (for now) is to just make it difficult for someone to make sense of encrypted values they might get
       * access to. E.g. those values could be stored on `window.localStorage` or `window.sessionStorage` and it won't
       * be possible for someone to get to the underlying data without knowing about this code here.
       */
      this._superSecretKey = await this._crypto.importKey(
        'raw',
        this._encoder.encode('$NgSl@ckL1nk1fy$'),
        this._algorithm,
        false,
        ['decrypt', 'encrypt']);
    }
  }

  class StorageImpl {
    constructor(prefix, store) {
      this._prefix = `${prefix}:`;
      this._store = store;
    }

    clear() {
      /* Only clear items that this instance manages (i.e. whose keys have the appropriate prefix). */
      this.keys().forEach(k => this.delete(k));
    }

    delete(key) {
      this._store.removeItem(this._keyFor(key));
    }

    get(key) {
      const value = this._store.getItem(this._keyFor(key));
      return (value === null) ? undefined : JSON.parse(value);
    }

    has(key) {
      return this._store.getItem(this._keyFor(key)) !== null;
    }

    keys() {
      /* Only return keys that this instance manages (i.e. that have the appropriate prefix). */
      return Array.
        from(new Array(this._store.length), (x, i) => this._store.key(i)).
        filter(k => k.startsWith(this._prefix));
    }

    set(key, value) {
      if (value === undefined) return;
      this._store.setItem(this._keyFor(key), JSON.stringify(value));
    }

    _keyFor(key) {
      return `${this._prefix}${key}`;
    }
  }

  class StorageUtils {
    constructor(prefix) {
      this.local = new StorageImpl(prefix, window.localStorage);
      this.session = new StorageImpl(prefix, window.sessionStorage);
      this.inMemory = new StorageImpl(prefix, new InMemoryStorage());
    }

    cleanUp() {
      /*
       * Do not clear `local` or `session`, since we want them to persist (at least temporarily).
       * They are managed by the browser.
       */
      this.inMemory.clear();
    }
  }

  class UiUtils {
    constructor() {
      this._openDialogs = [];

      this._popup = null;
      this._hidePopupTimeout = null;
      this._showPopupTimeout = null;

      this._snackbarContainer = this._createSnackbarContainer();
    }

    cleanUp() {
      this._openDialogs.reverse().forEach(dialog => this._fadeOut(dialog));
      this._openDialogs = [];

      this.hidePopup();

      this._snackbarContainer.remove();
    }

    hidePopup() {
      this._cancelHidePopup();

      if (this._popup) {
        this._fadeOut(this._popup);
        this._popup = null;
      }
    }

    scheduleHidePopup(delay) {
      if (this._hidePopupTimeout) return false;

      this._cancelShowPopup();
      if (!this._popup) return false;

      this._hidePopupTimeout = setTimeout(() => this.hidePopup(), delay);
      return true;
    }

    scheduleShowPopup(html, evt, delay) {
      this._cancelHidePopup();
      this._cancelShowPopup();
      this._showPopupTimeout = setTimeout(() => this.showPopup(html, evt), delay);
      return true;
    }

    showDialog(html, okBtnText, cancelBtnText) {
      const deferred = new Deferred();
      const onClose = ok => {
        this._fadeOut(dialog);
        deferred.resolve(ok);
      };

      const outerPadding = 15;
      const dialog = Object.assign(document.createElement('div'), {
        className: 'nsl-dialog-backdrop',
        innerHTML: `
          <div class="nsl-dialog">
            <header class="nsl-dialog-header">${NAME} v${VERSION}</header>
            <section class="nsl-dialog-content">${html}</section>
            <footer class="nsl-dialog-actions">
              <button class="nsl-dialog-btn-ok">${okBtnText}</button>
              <button class="nsl-dialog-btn-cancel">${cancelBtnText}</button>
            </footer>
          </div>
        `,
        style: `
          align-items: center;
          background-color: rgba(0, 0, 0, 0.5);
          bottom: 0;
          display: flex;
          justify-content: center;
          padding: ${outerPadding}px;
          position: fixed;
          left: 0;
          right: 0;
          top: 0;
          z-index: 9999;
        `,
      });

      Object.assign(dialog.querySelector('.nsl-dialog'), {
        style: `
          background-color: white;
          border: 1px solid lightgray;
          border-radius: 6px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, .08), 0 4px 12px 0 rgba(0, 0, 0, .12);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          max-height: ${Math.min(window.innerHeight - (2 * outerPadding), 700)}px;
          max-width: ${Math.min(window.innerWidth - (2 * outerPadding), 900)}px;
          min-height: ${Math.min(window.innerHeight - (2 * outerPadding), 500)}px;
          min-width: ${Math.min(window.innerWidth - (2 * outerPadding), 750)}px;
          overflow: auto;
          padding: 15px;
          pointer-events: all;
        `,
      });
      Object.assign(dialog.querySelector('.nsl-dialog-header'), {
        style: `
          color: gray;
          font-size: 0.75em;
          text-align: right;
        `,
      });
      Object.assign(dialog.querySelector('.nsl-dialog-content'), {
        style: `
          user-select: text;
        `,
      });
      Object.assign(dialog.querySelector('.nsl-dialog-actions'), {
        style: `
          display: flex;
          justify-content: flex-end;
          user-select: text;
        `,
      });
      Object.assign(dialog.querySelector('.nsl-dialog-btn-ok'), {
        onclick: () => onClose(true),
        onmouseenter: evt => evt.target.style.borderColor = 'orange',
        onmouseleave: evt => evt.target.style.borderColor = 'white',
        style: `
          background-color: green;
          border: 2px solid white;
          border-radius: 6px;
          color: white;
          margin-right: 15px;
          padding: 10px 15px;
        `,
      });
      Object.assign(dialog.querySelector('.nsl-dialog-btn-cancel'), {
        onclick: () => onClose(false),
        onmouseenter: evt => evt.target.style.borderColor = 'orange',
        onmouseleave: evt => evt.target.style.borderColor = 'white',
        style: `
          background-color: gray;
          border: 2px solid white;
          border-radius: 6px;
          color: white;
          padding: 10px 15px;
        `,
      });

      this._openDialogs.push(dialog);
      document.body.appendChild(dialog);
      this._fadeIn(dialog);

      return deferred.promise;
    }

    showPopup(html, evt) {
      this._cancelShowPopup();
      this.hidePopup();

      const position = this._calculatePopupPosition(evt);
      const onMouseenter = () => this._cancelHidePopup();
      const onMouseleave = () => this.hidePopup();

      this._popup = Object.assign(document.createElement('div'), {
        className: 'nsl-popup',
        innerHTML: html,
        onmouseenter: onMouseenter,
        onmouseleave: onMouseleave,
        style: `
          background-color: white;
          border: 1px solid lightgray;
          border-radius: 6px;
          bottom: ${position.bottom}px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, .08), 0 4px 12px 0 rgba(0, 0, 0, .12);
          left: ${position.left}px;
          overflow: auto;
          padding: 10px;
          position: fixed;
          right: ${position.right}px;
          top: ${position.top}px;
          user-select: text;
          z-index: 9999;
        `,
      });

      document.body.appendChild(this._popup);
      this._fadeIn(this._popup);
    }

    showSnackbar(html, duration = 2000) {
      const snackbar = Object.assign(document.createElement('div'), {
        className: 'nsl-snackbar',
        innerHTML: `
          <section class="nsl-snackbar-content">${html}</section>
          <button class="nsl-snackbar-btn-close">&#x2715;</button>
        `,
        style: `
          background-color: white;
          border: 1px solid lightgray;
          border-radius: 6px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, .08), 0 4px 12px 0 rgba(0, 0, 0, .12);
          box-sizing: border-box;
          display: flex;
          margin-top: 5px;
          max-height: 500px;
          max-width: 750px;
          min-width: 400px;
          pointer-events: all;
        `,
      });

      Object.assign(snackbar.querySelector('.nsl-snackbar-content'), {
        style: `
          overflow: auto;
          padding: 10px 5px 10px 10px;
          user-select: text;
        `,
      });
      Object.assign(snackbar.querySelector('.nsl-snackbar-btn-close'), {
        onclick: () => this._fadeOut(snackbar),
        onmouseenter: evt => evt.target.style.color = 'red',
        onmouseleave: evt => evt.target.style.color = 'lightgray',
        style: `
          align-self: flex-start;
          background-color: transparent;
          border: none;
          color: lightgray;
          cursor: pointer;
          margin-top: -5px;
          padding: 5px;
        `,
      });

      this._snackbarContainer.appendChild(snackbar);
      const fadeInPromise = this._fadeIn(snackbar);

      return (duration < 0) ? fadeInPromise : fadeInPromise.
        then(() => new Promise(resolve => setTimeout(resolve, duration))).
        then(() => this._fadeOut(snackbar));
    }

    _animateProp(elem, prop, from, to, duration = 200) {
      const style = elem.style;

      return this._withRafInterval([
        () => style.transition = '',
        () => style[prop] = from,
        () => style.transition = `${prop} ${duration}ms linear`,
        () => style[prop] = to,
      ]).then(() => new Promise(resolve => setTimeout(resolve, duration)));
    }

    _calculatePopupPosition(evt) {
      const idealHeight = 500;
      const idealWidth = 750;

      const targetRect = evt.target.getBoundingClientRect();

      const topDistance = targetRect.top;
      const bottomDistance = window.innerHeight - targetRect.bottom;
      const placement =
        ((bottomDistance <= idealHeight) && ((topDistance > idealHeight) || (topDistance > bottomDistance))) ?
          'top' :
          'bottom';

      const calculateLeftRight = () => {
        const mid = (targetRect.left + targetRect.right) / 2;
        const halfWidth = idealWidth / 2;

        let left = Math.max(5, mid - halfWidth);
        let right = Math.min(window.innerWidth - 5, left + idealWidth);

        if (right - left < idealWidth) left = Math.max(5, right - idealWidth);

        return {left, right};
      };

      let rect;
      switch (placement) {
        case 'top':
          rect = {
            top: Math.max(5, targetRect.top - idealHeight),
            bottom: targetRect.top,
            ...calculateLeftRight(),
          };
          break;
        case 'bottom':
          rect = {
            top: targetRect.bottom,
            bottom: Math.min(window.innerHeight - 5, targetRect.bottom + idealHeight),
            ...calculateLeftRight(),
          };
          break;
      }

      return {
        top: rect.top,
        bottom: window.innerHeight - rect.bottom,
        left: rect.left,
        right: window.innerWidth - rect.right,
      };
    }

    _cancelHidePopup() {
      if (this._hidePopupTimeout) {
        clearTimeout(this._hidePopupTimeout);
        this._hidePopupTimeout = null;
      }
    }

    _cancelShowPopup() {
      if (this._showPopupTimeout) {
        clearTimeout(this._showPopupTimeout);
        this._showPopupTimeout = null;
      }
    }

    _createSnackbarContainer() {
      const snackbarContainer = Object.assign(document.createElement('div'), {
        className: 'nsl-snackbar-container',
        style: `
          bottom: 10px;
          display: flex;
          flex-direction: column-reverse;
          pointer-events: none;
          position: fixed;
          right: 10px;
          z-index: 9999;
        `,
      });

      document.body.appendChild(snackbarContainer);

      return snackbarContainer;
    }

    _fadeIn(elem, duration) {
      return this._animateProp(elem, 'opacity', 0.1, 1, duration);
    }

    _fadeOut(elem, duration) {
      return this._animateProp(elem, 'opacity', 1, 0.1, duration).
        then(() => elem.remove());
    }

    _withRafInterval(actions) {
      return new Promise((resolve, reject) => {
        if (!actions.length) return resolve();

        actions.shift()();
        window.requestAnimationFrame(() =>
          this._withRafInterval(actions).then(resolve, reject));
      });
    }
  }

  /* Run */
  new Program().main();

})();
