javascript:/* eslint-disable-line no-unused-labels *//*
 * # NgSlackLinkifier vX.Y.Z-VERSION
 *
 * ## What it does
 *
 * **It converts...**
 *
 * - Markdown-like links (of the form `[some text](/some/url)`) to actual links.
 *
 * - URLs to GitHub commits to short links. E.g.:
 *   - `https://github.com/angular/angular/commit/a1b2c3d4e5` --> `angular@a1b2c3d4e5`
 *   - `https://github.com/angular/angular-cli/commit/b2c3d4e5f6` --> `angular-cli@b2c3d4e5f6`
 *   - `https://github.com/not-angular/some-lib/commit/c3d4e5f6g7` --> `not-angular/some-lib@c3d4e5f6g7`
 *
 * - GitHub commits of the format `[<owner>/]<repo>@<sha>` to links. If omitted `<owner>` defaults to `angular`. In
 *   order for commits to be recognized at least the first 7 characters of the SHA must be provided. E.g.:
 *   - `angular@a1b2c3d` or `angular/angular@a1b2c3d` -->
 *     `[angular@a1b2c3d](https://github.com/angular/angular/commit/a1b2c3d)`
 *   - `angular-cli@b2c3d4e5f6` or `angular/angular-cli@b2c3d4e5f6` -->
 *     `[`angular-cli@b2c3d4e`](https://github.com/angular/angular-cli/commit/b2c3d4e5f6)`
 *   - `not-angular/some-lib@c3d4e5f6` -->
 *     `[not-angular/some-lib@c3d4e5f](https://github.com/not-angular/some-lib/commit/c3d4e5f6`
 *
 * - URLs to GitHub issues/PRs to short links. E.g.:
 *   - `https://github.com/angular/angular/issues/12345` --> `#12345`
 *   - `https://github.com/angular/angular-cli/pull/23456` --> `angular-cli#23456`
 *   - `https://github.com/not-angular/some-lib/pull/34567` --> `not-angular/some-lib@#34567`
 *
 * - GitHub issues/PRs of the format `[[<owner>/]<repo>]#<issue-or-pr>` to links. If omitted `<owner>` and `<repo>`
 *   default to `angular`. E.g.:
 *   - `#12345` or `angular#12345` or `angular/angular#12345` -->
 *     `[#12345](https://github.com/angular/angular/issues/12345)`
 *   - `angular-cli#23456` or `angular/angular-cli#23456` -->
 *     `[angular-cli#23456](https://github.com/angular/angular-cli/issues/23456)`
 *   - `not-angular/some-lib#34567` -->
 *     [not-angular/some-lib#34567](https://github.com/not-angular/some-lib/issues/34567)`
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
((window, document) => {'use strict';

  /* Constants */
  const NAME = 'NgSlackLinkifier';
  const VERSION = 'X.Y.Z-VERSION';

  const CLASS_GITHUB_COMMIT_LINK = 'nsl-github-commit';
  const CLASS_GITHUB_ISSUE_LINK = 'nsl-github-issue';
  const CLASS_JIRA_LINK = 'nsl-jira';
  const CLASS_PROCESSED = 'nsl-processed';
  const CLASS_POST_PROCESSED = 'nsl-post-processed';

  /*
   * Encoded entities need to be broken up, so that they are not auto-decoded, when the script is used as a bookmarklet.
   * (NOTE: The used method for breaking up those entities should survive minification.)
   */
  const P = '%';

  const CLEANING_UP = new Error('Cleaning up.');

  /* Classes */
  class AbstractInfoProvider {
    static get TOKEN_NAME() { return this._notImplemented(); }
    static get TOKEN_DESCRIPTION_HTML() { return this._notImplemented(); }

    static validateToken(token) {
      if (!token || (typeof token !== 'string')) {
        throw new Error(`Empty or invalid token (${typeof token}: ${token}). Please, provide an non-empty string.`);
      }
    }

    constructor() {
      this._cacheMaxAge = 60000;
      this._cache = new Map();

      this._headers = null;
    }

    cleanUp() {
      this.setToken(null);
      this._cache.clear();
    }

    requiresToken() { this._notImplemented(); }

    setToken(token) {
      this._headers = token ? this._generateHeaders(token) : undefined;
    }

    _generateHeaders(token) { this._notImplemented(token); }

    _getErrorForResponse(res) { this._notImplemented(res); }

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
        response = window.fetch(url, {headers: this._headers}).
          then(async res => res.ok ? res.json() : Promise.reject(await this._getErrorForResponse(res))).
          catch(err => {
            if (this._getFromCache(url) === response) this._cache.delete(url);
            throw err;
          });

        this._cache.set(url, {date: Date.now(), response});
      }

      return response;
    }

    _notImplemented() { throw new Error('Not implemented.'); }
  }

  class Deferred {
    constructor() {
      this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
    }
  }

  class GithubUtils extends AbstractInfoProvider {
    static get TOKEN_NAME() { return 'GitHub access token'; }
    static get TOKEN_DESCRIPTION_HTML() {
      const tokenName = this.TOKEN_NAME;
      const tokenUrl = 'https://github.com/settings/tokens';
      return `
        <p>
          A ${tokenName} can be used to make authenticated requests to GitHub's API, when retrieving info for links to
          issues and PRs. Authenticated requests have a much higher limit for requests per hour (at the time of writing
          5000 vs 60 for anonymous requests).
        </p>
        <p>
          To create a ${tokenName} visit: <a href="${tokenUrl}" target="_blank">${tokenUrl}</a>
          <i>(no scopes required)</i>
        </p>
        <p>Providing a ${tokenName} is <b>optional</b>.</p>
      `;
    }

    constructor() {
      super();
      this._baseUrl = 'https://api.github.com/repos';
      this._rateLimitResetTime = 0;
    }

    getCommitInfo(owner, repo, commit) {
      const url = `${this._baseUrl}/${owner}/${repo}/commits/${commit}`;
      return this._getJson(url).
        then(data => ({
          sha: data.sha,
          message: data.commit.message,
          author: this._extractUserInfo(data.author),
          committer: this._extractUserInfo(data.committer),
          authorDate: new Date(data.commit.author.date),
          committerDate: new Date(data.commit.committer.date),
          stats: data.stats,
          files: data.files.map(f => this._extractFileInfo(f)),
        })).
        catch(err => {
          throw new Error(`Error getting GitHub info for ${owner}/${repo}@${commit}:\n${err.message || err}`);
        });
    }

    getIssueInfo(owner, repo, number) {
      const url = `${this._baseUrl}/${owner}/${repo}/issues/${number}`;
      return this._getJson(url).
        then(data => ({
          number: data.number,
          title: data.title,
          description: data.body.trim(),
          author: this._extractUserInfo(data.user),
          state: data.state,
          labels: data.labels.map(l => l.name),
          isPr: data.html_url.endsWith(`/pull/${data.number}`),
        })).
        catch(err => {
          throw new Error(`Error getting GitHub info for ${owner}/${repo}#${number}:\n${err.message || err}`);
        });
    }

    requiresToken() {
      return (this._rateLimitResetTime > Date.now()) ?
        `Anonymous rate-limit reached (until ${new Date(this._rateLimitResetTime).toLocaleString()})` :
        false;
    }

    _extractFileInfo(file) {
      return {
        filename: file.filename,
        patch: file.patch,
        status: file.status,
        stats: {
          total: file.changes,
          additions: file.additions,
          deletions: file.deletions,
        },
      };
    }

    _extractUserInfo(user) {
      return {
        avatar: user.avatar_url,
        username: user.login,
        url: user.html_url,
      };
    }

    _generateHeaders(token) {
      return {Authorization: `token ${token}`};
    }

    async _getErrorForResponse(res) {
      const headers = res.headers;
      let data = await res.json();

      if (!data.message) data = {message: JSON.stringify(data)};

      if ((res.status === 403) && (headers.get('X-RateLimit-Remaining') == '0')) {
        const limit = headers.get('X-RateLimit-Limit');
        const reset = new Date(headers.get('X-RateLimit-Reset') * 1000);

        this._rateLimitResetTime = reset.getTime();

        data.message = `0/${limit} API requests remaining until ${reset.toLocaleString()}.\n${data.message}`;
      }

      return new Error(`${res.status} (${res.statusText}) - ${data.message}`);
    }
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

  class JiraUtils extends AbstractInfoProvider {
    static get TOKEN_NAME() { return 'Jira e-mail and access token'; }
    static get TOKEN_DESCRIPTION_HTML() {
      const tokenName = this.TOKEN_NAME;
      const tokenUrl = 'https://id.atlassian.com/manage/api-tokens';
      const corsAnywhereLink =
        '<a href="https://cors-anywhere.herokuapp.com/" target="_blank">https://cors-anywhere.herokuapp.com/</a>';

      return `
        <p>
          A ${tokenName} is required in order to retrieve info for links to Jira issues. Unauthenticated requests are
          <b>not supported</b> by Jira's API, so you will not be able to see any info without providing a ${tokenName}.
        </p>
        <p>To create a Jira access token visit: <a href="${tokenUrl}" target="_blank">${tokenUrl}</a></p>
        <p>Providing a ${tokenName} is <b>optional</b> (unless you want to see issue info in here).</p>
        <br />
        <p style="
              background-color: rgba(255, 0, 0, 0.1);
              border: 2px solid gray;
              border-radius: 6px;
              color: red;
              padding: 7px;
            ">
          <b>WARNING:</b><br />
          Currently, all requests to Jira's API are sent through ${corsAnywhereLink} in order to work around CORS
          restrictions. There will, hopefully, be a better solution in the future, but for now <b>do not</b> provide a
          ${tokenName}, unless you understand and feel comfortable with the implications of sending the requests
          (including your encoded ${tokenName}) through ${corsAnywhereLink}.
        </p>
        <br />
        <p>
          <b>IMPORTANT:</b><br />
          Enter the ${tokenName} in the field below in the format <code>&lt;email&gt;:&lt;access-token&gt;</code> (e.g.
          <code>myself@mail.me:My4cc3ssT0k3n</code>).
        </p>
      `;
    }

    static validateToken(token) {
      super.validateToken(token);

      if (!/^[^:]+@[^:]+:./.test(token)) {
        const hiddenToken = token.replace(/\w/g, '*');
        throw new Error(
          `Invalid token format (${hiddenToken}). ` +
          'Please, provide the token in the form `<email>:<access-token>` (e.g. `myself@mail.me:My4cc3ssT0k3n`).');
      }
    }

    constructor() {
      super();
      this._baseUrl = 'https://angular-team.atlassian.net/rest/api/3';

      /*
       * Prepend `https://cors-anywhere.herokuapp.com/` to the URL to work around CORS restrictions.
       * TODO(gkalpak): Implement a more secure alternative.
       */
      this._baseUrl = `https://cors-anywhere.herokuapp.com/${this._baseUrl}`;
    }

    getIssueInfo(number) {
      const url = `${this._baseUrl}/issue/${number}`;
      return this._getJson(url).
        then(data => ({...data})).
        catch(err => { throw new Error(`Error getting Jira info for ${number}:\n${err.message || err}`); });
    }

    requiresToken() {
      return !this._headers && 'Unauthenticated requests are not supported.';
    }

    _generateHeaders(token) {
      return {Authorization: `Basic ${window.btoa(token)}`};
    }

    async _getErrorForResponse(res) {
      let data = await res.json();

      if (!data.message) data = {message: JSON.stringify(data)};

      return new Error(`${res.status} (${res.statusText}) - ${data.message}`);
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
        ...this._processNodeGithubCommits(node),
        ...this._processNodeGithubIssues(node),
        ...this._processNodeJira(node),
      ]);

      processedNodes.forEach(n => n.classList.add(CLASS_PROCESSED));
      if (forcePostProcess || processedNodes.size) this._postProcessNode(node);
    }

    /* Process GitHub-like commits. */
    _processNodeGithubCommits(node) {
      const processedNodes = new Set();

      const acceptNode = x => this._acceptNodeInTextNodeWalker(x);
      const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {acceptNode}, false);
      let t;

      while ((t = treeWalker.nextNode())) {
        const textMatch = /(?:([\w.-]+)\/)?([\w.-]+)@([A-Fa-f\d]{7,})\b/.exec(t.textContent);

        if (textMatch) {
          const [, owner = 'angular', repo = 'angular', commit] = textMatch;
          const url = `https://github.com/${owner}/${repo}/commit/${commit}`;
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
        const githubCommitRe = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/commit\/([A-Fa-f\d]{7,})$/;

        const hrefMatch = githubCommitRe.exec(link.href) ||
          /* eslint-disable-next-line max-len */
          new RegExp(`^https://slack-redir\\.net/link\\?url=https${P}3A${P}2F${P}2Fgithub\\.com${P}2F([\\w.-]+)${P}2F([\\w.-]+)${P}2Fcommit${P}2F([A-Fa-f\\d]{7,})$`).exec(link.href);

        if (hrefMatch) {
          const [, owner, repo, commit] = hrefMatch;

          link.classList.add(CLASS_GITHUB_COMMIT_LINK);
          link.dataset.nslOwner = owner;
          link.dataset.nslRepo = repo;
          link.dataset.nslCommit = commit;

          processedNodes.add(link);
        }

        const htmlMatch = githubCommitRe.exec(link.innerHTML);

        if (htmlMatch) {
          const [, owner, repo, commit] = htmlMatch;
          const repoSlug = `${(owner === 'angular') ? '' : `${owner}/`}${repo}`;

          link.innerHTML = `<b>${repoSlug}@${commit.slice(0, 7)}</b>`;

          processedNodes.add(link);
        }
      });

      return processedNodes;
    }

    /* Process GitHub-like issues/PRs. */
    _processNodeGithubIssues(node) {
      const processedNodes = new Set();

      const acceptNode = x => this._acceptNodeInTextNodeWalker(x);
      const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {acceptNode}, false);
      let t;

      while ((t = treeWalker.nextNode())) {
        const textMatch = /(?:(?:([\w.-]+)\/)?([\w.-]+))?#(\d+)\b/.exec(t.textContent);

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
        const githubIssueRe = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)$/;

        const hrefMatch = githubIssueRe.exec(link.href) ||
          /* eslint-disable-next-line max-len */
          new RegExp(`^https://slack-redir\\.net/link\\?url=https${P}3A${P}2F${P}2Fgithub\\.com${P}2F([\\w.-]+)${P}2F([\\w.-]+)${P}2F(?:issues|pull)${P}2F(\\d+)$`).exec(link.href);

        if (hrefMatch) {
          const [, owner, repo, issue] = hrefMatch;

          link.classList.add(CLASS_GITHUB_ISSUE_LINK);
          link.dataset.nslOwner = owner;
          link.dataset.nslRepo = repo;
          link.dataset.nslNumber = issue;

          processedNodes.add(link);
        }

        const htmlMatch = githubIssueRe.exec(link.innerHTML);

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
        const jiraIssueRe = /^https:\/\/angular-team\.atlassian\.net\/browse\/([A-Z]+-\d+)$/;

        const hrefMatch = jiraIssueRe.exec(link.href) ||
          /* eslint-disable-next-line max-len */
          new RegExp(`^https://slack-redir\\.net/link\\?url=https${P}3A${P}2F${P}2Fangular-team\\.atlassian\\.net${P}2Fbrowse${P}2F([A-Z]+-\\d+)$`).exec(link.href);

        if (hrefMatch) {
          link.classList.add(CLASS_JIRA_LINK);
          link.dataset.nslNumber = hrefMatch[1];
          processedNodes.add(link);
        }

        const htmlMatch = jiraIssueRe.exec(link.innerHTML);

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
      this._KEYS = new Map([
        [GithubUtils, 1],
        [JiraUtils, 2],
      ]);

      this._cleanUpables = [
        this._logUtils = new LogUtils(`${NAME} v${VERSION}`),
        this._secretUtils = new SecretUtils(),
        this._storageUtils = new StorageUtils(NAME),

        this._linkifier = new Linkifier(node => this._addListeners(node)),
        this._uiUtils = new UiUtils(),

        this._ghUtils = new GithubUtils(),
        this._jiraUtils = new JiraUtils(),
      ];

      this._cleanUpFns = [
        () => this._destroyedDeferred.reject(CLEANING_UP),
      ];

      this._destroyedDeferred = new Deferred();
    }

    cleanUp() {
      this._logUtils.log('Uninstalling...');

      while (this._cleanUpables.length || this._cleanUpFns.length) {
        while (this._cleanUpables.length) this._cleanUpables.shift().cleanUp();
        while (this._cleanUpFns.length) this._cleanUpFns.shift()();
      }

      this._logUtils.log('Uninstalled.');
    }

    async main() {
      try {
        if (window.__ngSlackLinkifyCleanUp) window.__ngSlackLinkifyCleanUp();

        window.__ngSlackLinkifyCleanUp = () => {
          this.cleanUp();
          window.__ngSlackLinkifyCleanUp = null;
        };

        this._logUtils.log('Installing...');

        this._ghUtils.setToken(await this._getStoredTokenFor(GithubUtils));
        this._jiraUtils.setToken(await this._getStoredTokenFor(JiraUtils));

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

      node.querySelectorAll(`.${CLASS_GITHUB_COMMIT_LINK}:not(.${CLASS_POST_PROCESSED})`).forEach(link => {
        processedNodes.add(link);
        this._addListenersForLink(link, data => this._getPopupContentForGithubCommit(data));
      });

      node.querySelectorAll(`.${CLASS_GITHUB_ISSUE_LINK}:not(.${CLASS_POST_PROCESSED})`).forEach(link => {
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

    _checkRequiresToken(provider) {
      const requiresTokenReason = provider.requiresToken();
      if (!requiresTokenReason) return;

      const content = Object.assign(document.createElement('div'), {
        innerHTML: `
          <div style="color: orange;">
            <p><b>Fetching info for this link requires a token.</b></p>
            <p style="color: gray;">(Reason: ${requiresTokenReason})</p>
          </div>
          <div><button>Provide token now</button></div>
        `,
      });

      Object.assign(content.querySelector('button'), {
        onclick: async () => provider.setToken(await this._promptForToken(provider.constructor)),
        onmouseenter: evt => evt.target.style.borderColor = 'orange',
        onmouseleave: evt => evt.target.style.borderColor = 'white',
        style: `
          background-color: cornflowerblue;
          border: 2px solid white;
          border-radius: 6px;
          color: white;
          padding: 10px 15px;
        `,
      });

      return content;
    }

    async _getPopupContentForGithubCommit(data) {
      const requiresTokenContent = this._checkRequiresToken(this._ghUtils);
      if (requiresTokenContent) return requiresTokenContent;

      const colorPerStatus = {added: 'green', modified: 'darkorchid', removed: 'red', renamed: 'blue'};

      const owner = data.nslOwner;
      const repo = data.nslRepo;
      const commit = data.nslCommit;

      const info = await this._ghUtils.getCommitInfo(owner, repo, commit);
      const subject = info.message.split('\n', 1).pop();
      const body = info.message.slice(subject.length).trim();

      const fileHtml = file => {
        const tooltip = file.patch.replace(/"/g, '&quot;').replace(/\n/g, '\u000A');
        const diff =   file.patch.
          split('\n').
          map(l => {
            const style = l.startsWith('+') ?
              'background-color: rgba(0, 255, 0, 0.11);' : l.startsWith('-') ?
                'background-color: rgba(255, 0, 0, 0.11);' : l.startsWith('@@') ?
                  'color: rgba(0, 0, 0, 0.33);' :
                  'color: rgba(0, 0, 0, 0.66);';
            return `<span style="${style}">${l}</span>`;
          }).
          join('\n');

        return `
          <details>
            <summary
                style="align-items: baseline; cursor: pointer; display: flex; margin: 0 15px 10px; outline: none;"
                title="${tooltip}">
              <small style="
                    background-color: ${colorPerStatus[file.status]};
                    border-radius: 6px;
                    color: white;
                    font-size: 0.75em;
                    line-height: 1em;
                    margin-right: 5px;
                    min-width: 55px;
                    opacity: 0.5;
                    padding: 2px 4px;
                    text-align: center;
                  ">
                ${file.status}
              </small>
              <span style="flex: auto; white-space: nowrap;">
                ${file.filename}
              </span>
              <small style="text-align: right; white-space: nowrap;">
                <span style="color: ${colorPerStatus.added}; display: inline-block; min-width: 33px;">
                  +${file.stats.additions}
                </span>
                <span style="color: ${colorPerStatus.removed}; display: inline-block; min-width: 33px;">
                  -${file.stats.deletions}
                </span>
              </small>
            </summary>
            <pre style="font-size: 0.9em; line-height: calc(0.9em + 5px);">${diff}</pre>
          </details>
        `;
      };

      return `
        <p style="display: flex; font-size: 0.9em; justify-content: space-between;">
          <span>
            <img src="${info.author.avatar}" width="25" height="25" style="border-radius: 6px;" />
            <a href="${info.author.url}" target="_blank">@${info.author.username}</a>
          </span>
          <small style="color: gray; text-align: right;">
            Committed on: ${info.committerDate.toLocaleString()}
          </small>
        </p>
        <p style="align-items: flex-start; display: flex; font-size: 1.25em;">
          <b>${subject}</b>
          <span style="color: gray; margin-left: 5px;">@${info.sha.slice(0, 7)}</span>
        </p>
        ${body && `<br /><pre>${body}</pre>`}
        <hr />
        <div>
          <p style="display: flex;">
            <b style="flex: auto;">Files (${info.files.length}):</b>
            <small style="color: lightgray;">Click on a file to see diff.</small>
          </p>
          <div style="overflow: auto;">
            <div style="display: flex; flex-direction: column; width: fit-content;">
              ${info.files.map(fileHtml).join('')}
            </div>
          </div>
        </div>
      `;
    }

    async _getPopupContentForGithubIssue(data) {
      const requiresTokenContent = this._checkRequiresToken(this._ghUtils);
      if (requiresTokenContent) return requiresTokenContent;

      const colorPerState = {closed: 'red', draft: 'gray', merged: 'darkorchid', open: 'green'};

      const owner = data.nslOwner;
      const repo = data.nslRepo;
      const number = data.nslNumber;

      const info = await this._ghUtils.getIssueInfo(owner, repo, number);
      const description = info.description.replace(/^<!--[^]*?-->\s*/, '');

      return `
        <p style="display: flex; font-size: 0.9em; justify-content: space-between;">
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
                margin-right: 5px;
                padding: 2px 4px;
                text-align: center;
              ">
            ${info.state.toUpperCase()}
          </span>
          <b style="flex: auto;">${info.title}</b>
          <span style="color: gray; margin-left: 5px; white-space: nowrap;">
            <span style="color: lightgray;">${info.isPr ? 'PR' : 'Issue'}:</span>
            #${info.number}
          </span>
        </p>
        <br />
        <pre>${description || '<i style="color: gray;">No description.</i>'}</pre>
      `;
    }

    async _getPopupContentForJira(data) {
      const requiresTokenContent = this._checkRequiresToken(this._jiraUtils);
      if (requiresTokenContent) return requiresTokenContent;

      const number = data.nslNumber;

      const info = await this._jiraUtils.getIssueInfo(number);

      /* TODO(gkalpak): Implement proper popup for Jira issues. */
      return `
        <b>Jira issue ${number}:</b>
        <pre>${JSON.stringify(info, null, 2)}</pre>
      `;
    }

    async _getStoredTokenFor(providerClass) {
      const storageKey = this._KEYS.get(providerClass);

      try {
        const encryptedToken = ['inMemory', 'session', 'local'].reduce((token, store) =>
          token || this._storageUtils[store].get(storageKey), null);

        if (!encryptedToken) return;

        const token = await this._whileNotDestroyed(this._secretUtils.decrypt(encryptedToken));
        providerClass.validateToken(token);

        return token;
      } catch (err) {
        if (err === CLEANING_UP) throw err;

        this._storageUtils.inMemory.delete(storageKey);
        this._storageUtils.session.delete(storageKey);
        this._storageUtils.local.delete(storageKey);

        const warnMsg = `Found a corrupted or invalid stored ${providerClass.TOKEN_NAME} and removed it.`;

        this._logUtils.error(err);
        this._logUtils.warn(warnMsg);
        this._uiUtils.showSnackbar(
          `<div style="color: orange;">
            <b>${warnMsg}</b><br />
            <small>(See the console for more details.)</small>
          </div>`,
          3000);
      }
    }

    async _promptForToken(providerClass, remainingAttempts = 2) {
      const tokenName = providerClass.TOKEN_NAME;
      const tokenDescription = providerClass.TOKEN_DESCRIPTION_HTML;

      const ctxName = `$$${NAME}-promptForToken-ctx-${Date.now()}-${Math.random()}`;
      const ctx = window[ctxName] = {token: '', storage: 'local'};

      const dialogTemplate = `
        <h2>No ${tokenName} detected</h2>
        <hr />
        <p>It seems that you have not provided a ${tokenName}.</p>
        <p>${tokenDescription}</p>
        <hr />
        <p>Would you like to provide one now?</p>
        <p>
          <form>
            <label style="cursor: default; display: block; margin-bottom: 10px;">
              ${tokenName}:
              <div style="align-items: center; display: flex; position: relative;">
                <input
                    type="password"
                    placeholder="(required)"
                    value="${ctx.token}"
                    style="margin: 0;"
                    oninput="javascript:window['${ctxName}'].token = event.target.value;"
                    />
                <span
                    style="cursor: pointer; font-size: 2em; position: absolute; right: 10px;"
                    onmousedown="javascript:event.target.previousElementSibling.type = 'text';"
                    onmouseup="javascript:event.target.previousElementSibling.type = 'password';">
                  👁️
                </span>
              </div>
            </label>
            <label style="cursor: default; display: block; margin-bottom: 10px;">
              Store:
              <div style="align-items: center; display: flex; position: relative;">
                <select
                    value="${ctx.store}"
                    style="cursor: pointer;"
                    onchange="javascript:window['${ctxName}'].storage = event.target.value;">
                  <option value="local">Permanently (for this browser)</option>
                  <option value="session">Only for current session</option>
                </select>
                <span style="
                      font-size: 2em;
                      pointer-events: none;
                      position: absolute;
                      right: 24px;
                      transform: rotateZ(90deg);
                    ">
                  &#x276f;
                </span>
              </div>
            </label>
          </form>
        </p>
      `;

      try {
        const ok = await this._uiUtils.
          showDialog(dialogTemplate, 'Store token', 'Not now').
          finally(() => delete window[ctxName]);

        if (!ok) return;

        providerClass.validateToken(ctx.token);

        const storageKey = this._KEYS.get(providerClass);
        const encryptedToken = await this._whileNotDestroyed(this._secretUtils.encrypt(ctx.token));

        this._storageUtils[ctx.storage].set(storageKey, encryptedToken);
        this._uiUtils.showSnackbar(`<b style="color: green;">Successfully stored ${tokenName}.</b>`, 3000);

        return encryptedToken;
      } catch (err) {
        if (err === CLEANING_UP) throw err;

        if (remainingAttempts > 0) {
          this._onError(err);
          return this._promptForToken(providerClass, --remainingAttempts);
        }

        const warnMsg = `Unable to acquire a valid ${tokenName}. Giving up for now :(`;

        this._logUtils.error(err);
        this._logUtils.warn(warnMsg);
        this._uiUtils.showSnackbar(
          `<div style="color: orange;">
            <b>${warnMsg}</b><br />
            <small>(See the console for more details.)</small>
          </div>`,
          5000);
      }
    }

    _onError(err) {
      if (err === CLEANING_UP) return;

      this._logUtils.error(err);
      this._uiUtils.showSnackbar(
        '<pre style="background-color: white; border: none; color: red;">' +
          `<b>${this._uiUtils.escapeHtml(err.message || err)}</b><br />` +
          '<small>(See the console for more details.)</small>' +
        '</pre>',
        10000);
    }

    _whileNotDestroyed(promise) {
      return Promise.race([promise, this._destroyedDeferred.promise]);
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
      this._openDialogDeferreds = [];

      this._popup = null;
      this._popupAnchor = null;
      this._hidePopupTimeout = null;
      this._showPopupTimeout = null;

      this._snackbarContainer = this._createSnackbarContainer();
      this._scratchpad = document.createElement('div');

      const onResize = evt => this._onResizeListeners.forEach(fn => fn(evt));
      window.addEventListener('resize', onResize);

      this._onResizeCleanUp = () => {
        window.removeEventListener('resize', onResize);
        this._onResizeListeners = [];
      };
      this._onResizeListeners = [
        () => this._openDialogDeferreds.forEach(({dialog}) => this._updateDialogSizing(dialog)),
        () => this._popup && this._updatePopupPositioning(this._popup, this._popupAnchor),
      ];

      const that = this;

      this._DialogDeferred = class DialogDeferred extends Deferred {
        constructor(dialog) {
          that._openDialogDeferreds.push(super());
          this.dialog = dialog;
          this.promise = this.promise.finally(() => {
            that._fadeOut(dialog);

            const idx = that._openDialogDeferreds.indexOf(dialog);
            if (idx !== -1) that._openDialogDeferreds.splice(idx, 1);
          });
        }
      };
    }

    cleanUp() {
      this._onResizeCleanUp();

      this._snackbarContainer.remove();
      this.hidePopup();

      while (this._openDialogDeferreds.length) {
        this._openDialogDeferreds.pop().reject(CLEANING_UP);
      }
    }

    escapeHtml(html) {
      this._scratchpad.textContent = html;
      const escaped = this._scratchpad.innerHTML;
      this._scratchpad.textContent = '';

      return escaped;
    }

    hidePopup() {
      this._cancelHidePopup();

      if (this._popup) {
        this._fadeOut(this._popup);
        this._popup = null;
        this._popupAnchor = null;
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

    showDialog(htmlOrNode, okBtnText, cancelBtnText) {
      const dialog = Object.assign(document.createElement('div'), {
        className: 'nsl-dialog-backdrop',
        innerHTML: `
          <div class="nsl-dialog">
            <header class="nsl-dialog-header">${NAME} v${VERSION}</header>
            <section class="nsl-dialog-content"></section>
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
          padding: 15px;
          position: fixed;
          left: 0;
          right: 0;
          top: 0;
          z-index: 10200;
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
      this._insertContent(
        Object.assign(dialog.querySelector('.nsl-dialog-content'), {
          style: `
            user-select: text;
          `,
        }),
        htmlOrNode);
      Object.assign(dialog.querySelector('.nsl-dialog-actions'), {
        style: `
          display: flex;
          justify-content: flex-end;
          user-select: text;
        `,
      });
      Object.assign(dialog.querySelector('.nsl-dialog-btn-ok'), {
        onclick: () => deferred.resolve(true),
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
        onclick: () => deferred.resolve(false),
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

      const deferred = new this._DialogDeferred(dialog);

      document.body.appendChild(dialog);
      this._updateDialogSizing(dialog);
      this._fadeIn(dialog);

      return deferred.promise;
    }

    showPopup(htmlOrNode, evt) {
      this._cancelShowPopup();
      this.hidePopup();

      const onMouseenter = () => this._cancelHidePopup();
      const onMouseleave = () => this.hidePopup();

      this._popupAnchor = evt.target;
      this._popup = Object.assign(document.createElement('div'), {
        className: 'nsl-popup',
        onmouseenter: onMouseenter,
        onmouseleave: onMouseleave,
        style: `
          background-color: white;
          border: 1px solid gray;
          border-radius: 6px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, .08), 0 4px 12px 0 rgba(0, 0, 0, .12);
          overflow: auto;
          padding: 10px;
          position: fixed;
          user-select: text;
          z-index: 10100;
        `,
      });
      this._insertContent(this._popup, htmlOrNode);
      this._updatePopupPositioning(this._popup, this._popupAnchor);

      document.body.appendChild(this._popup);
      this._fadeIn(this._popup);
    }

    showSnackbar(htmlOrNode, duration = 2000) {
      const snackbar = Object.assign(document.createElement('div'), {
        className: 'nsl-snackbar',
        innerHTML: `
          <section class="nsl-snackbar-content"></section>
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

      this._insertContent(
        Object.assign(snackbar.querySelector('.nsl-snackbar-content'), {
          style: `
            overflow: auto;
            padding: 10px 5px 10px 10px;
            user-select: text;
          `,
        }),
        htmlOrNode);
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

    _calculatePopupPositioning(anchorNode) {
      const idealWidth = 900;
      const minIdealHeight = 500;
      const maxIdealHeight = 750;
      const margin = 10;

      const targetRect = anchorNode.getBoundingClientRect();

      const topDistance = targetRect.top;
      const bottomDistance = window.innerHeight - targetRect.bottom;
      const placeAbove =
        (bottomDistance <= minIdealHeight) && ((topDistance > minIdealHeight) || (topDistance > bottomDistance));

      const calculateLeftRight = () => {
        const mid = (targetRect.left + targetRect.right) / 2;
        const halfWidth = idealWidth / 2;

        let left = Math.max(margin, mid - halfWidth);
        let right = Math.min(window.innerWidth - margin, left + idealWidth);

        if (right - left < idealWidth) left = Math.max(margin, right - idealWidth);

        return {left: `${left}px`, right: `${window.innerWidth - right}px`};
      };

      return {
        maxHeight: `${Math.min(maxIdealHeight, (placeAbove ? topDistance : bottomDistance) - margin)}px`,
        top: placeAbove ? 'auto' : `${targetRect.bottom}px`,
        bottom: placeAbove ? `${window.innerHeight - targetRect.top}px` : 'auto',
        ...calculateLeftRight(),
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
          overflow: auto;
          pointer-events: none;
          position: fixed;
          right: 10px;
          top: 10px;
          z-index: 10300;
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

    _insertContent(parentNode, htmlOrNode) {
      if (typeof htmlOrNode === 'string') {
        parentNode.innerHTML = htmlOrNode;
      } else {
        parentNode.innerHTML = '';
        parentNode.appendChild(htmlOrNode);
      }
    }

    _updateDialogSizing(dialog) {
      const availableWidth = window.innerWidth - (2 * 15);
      const availableHeight = window.innerHeight - (2 * 15);

      Object.assign(dialog.firstElementChild.style, {
        minWidth: `${Math.min(750, availableWidth)}px`,
        maxWidth: `${Math.min(900, availableWidth)}px`,
        minHeight: `${Math.min(500, availableHeight)}px`,
        maxHeight: `${Math.min(700, availableHeight)}px`,
      });
    }

    _updatePopupPositioning(popup, popupAnchor) {
      const positioning = this._calculatePopupPositioning(popupAnchor);
      Object.assign(popup.style, positioning);
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

})(window, window.document);
