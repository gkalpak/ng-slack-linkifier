# NgSlackLinkifier

_Warning:_
_This is still a veeery experimental tool._
_Use at your own risk!_


## Description

A script to enhance messages, especially links, in the `angular-team` Slack.


## Usage

The code should be run in the context of the [Slack web-app][slack]. For example, you can paste and run the code in
DevTools or use it as a [bookmarklet].

If you are using the deskotp app for Slack, you need to [start the app in a special way][slack-app-dev] in order to be
able to open DevTools.


## TODO

Things I want to (but won't necessarily) do:

- Remove stored Github access token on `401 - Bad credentials`.
- Offer to bring up the dialog for adding a Github access token, when rate-limit is reached.
- Consider postponing prompts for tokens, until they are needed. (E.g. prompt for GitHub token, when/if anonymous rate-limit is reached).
- Add support for removing/resetting tokens via the UI.
- Add support for resetting prompts via the UI.
- Recognize, shorten and show info for more GitHub URLs.
  - More PR URL formats (e.g. `/files`?, `#issuecomment-12345` (and similar forms)?).
  - Commit URLs.
  - File URLs (e.g. https://github.com/angular/angular/blob/84be7c52d/path/to/file.ext#L13-L37).
  - Jason's `https://git.io/fjLYY/12345` shortened URLs.
  - URLs from other owners.
- Show info for Jira issues (requires Jira access token).

- Add tests.
- Break up into multiple files.
- Switch to TypeScript.
- Publish minified version.

- Convert to a Chrome Extension(?).


[bookmarklet]: https://en.wikipedia.org/wiki/Bookmarklet
[slack]: https://slack.com/
[slack-app-dev]: https://www.reddit.com/r/Slack/comments/955dro/how_do_i_open_the_chromium_developer_tools_in_the
