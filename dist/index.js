javascript:/* eslint-disable-line no-unused-labels *//*
 * # NgSlackLinkifier v0.3.15
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
 *   - `https://github.com/not-angular/some-lib/commit/c3d4e5f` --> `not-angular/some-lib@c3d4e5f`
 *
 * - GitHub commits of the format `[<owner>/]<repo>@<sha>` to links. If omitted `<owner>` defaults to `angular`. In
 *   order for commits to be recognized at least the first 7 characters of the SHA must be provided. E.g.:
 *   - `angular@a1b2c3d` or `angular/angular@a1b2c3d` -->
 *     `[angular@a1b2c3d](https://github.com/angular/angular/commit/a1b2c3d)`
 *   - `angular-cli@b2c3d4e5f6` or `angular/angular-cli@b2c3d4e5f6` -->
 *     `[`angular-cli@b2c3d4e`](https://github.com/angular/angular-cli/commit/b2c3d4e5f6)`
 *   - `not-angular/some-lib@c3d4e5f6` -->
 *     `[not-angular/some-lib@c3d4e5f](https://github.com/not-angular/some-lib/commit/c3d4e5f6)`
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
  const VERSION = '0.3.15';

  const CLASS_GITHUB_COMMIT_LINK = 'nsl-github-commit';
  const CLASS_GITHUB_ISSUE_LINK = 'nsl-github-issue';
  const CLASS_JIRA_LINK = 'nsl-jira';
  const CLASS_PROCESSED = 'nsl-processed';
  const CLASS_POST_PROCESSED = 'nsl-post-processed';

  /* Helpers */
  const hasOwnProperty = Object.prototype.hasOwnProperty.call.bind(Object.prototype.hasOwnProperty);

  /*
   * Encoded entities need to be broken up, so that they are not auto-decoded, when the script is used as a bookmarklet.
   * (NOTE: The used method for breaking up those entities should survive minification.)
   */
  const P = '%';

  /* Classes */
  class AbstractInfoProvider {
    static get TOKEN_NAME() { return this._notImplemented(); }
    static get TOKEN_DESCRIPTION_HTML() { return this._notImplemented(); }

    static validateToken(token) {
      if (!token || (typeof token !== 'string')) {
        throw new Error(`Empty or invalid token (${typeof token}: ${token}). Please, provide a non-empty string.`);
      }
    }

    constructor() {
      this._cacheMaxAge = 60000;
      this._cache = new Map();

      this.setToken(null);
    }

    cleanUp() {
      this.setToken(null);
      this._cache.clear();
    }

    hasToken() { return this._token !== undefined; }

    requiresToken() { return this._notImplemented(); }

    setToken(token) {
      this._token = token || undefined;
      this._headers = this._token && this._generateHeaders(this._token);
    }

    _generateHeaders(token) { this._notImplemented(token); }

    _getErrorConstructorExtending(BaseConstructor) {
      const provider = this;
      return class extends BaseConstructor {
        get provider() { return provider; }
      };
    }

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

    async _getJson(url) {
      let responsePromise = this._getFromCache(url);

      if (!responsePromise) {
        responsePromise = window.fetch(url, {headers: {Accept: 'application/json', ...this._headers}}).
          then(async res => res.ok ?
            {data: await res.json(), headers: res.headers} :
            Promise.reject(await this._getErrorForResponse(res))).
          catch(err => {
            if (this._getFromCache(url) === responsePromise) this._cache.delete(url);
            throw err;
          });

        this._cache.set(url, {date: Date.now(), response: responsePromise});
      }

      return responsePromise;
    }

    _notImplemented() { throw new Error('Not implemented.'); }

    _wrapError(err, message) {
      const ErrorConstructor = (err instanceof Error) ? err.constructor : Error;
      return new ErrorConstructor(`${message}\n${err.message || err}`);
    }
  }

  class AbstractInvalidTokenError extends Error {
    get provider() { throw new Error('Not implemented.'); }
  }

  class CleaningUpMarkerError extends Error {
    constructor() { super('Cleaning up.'); }
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
      const tokenUrl = 'https://github.com/settings/tokens/new';

      return `
        <p>
          A ${tokenName} can be used to make authenticated requests to GitHub's API, when retrieving info for links to
          issues and PRs. Authenticated requests have a much higher limit for requests per hour (at the time of writing
          5000 vs 60 for anonymous requests).
        </p>
        <p>
          To create a ${tokenName} visit: <a href="${tokenUrl}?description=${NAME}" target="_blank">${tokenUrl}</a>
          <i>(no scopes required)</i>
        </p>
      `;
    }

    constructor() {
      super();
      this._baseUrl = 'https://api.github.com/repos';
      this._rateLimitResetTime = 0;
    }

    async getCommitInfo(owner, repo, commit) {
      try {
        const url = `${this._baseUrl}/${owner}/${repo}/commits/${commit}`;
        const {data} = await this._getJson(url);
        const {files, stats} = this._extractFileInfo(data.files);

        return {
          sha: data.sha,
          message: data.commit.message,
          author: this._extractUserInfo(data.author),
          committer: data.commiter && this._extractUserInfo(data.committer),
          authorDate: new Date(data.commit.author.date),
          committerDate: new Date(data.commit.committer.date),
          stats: data.stats,
          files,
          filesUrl: data.html_url,
          /*
           * GitHub seems to send the first 300 files, but there is no direct way to tell whether there are more files.
           * Try to infer that by comparing the total changes in `data.stats` and in `data.files`.
           */
          hasMoreFiles: data.stats.total !== stats.total,
        };
      } catch (err) {
        throw this._wrapError(err, `Error getting GitHub info for ${owner}/${repo}@${commit}:`);
      }
    }

    async getIssueInfo(owner, repo, number) {
      try {
        const url = `${this._baseUrl}/${owner}/${repo}/issues/${number}`;
        const {data} = await this._getJson(url);
        const isPr = hasOwnProperty(data, 'pull_request');
        let prInfo = null;

        if (isPr) {
          const prFilesUrl = `${this._baseUrl}/${owner}/${repo}/pulls/${number}/files?per_page=50`;
          const {headers, data: rawFiles} = await this._getJson(prFilesUrl);
          const {files, stats} = this._extractFileInfo(rawFiles);

          prInfo = {
            stats,
            files,
            filesUrl: `${data.html_url}/files`,
            hasMoreFiles: headers.has('link'),
          };
        }

        return {
          number: data.number,
          title: data.title,
          description: data.body.trim(),
          author: this._extractUserInfo(data.user),
          state: data.state,
          labels: data.labels.map(l => l.name).sort(),
          isPr,
          prInfo,
        };
      } catch (err) {
        throw this._wrapError(err, `Error getting GitHub info for ${owner}/${repo}#${number}:`);
      }
    }

    async getLatestTag(owner, repo) {
      try {
        /* Tags are listed in reverse order. */
        const url = `${this._baseUrl}/${owner}/${repo}/tags?per_page=1`;
        const {data} = await this._getJson(url);

        return data[0];
      } catch (err) {
        throw this._wrapError(err, `Error getting latest GitHub tag ${owner}/${repo}:`);
      }
    }

    requiresToken() {
      return !this.hasToken() && (this._rateLimitResetTime > Date.now()) &&
        `Anonymous rate-limit reached (until ${new Date(this._rateLimitResetTime).toLocaleString()})`;
    }

    _extractFileInfo(rawFiles) {
      const stats = {total: 0, additions: 0, deletions: 0};
      const files = rawFiles.map(f => {
        const fileStats = {
          total: f.changes,
          additions: f.additions,
          deletions: f.deletions,
        };

        stats.total += fileStats.total;
        stats.additions += fileStats.additions;
        stats.deletions += fileStats.deletions;

        return {
          filename: f.filename,
          patch: (f.patch === undefined) ? null : f.patch,
          status: f.status,
          stats: fileStats,
        };
      });

      return {files, stats};
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
      let ErrorConstructor = Error;
      const data = await res.json();
      let message = data.message || JSON.stringify(data);

      switch (res.status) {
        case 401:
          if (this.hasToken()) ErrorConstructor = this._getErrorConstructorExtending(AbstractInvalidTokenError);
          break;
        case 403:
          if (res.headers.get('X-RateLimit-Remaining') === '0') {
            const limit = res.headers.get('X-RateLimit-Limit');
            const reset = new Date(res.headers.get('X-RateLimit-Reset') * 1000);

            this._rateLimitResetTime = reset.getTime();

            message = `0/${limit} API requests remaining until ${reset.toLocaleString()}.\n${message}`;
          }
          break;
      }

      return new ErrorConstructor(`${res.status} (${res.statusText}) - ${message}`);
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

    async getIssueInfo(number) {
      try {
        const url = `${this._baseUrl}/issue/${number}?expand=renderedFields&` +
          'fields=assignee,description,fixVersions,issuelinks,issuetype,project,reporter,status,summary';
        const {data} = await this._getJson(url);

        return {
          number: data.key,
          type: data.fields.issuetype.name,
          title: data.fields.summary,
          description: data.renderedFields.description.trim(),
          reporter: this._extractUserInfo(data.fields.reporter),
          assignee: data.fields.assignee && this._extractUserInfo(data.fields.assignee),
          status: this._extractStatusInfo(data.fields.status),
          project: data.fields.project.name,
          fixVersions: data.fields.fixVersions.map(x => x.name).sort(),
          issueLinks: data.fields.issuelinks.
            map(x => this._extractIssueLinkInfo(x)).
            sort((a, b) => this._sortIssueLinks(a, b)),
        };
      } catch (err) {
        throw this._wrapError(err, `Error getting Jira info for ${number}:`);
      }
    }

    requiresToken() { return !this.hasToken() && 'Unauthenticated requests are not supported.'; }

    _extractIssueLinkInfo(link) {
      const isInward = hasOwnProperty(link, 'inwardIssue');
      const otherIssue = isInward ? link.inwardIssue : link.outwardIssue;
      return {
        type: isInward ? link.type.inward : link.type.outward,
        otherIssue: {
          number: otherIssue.key,
          url: `https://angular-team.atlassian.net/browse/${otherIssue.key}`,
          title: otherIssue.fields.summary,
          status: this._extractStatusInfo(otherIssue.fields.status),
        },
      };
    }

    _extractStatusInfo(status) {
      return {
        name: status.name,
        color: status.statusCategory.colorName,
      };
    }

    _extractUserInfo(user) {
      return {
        avatar: user.avatarUrls['32x32'],
        username: user.name,
        name: user.displayName,
        url: `https://angular-team.atlassian.net/people/${user.accountId}`,
      };
    }

    _generateHeaders(token) { return {Authorization: `Basic ${window.btoa(token)}`}; }

    async _getErrorForResponse(res) {
      let ErrorConstructor = Error;
      const data = res.headers.get('Content-Type').includes('application/json') ?
        await res.json() :
        (await res.text()).trim();
      const message = !Array.isArray(data.errorMessages) ?
        JSON.stringify(data) : (data.errorMessages.length === 1) ?
          data.errorMessages[0] :
          ['Errors:', ...data.errorMessages.map(e => `  - ${e}`)].join('\n');

      switch (res.status) {
        case 401:
          if (this.hasToken()) ErrorConstructor = this._getErrorConstructorExtending(AbstractInvalidTokenError);
          break;
      }

      return new ErrorConstructor(`${res.status} (${res.statusText}) - ${message}`);
    }

    _sortIssueLinks(l1, l2) {
      return (l1.type < l2.type) ?
        -1 : (l1.type > l2.type) ?
          +1 : (l1.otherIssue.number < l2.otherIssue.number) ?
            -1 :
            +1;
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
       * - `.p-rich_text_block`: Messages with rich-text support (whatever that is that differentiates them from regular
       *                         messages).
       */
      const selectors = '.c-message__body, .c-message_attachment__body, .c-message_kit__text, .p-rich_text_block';
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
        const prevMatch = prev && (prev.nodeType === Node.TEXT_NODE) &&
          /\[([^[\]]+|[^[]*(?:\[[^\]]+][^[]*)*)]\($/.exec(prev.textContent);

        const next = prevMatch && link.nextSibling;
        const nextMatch = next ?
          ((next.nodeType === Node.TEXT_NODE) && /^\)/.exec(next.textContent)) :
          /* Truncated link in message attachment (e.g. by GeekBot). Requires special handling. */
          (link.lastChild && (link.lastChild.textContent === '…') && true);

        if (nextMatch) {
          link.childNodes.forEach(n => n.textContent = '');
          link.appendChild(Object.assign(document.createElement('b'), {textContent: prevMatch[1]}));

          prev.textContent = prev.textContent.slice(0, -prevMatch[0].length);
          if (next) {
            next.textContent = next.textContent.slice(nextMatch[0].length);
          } else {
            /*
             * Special handling: Prevent Slack to update the link's text content,
             * when expanding/collapsing the message attachment.
             */
            const originalAppendChild = link.appendChild;
            link.appendChild = n => originalAppendChild.call(link, Object.assign(n, {textContent: ''}));
          }

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

    cleanUp() { /* Nothing to clean up. */ }

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

        this._updateUtils = new UpdateUtils(this._ghUtils),
      ];

      this._cleanUpFns = [
        () => this._destroyedDeferred.reject(new CleaningUpMarkerError()),
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

        const root = this._getRootElement();

        this._linkifier.processAll([root], true);
        this._linkifier.observe(root);
        this._postInstall();

        this._logUtils.log('Installed.');
      } catch (err) {
        this._onError(err);
      } finally {
        /* Even if installation failed, check for updates so that we can recover from a broken version. */
        this._schedule(() => this._checkForUpdate(), 10000);
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

          await this._whileNotDestroyed(new Promise(resolve => setTimeout(resolve, 500)));
          if (id !== interactionId) return;  /* Abort if already "mouseleft". */

          linkStyle.cursor = 'progress';

          const html = await this._whileNotDestroyed(getPopupContent(linkData));
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

    async _checkForUpdate(ignoreVersion = false) {
      try {
        this._logUtils.log('Checking for updates...');

        this._schedule(() => this._checkForUpdate(), 1000 * 60 * 60 * 24 * 1);  /* Check once a day. */
        const currentVersion = ignoreVersion ? '0.0.0' : VERSION;
        const update = await this._whileNotDestroyed(this._updateUtils.checkForUpdate(currentVersion));

        if (!update) return this._logUtils.log('No updates available.');

        this._logUtils.log(`Update available: ${update.version} (${update.url})`);

        const color = 'cornflowerblue';
        const snackbarContent = Object.assign(document.createElement('div'), {
          innerHTML: `
            <header style="font-size: 0.75em; opacity: 0.5;"><p>${NAME} v${VERSION}</p></header>
            <section style="color: ${color};">
              <div><b>New version of ${NAME} available: v${update.version}</b></div>
              <div>
                <a class="nsl-update-btn-open" href="${update.url}" target="_blank">See the code</a> or
                <a class="nsl-update-btn-copy" href="">copy it to clipboard</a>.
              </div>
            </section>
          `,
        });
        this._uiUtils.widgetUtils.asButtonLink(snackbarContent.querySelector('.nsl-update-btn-open'));
        this._uiUtils.widgetUtils.asButtonLink(
          this._uiUtils.widgetUtils.withListeners(snackbarContent.querySelector('.nsl-update-btn-copy'), {
            click: evt => {
              try {
                evt.preventDefault();

                this._uiUtils.copyToClipboard(update.code);
                this._uiUtils.showSnackbar(`
                  <div style="color: green;">
                    <div><b>Code for v${update.version} successfully copied to clipboard.</b></div>
                    <small>(Hopefully you know what to do 🙂)</small>
                  </div>
                `, 5000);
              } catch (err) {
                this._onError(err);
              }
            },
          }));

        this._uiUtils.showSnackbar(snackbarContent, -1);
      } catch (err) {
        if (err instanceof CleaningUpMarkerError) return;

        /*
         * Checking for updates is not a critical operation.
         * Just log the error and move on (hoping the error is temporary).
         */
        this._logUtils.warn(`Error while checking for updates: ${err.message || err}`);
      }
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
      this._uiUtils.widgetUtils.asButton(content.querySelector('button'), 'cornflowerblue', {
        click: async () => provider.setToken(await this._promptForToken(provider.constructor)),
      });

      return content;
    }

    _clearTokens() {
      [this._ghUtils, this._jiraUtils].forEach(provider => {
        const storageKey = this._KEYS.get(provider.constructor);
        this._storageUtils.delete(storageKey);
        provider.setToken(null);
      });
    }

    async _getPopupContentForGithubCommit(data) {
      const requiresTokenContent = this._checkRequiresToken(this._ghUtils);
      if (requiresTokenContent) return requiresTokenContent;

      const owner = data.nslOwner;
      const repo = data.nslRepo;
      const commit = data.nslCommit;

      const info = await this._ghUtils.getCommitInfo(owner, repo, commit);
      const subject = info.message.split('\n', 1).pop();
      const body = info.message.slice(subject.length).trim();

      return `
        <p style="
              align-items: center;
              border-bottom: 1px solid lightgray;
              display: flex;
              font-size: 0.9em;
              padding-bottom: 8px;
            ">
          <span style="flex: auto; margin-right: 15px;">
            <img src="${info.author.avatar}" width="25" height="25" style="border-radius: 6px;" />
            <a href="${info.author.url}" target="_blank">@${info.author.username}</a>
          </span>
          <small style="color: gray; text-align: right;">
            Committed on: ${info.committerDate.toLocaleString()}
          </small>
        </p>
        <p style="align-items: center; display: flex; font-size: 1.25em;">
          <b style="flex: auto;">${subject}</b>
          <span style="color: gray; margin-left: 30px;">@${info.sha.slice(0, 7)}</span>
        </p>
        <pre style="margin-top: 24px;">${body || '<i>No body.</i>'}</pre>
        ${this._getPopupContentForGithubFiles(info.files, info.stats, info.hasMoreFiles, info.filesUrl)}
      `;
    }

    _getPopupContentForGithubFiles(files, totalStats, hasMoreFiles, filesUrl) {
      const colorPerStatus = {added: 'green', modified: 'darkorchid', removed: 'red', renamed: 'blue'};
      const tooLargeDiff = 'Diff too large to display...';

      const fileToHtml = file => {
        const escapedHtml = (file.patch === null) ? tooLargeDiff : file.patch.
          replace(/&/g, '&amp;').
          replace(/'/g, '&apos;').
          replace(/"/g, '&quot;').
          replace(/</g, '&lt;').
          replace(/>/g, '&gt;');

        const tooltip = escapedHtml.replace(/\n/g, '\u000A' /* LF */);
        const diff = escapedHtml.
          split('\n').
          map(l => {
            const style = (l === tooLargeDiff) ?
              'font-style: italic;' : l.startsWith('+') ?
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
              ${statToHtml(file.stats)}
            </summary>
            <pre style="font-size: 0.9em; line-height: calc(0.9em + 5px);">${diff}</pre>
          </details>
        `;
      };
      const statToHtml = stats => `
        <small style="text-align: right; white-space: nowrap;">
          <span style="color: ${colorPerStatus.added}; display: inline-block; min-width: 33px;">
            +${stats.additions}
          </span>
          <span style="color: ${colorPerStatus.removed}; display: inline-block; min-width: 33px;">
            -${stats.deletions}
          </span>
        </small>
      `;

      return `
        <hr />
        <div>
          <p style="display: flex; justify-content: space-between;">
            <b>Files (${files.length}):</b>
            <small style="color: lightgray;">Click on a file to see the diff.</small>
            <span>${statToHtml(totalStats)}</span>
          </p>
          <div style="overflow: auto;">
            <div style="display: flex; flex-direction: column; width: fit-content;">
              ${files.map(fileToHtml).join('')}
            </div>
          </div>
        </div>
        ${!hasMoreFiles ? '' : `
          <p style="text-align: center;">
            <i style="color: gray;">
              ...Only showing the first ${files.length} files -
              <a href="${filesUrl}" target="_blank">see all of them on GitHub</a>...
            </i>
          </p>
        `}
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
      const prInfo = info.prInfo;
      const description = info.description.replace(/^<!--[^]*?-->\s*/, '');

      const filesContent = !info.isPr ?
        '' :
        this._getPopupContentForGithubFiles(prInfo.files, prInfo.stats, prInfo.hasMoreFiles, prInfo.filesUrl);

      return `
        <p style="
              align-items: center;
              border-bottom: 1px solid lightgray;
              display: flex;
              font-size: 0.9em;
              padding-bottom: 8px;
            ">
          <span style="flex: auto; margin-right: 15px;">
            <img src="${info.author.avatar}" width="25" height="25" style="border-radius: 6px;" />
            <a href="${info.author.url}" target="_blank">@${info.author.username}</a>
          </span>
          <span style="text-align: right;">
            ${info.labels.map(l => `
              <small style="
                    border: 1px solid;
                    border-radius: 6px;
                    line-height: 2.5em;
                    margin-left: 3px;
                    padding: 2px 4px;
                    text-align: center;
                    white-space: nowrap;
                  ">${l}</small>
            `).join('\n')}
          </span>
        </p>
        <p style="align-items: center; display: flex; font-size: 1.25em;">
          <span style="
                background-color: ${colorPerState[info.state] || 'black'};
                border-radius: 6px;
                color: white;
                font-size: 0.75em;
                margin-right: 10px;
                padding: 3px 6px;
                text-align: center;
              ">
            ${info.state.toUpperCase()}
          </span>
          <b style="flex: auto;">${info.title}</b>
          <span style="color: gray; margin-left: 30px; white-space: nowrap;">
            <span style="color: lightgray;">${info.isPr ? 'PR' : 'Issue'}:</span>
            #${info.number}
          </span>
        </p>
        <pre style="margin-top: 24px;">${description || '<i style="color: gray;">No description.</i>'}</pre>
        ${filesContent}
      `;
    }

    async _getPopupContentForJira(data) {
      const requiresTokenContent = this._checkRequiresToken(this._jiraUtils);
      if (requiresTokenContent) return requiresTokenContent;

      const colorPerStatus = {
        closed: 'red',
        done: 'green',
        'in progress': 'blue',
        'in review': 'darkorchid',
        open: 'gray',
        reopened: 'gray',
        resolved: 'green',
        'selected for development': 'gray',
      };

      const number = data.nslNumber;
      const info = await this._jiraUtils.getIssueInfo(number);
      const groupedIssueLinks = info.issueLinks.reduce((aggr, link) => {
        const group = aggr[link.type] || (aggr[link.type] = []);
        group.push(link);
        return aggr;
      }, {});

      const issueLinkHtml = (link, i) => {
        const issue = link.otherIssue;
        const status = issue.status.name;
        const isClosed = ['closed', 'done', 'resolved'].includes(status.toLowerCase());

        return `
          <li style="
                align-items: center;
                ${(i % 2) ? 'background-color: rgba(0, 0, 0, 0.05);' : ''}
                display: flex;
                padding: 2px 5px;
              ">
            <span style="flex: auto; ${isClosed ? 'text-decoration: line-through;' : ''}">
              <a href="${issue.url}" target="_blank" style="display: flex;">
                <b style="white-space: nowrap;">${issue.number}:&ensp;</b>
                ${issue.title}
              </a>
            </span>
            <small style="
                  background-color: ${colorPerStatus[status.toLowerCase()] || 'black'};
                  border-radius: 6px;
                  color: white;
                  font-size: 0.75em;
                  margin-left: 10px;
                  padding: 0 4px;
                  text-align: center;
                  white-space: nowrap;
                ">
              ${status.toUpperCase()}
            </small>
          </li>
        `;
      };

      const issueLinkGroupHtml = type => `
        <div>
          <i style="text-transform: capitalize;">${type} (${groupedIssueLinks[type].length}):</i>
          <ul style="margin: 5px 0 15px 15px;">
            ${groupedIssueLinks[type].reverse().map(issueLinkHtml).join('')}
          </ul>
        </div>
      `;

      return `
        <p style="
              align-items: center;
              border-bottom: 1px solid lightgray;
              display: flex;
              font-size: 0.9em;
              padding-bottom: 8px;
            ">
          <span style="align-items: center; display: flex; margin-right: 15px;">
            <img src="${info.reporter.avatar}" width="25" height="25" style="border-radius: 6px; margin-right: 5px;" />
            <span style="flex-direction: column; display: flex;">
              <small style="color: gray;">Reported by:</small>
              <a href="${info.reporter.url}" target="_blank">${info.reporter.name}</a>
            </span>
          </span>
          <span style="align-items: center; flex: auto; display: flex; margin-right: 15px;">
            <img src="${!info.assignee ? UiUtils.EMPTY_IMAGE_SRC : info.assignee.avatar}" width="25" height="25"
                style="border-radius: 6px; margin-right: 5px;" />
            <span style="flex-direction: column; display: flex;">
              <small style="color: gray;">Assigned to:</small>
              ${!info.assignee ? '-' : `<a href="${info.assignee.url}" target="_blank">${info.assignee.name}</a>`}
            </span>
          </span>
          <span style="flex-direction: column; display: flex; text-align: right;">
            <span>
              <span style="color: lightgray;">Project:</span>
              <span style="color: gray;">${info.project}</span>
            </span>
            <span>
              <span style="color: lightgray;">Fix version(s):</span>
              <span style="color: gray;">
                ${info.fixVersions.map(l => `
                  <small style="
                        border: 1px solid;
                        border-radius: 6px;
                        line-height: 2.5em;
                        margin-left: 3px;
                        padding: 2px 4px;
                        text-align: center;
                        white-space: nowrap;
                      ">${l}</small>
                `).join('\n') || '-'}
              </span>
            </span>
          </span>
        </p>
        <p style="align-items: center; display: flex; font-size: 1.25em;">
          <span style="
                background-color: ${colorPerStatus[info.status.name.toLowerCase()] || 'black'};
                border-radius: 6px;
                color: white;
                font-size: 0.75em;
                margin-right: 10px;
                padding: 3px 6px;
                text-align: center;
                white-space: nowrap;
              ">
            ${info.status.name.toUpperCase()}
          </span>
          <b style="flex: auto;">${info.title}</b>
          <span style="color: gray; margin-left: 30px; white-space: nowrap;">
            <span style="color: lightgray;">${info.type}:</span>
            ${info.number}
          </span>
        </p>
        <pre style="margin-top: 24px; white-space: normal;">
          ${info.description || '<i style="color: gray;">No description.</i>'}
        </pre>
        ${!info.issueLinks.length ? '' : `
          <hr />
          <div>
            <p><b>Linked issues (${info.issueLinks.length}):</b></p>
            <div style="padding-left: 15px;">
              ${Object.keys(groupedIssueLinks).map(issueLinkGroupHtml).join('')}
            </div>
          </div>
        `}
      `;
    }

    _getRootElement() {
      const rootSelector = '.p-workspace, #client_body';
      const rootElem = document.querySelector(rootSelector);

      if (!rootElem) {
        throw new Error(`Unable to find root element matching selector '${rootSelector}'.`);
      }

      return rootElem;
    }

    async _getStoredTokenFor(providerClass) {
      const storageKey = this._KEYS.get(providerClass);

      try {
        const encryptedToken = this._storageUtils.get(storageKey);

        if (!encryptedToken) return;

        const token = await this._whileNotDestroyed(this._secretUtils.decrypt(encryptedToken));
        providerClass.validateToken(token);

        return token;
      } catch (err) {
        if (err instanceof CleaningUpMarkerError) throw err;

        this._storageUtils.delete(storageKey);

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
                    class="nsl-input-token-value"
                    placeholder="(required)"
                    value="${ctx.token}"
                    style="margin: 0;"
                    />
                <span
                    class="nsl-input-addon-token-value"
                    style="cursor: pointer; font-size: 2em; position: absolute; right: 10px;">
                  👁️
                </span>
              </div>
            </label>
            <label style="cursor: default; display: block; margin-bottom: 10px;">
              Store:
              <div style="align-items: center; display: flex; position: relative;">
                <select class="nsl-input-token-store" value="${ctx.store}" style="cursor: pointer;">
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
        const widgetUtils = this._uiUtils.widgetUtils;
        const dialogContent = Object.assign(document.createElement('div'), {innerHTML: dialogTemplate});

        const tokenValueField = dialogContent.querySelector('.nsl-input-token-value');
        const tokenValueFieldAddon = dialogContent.querySelector('.nsl-input-addon-token-value');
        const tokenStoreField = dialogContent.querySelector('.nsl-input-token-store');

        widgetUtils.withListeners(widgetUtils.asInputField(tokenValueField), {
          input: () => ctx.token = tokenValueField.value,
        });
        widgetUtils.withListeners(tokenValueFieldAddon, {
          mousedown: () => tokenValueField.type = 'text',
          mouseup: () => tokenValueField.type = 'password',
        });
        widgetUtils.withListeners(widgetUtils.asInputField(tokenStoreField), {
          change: () => ctx.storage = tokenStoreField.value,
        });

        const ok = await this._uiUtils.
          showDialog(dialogContent, 'Store token', 'Not now').
          finally(() => delete window[ctxName]);

        if (!ok) return;

        providerClass.validateToken(ctx.token);

        const storageKey = this._KEYS.get(providerClass);
        const encryptedToken = await this._whileNotDestroyed(this._secretUtils.encrypt(ctx.token));

        this._storageUtils[ctx.storage].set(storageKey, encryptedToken);
        this._uiUtils.showSnackbar(`<b style="color: green;">Successfully stored ${tokenName}.</b>`, 3000);

        return ctx.token;
      } catch (err) {
        if (err instanceof CleaningUpMarkerError) throw err;

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
      if (err instanceof CleaningUpMarkerError) return;

      if (err instanceof AbstractInvalidTokenError) {
        const provider = err.provider;
        const providerClass = provider.constructor;
        const storageKey = this._KEYS.get(providerClass);

        provider.setToken(null);
        this._storageUtils.delete(storageKey);
        this._logUtils.warn(`Removed invalid ${providerClass.TOKEN_NAME}.`);
      }

      const errorMsg = `${err.message || err}`;
      const truncatedErrorMsg = (errorMsg.length > 250) ? `${errorMsg.slice(0, 250)}...` : errorMsg;

      this._logUtils.error(err);
      this._uiUtils.showSnackbar(
        '<pre style="background-color: white; border: none; color: red; margin: 0;">' +
          `<b>${this._uiUtils.escapeHtml(truncatedErrorMsg)}</b><br />` +
          '<small>(See the console for more details.)</small>' +
        '</pre>',
        10000);
    }

    _postInstall() {
      const hasTokens = [this._ghUtils, this._jiraUtils].some(provider => provider.hasToken());
      const isDevVersion = this._updateUtils.isDevelopmentVersion(VERSION);
      const snackbarContent = Object.assign(document.createElement('div'), {
        innerHTML: `
          <b style="color: cornflowerblue;">${NAME} v${VERSION} is up and running 😎</b>
          ${!hasTokens ? '' : `
            <small style="color: gray; display: block; margin-top: 16px;">
              Available actions:
              <ul style="margin-bottom: 0;">
                <li><a class="nsl-install-btn-clear-tokens">Clear stored tokens</a></li>
                ${!isDevVersion ? '' : '<li><a class="nsl-install-btn-cdn-update">Update from CDN</a></li>'}
              </ul>
            </small>
          `}
        `,
      });

      if (hasTokens) {
        this._uiUtils.widgetUtils.asButtonLink(
          this._uiUtils.widgetUtils.withListeners(snackbarContent.querySelector('.nsl-install-btn-clear-tokens'), {
            click: evt => {
              this._clearTokens();
              this._uiUtils.showSnackbar('<b style="color: green;">Successfully removed stored tokens.</b>', 2000);
              evt.target.parentNode.remove();
            },
          }));
      }
      if (isDevVersion) {
        this._uiUtils.widgetUtils.asButtonLink(
          this._uiUtils.widgetUtils.withListeners(snackbarContent.querySelector('.nsl-install-btn-cdn-update'), {
            click: () => this._checkForUpdate(true),
          }));
      }

      this._uiUtils.showSnackbar(snackbarContent, 5000);
    }

    _schedule(fn, delay) {
      const cleanUpFn = () => clearTimeout(timeoutId);
      const callback = () => {
        const idx = this._cleanUpFns.indexOf(cleanUpFn);
        if (idx !== -1) this._cleanUpFns.splice(idx, 1);

        fn();
      };

      const timeoutId = setTimeout(callback, delay);
      this._cleanUpFns.push(cleanUpFn);
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

    cleanUp() { /* Nothing to clean up. */ }

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

    clear() {
      this.local.clear();
      this.session.clear();
      this.inMemory.clear();
    }

    delete(key) {
      this.local.delete(key);
      this.session.delete(key);
      this.inMemory.delete(key);
    }

    get(key) {
      const storage = this.has(key);
      return storage ? storage.get(key) : undefined;
    }

    has(key) {
      /* The order of precedence is: `inMemory` > `session` > `local` */
      return this.inMemory.has(key) ?
        this.inMemory : this.session.has(key) ?
          this.session : this.local.has(key) ?
            this.local :
            false;
    }
  }

  class UiUtils {
    static get EMPTY_IMAGE_SRC() {
      return 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    }

    constructor() {
      this.widgetUtils = new WidgetUtils();

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

      const cleaningUpMarker = new CleaningUpMarkerError();
      while (this._openDialogDeferreds.length) {
        this._openDialogDeferreds.pop().reject(cleaningUpMarker);
      }
    }

    copyToClipboard(text) {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.textContent = text;
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (!success) throw new Error('Copying to clipboard failed.');
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
      this.widgetUtils.asButton(
        this.widgetUtils.withStyles(dialog.querySelector('.nsl-dialog-btn-ok'), {marginRight: '15px'}), 'green', {
          click: () => deferred.resolve(true),
        });
      this.widgetUtils.asButton(dialog.querySelector('.nsl-dialog-btn-cancel'), 'gray', {
        click: () => deferred.resolve(false),
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
            flex: auto;
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
          padding: 5px;
        `,
      });
      Object.assign(snackbar, {
        isHovered: false,
        onmouseenter: evt => evt.target.isHovered = true,
        onmouseleave: evt => evt.target.isHovered = false,
      });

      this._snackbarContainer.appendChild(snackbar);
      const fadeInPromise = this._fadeIn(snackbar);

      return (duration < 0) ? fadeInPromise : fadeInPromise.
        then(() => new Promise(resolve => setTimeout(resolve, duration))).
        then(() => this._fadeOutOnceNotHovered(snackbar));
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

    _fadeOutOnceNotHovered(elem, duration) {
      return new Promise((resolve, reject) => {
        const doFadeOut = () => this._fadeOut(elem, duration).then(resolve, reject);

        if (elem.isHovered) {
          elem.addEventListener('mouseleave', doFadeOut);
        } else {
          doFadeOut();
        }
      });
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

  class UpdateUtils {
    constructor(ghUtils) {
      this._owner = 'gkalpak';
      this._repo = 'ng-slack-linkifier';
      this._versionRe = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/;

      this._ghUtils = ghUtils;
    }

    async checkForUpdate(currentVersion) {
      /* Do not prompt for updates during development or if the current version and is not available. */
      if (this.isDevelopmentVersion(currentVersion)) return;
      if (!this._versionRe.test(currentVersion)) {
        throw new Error(`Invalid current version format: ${currentVersion} (expected: X.Y.Z[-(alpha|beta|rc).K])`);
      }

      const latestVersion = await this._getLatestVersion();
      const latestVersionUrl = latestVersion && this._getDownloadUrl(latestVersion);
      const needsUpdate = latestVersion && (this._compareVersions(currentVersion, latestVersion) === -1);

      return needsUpdate && {
        version: latestVersion,
        url: latestVersionUrl,
        code: await window.fetch(latestVersionUrl).then(res => res.text()),
      };
    }

    cleanUp() { /* Nothing to clean up. */ }

    isDevelopmentVersion(version) {
      /* Do not use the version placeholder string directly to avoid having it replaced at build time. */
      return /^X\.Y\.Z-VERSION$/.test(version);
    }

    _compareVersions(v1, v2) {
      const a1 = v1.split(/[.-]/);
      const a2 = v2.split(/[.-]/);

      for (let i = 0, ii = a1.length; i < ii; ++i) {
        if (a2.length === i) return -1;

        const p1 = isNaN(a1[i]) ? a1[i] : Number(a1[i]);
        const p2 = isNaN(a2[i]) ? a2[i] : Number(a2[i]);

        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
      }

      return (a1.length < a2.length) ? 1 : 0;
    }

    _getDownloadUrl(version) {
      return `https://cdn.jsdelivr.net/gh/${this._owner}/${this._repo}@${version}/dist/index.min.js`;
    }

    async _getLatestVersion() {
      const tag = await this._ghUtils.getLatestTag(this._owner, this._repo);
      const version = tag && tag.name.slice(1);
      return (version && this._versionRe.test(version)) ? version : undefined;
    }
  }

  class WidgetUtils {
    asButton(node, color, listeners = {}) {
      this.withListeners(this.withListeners(node, listeners), {
        mouseenter: evt => evt.target.style.borderColor = 'orange',
        mouseleave: evt => evt.target.style.borderColor = 'white',
      });

      return this.withStyles(node, {
        backgroundColor: color,
        border: '2px solid white',
        borderRadius: '6px',
        color: 'white',
        cursor: 'pointer',
        padding: '10px 15px',
      });
    }

    asButtonLink(node, listeners = {}) {
      this.withListeners(this.withListeners(node, listeners), {
        mouseenter: evt => evt.target.style.color = 'orange',
        mouseleave: evt => evt.target.style.color = null,
      });

      return this.withStyles(node, {
        cursor: 'pointer',
        textDecoration: 'underline',
      });
    }

    asInputField(node) {
      return this.withStyles(node, {
        border: '1px solid lightgray',
        borderRadius: '6px',
        outline: 'none',
        padding: '15px',
        WebkitAppearance: 'textfield',
        width: '100%',
      });
    }

    withListeners(node, listenersObj) {
      Object.keys(listenersObj).forEach(event => {
        const listener = (typeof listenersObj[event] === 'string') ?
          new Function('event', listenersObj[event]) :
          listenersObj[event];
        node.addEventListener(event, listener);
      });
      return node;
    }

    withStyles(node, stylesObj) {
      Object.assign(node.style, stylesObj);
      return node;
    }
  }

  /* Run */
  new Program().main();

})(window, window.document);
