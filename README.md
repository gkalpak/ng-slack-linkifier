# NgSlackLinkifier

_Warning:_
_This is still a veeery experimental tool._
_Use at your own risk!_


## Description

A script to enhance messages, especially links, in the `angular-team` Slack. See the doc comment in
[index.js][index] for more details.


## Usage

The script should be run in the context of the [Slack web-app][slack]. For example, you can paste and and run the code
in DevTools or use it as a [bookmarklet].

If you are using the desktop app for Slack, you need to [start the app in a special way][slack-app-dev] in order to be
able to open DevTools.

The latest release can be found [here][releases].<br />
The code for each release is in the corresponding commit's [dist/][dist] directory.
The code is also available at `https://cdn.jsdelivr.net/gh/gkalpak/ng-slack-linkifier@X.Y.Z/dist/index[.min].js`.

> WARNING:
> The code in [dist/][dist] is only updated on releases; it does not reflect the code in [index.js][index] on every
> commit (and may even be invalid on non-release commits).


## Test

Currently there are no automated tests :scream: :scream: :scream:

This comment is a good starting point for manual testing:

```
*Markdown links*
- This is a [markdown link](https://google.com/).
- This is a [markdown link to a GitHub issue](https://github.com/angular/angular/issues/12345).
- This is markdown link references [GitHub PR #23456](https://google.com/), but points to a different URL.
- This is a [markdown link to a Jira issue](https://angular-team.atlassian.net/browse/FW-1234).
- This is markdown link references [Jira issue TOOL-23](https://google.com/), but points to a different URL.

*GitHub commits*
- This is the 1st Angular commit on GitHub: https://github.com/angular/angular/commit/6a3abf2366e2c32 (crazy, ha?)
- This is the 2st AngularJS commit on GitHub: https://github.com/angular/angular.js/commit/fac0e698a85ade9 (fun!)
- This is another commit on GitHub: https://github.com/angular/angular-cli/commit/246abb39359259a (for `angular-cli`)
- This is yet another commit on GitHub: https://github.com/reactivex/rxjs/commit/66338ffc540a001
- These are "raw" references commits on GitHub: angular@6a3abf2366e2c32, angular-cli@246abb3, reactivex/rxjs@66338ffc540a001 (see the link?)
- These are not, but still recognized as such: notexists@9999999999, https://github.com/neither/this/commit/9999999999
- These are not recognized: angular@6a3abf _(too short)_, @6a3abf2366e2c32 _(missing repo)_

*GitHub issues/PRs*
- This is (supposedly) a GitHub PR: https://github.com/angular/angular.js/pull/1111 (nr 1)
- This is (supposedly) just a GitHub PR (pun intended): https://github.com/angular/angular/pull/2345 (or is it?)
- This is (supposedly) another GitHub PR: https://github.com/angular/angular-cli/pull/345 (for `angular-cli`)
- This is (supposedly) yet another GitHub PR: https://github.com/reactivex/rxjs/pull/45
- These are "raw" references to GitHub issues/PRs: #2345, angular/angular#5432, angular-cli#345, reactivex/rxjs#45 (see the link?)
- These are not, but still recognized as such: #999999, notexists#999999, https://github.com/neither/this/issues/999999

*Jira issues*
- This is (supposedly) a Jira issue: https://angular-team.atlassian.net/browse/FW-1234 (or is it?)
- This is (supposedly) another Jira issue: (https://angular-team.atlassian.net/browse/TOOL-345) (parenthesized)
- This is (supposedly) yet another Jira issue: https://angular-team.atlassian.net/browse/COMP-45
- These are "raw" references to Jira issues: FW-1234, TOOL-345, COMP-45 (see the link? :stuck_out_tongue:)
- These are not, but still recongized as such: NOTEXISTS-1337, NEITHERTHIS-7331 ¯\_(ツ)_/¯
```


## TODO

Things I want to (but won't necessarily) do:

- Show proper popup for Jira issues.
- Handle the fact that Jira info cannot be retrieved with use of [cors-anywhere](https://cors-anywhere.herokuapp.com/).
  - Option 1: White-list `https://angular-team.slack.com` (ref: https://confluence.atlassian.com/adminjiraserver071/configuring-the-whitelist-802593145.html).
  - Option 2: Roll our own version of `cors-anywhere`.

- Try out `DomUtils` and see if size/ergonomics improve.
  - Consider having a "library" of re-usable components and/or templates (e.g. button, text-field, etc.).
- Show more info for PRs (e.g. first try `.../pulls/<number>` and if it fails then `.../issues/<number>`?
- Add support for removing/resetting tokens via the UI. (How?)
- Recognize, shorten and show info for more GitHub URLs.
  - More PR URL formats (e.g. `/files`?, `/commits/...`?, `#issuecomment-12345` (and similar forms)?).
  - More commit URLs (e.g. `#diff...`?).
  - File URLs (e.g. https://github.com/angular/angular/blob/84be7c52d/path/to/file.ext#L13-L37).
  - Jason's `https://git.io/fjLYY/12345` shortened URLs.

- Add tests.
- Add CI support.
- Consider switching to TypeScript. (How does it affect bundle size? Is it worth it?)
- Break up into multiple files.

- Convert to a Chrome Extension(?).


[bookmarklet]: https://en.wikipedia.org/wiki/Bookmarklet
[dist]: ./dist
[index]: ./index.js
[releases]: https://github.com/gkalpak/ng-slack-linkifier/releases
[slack]: https://slack.com/
[slack-app-dev]: https://www.reddit.com/r/Slack/comments/955dro/how_do_i_open_the_chromium_developer_tools_in_the
