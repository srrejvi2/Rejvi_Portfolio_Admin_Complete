# Version 2 verification

Validated with Node.js 24 and a local headless Chromium browser.

## Automated integration tests — passed

- Protected API access, owner login and HttpOnly cookie handling.
- CSRF and incorrect-origin rejection; unsafe external link rejection.
- Persistent website edits and private project drafts.
- Contact submission, inbox status, export and upload type validation.
- Password change revokes existing sessions.
- Article draft/publish lifecycle, unavailable draft URLs and metadata routes.
- Comment moderation, public owner replies, and absence of visitor emails in the public comments response.
- Signed browser reaction cookie, changing a reaction and removing it.
- Hidden article page/API, custom page routes, revision history and stale-write conflicts.
- Version 1 upgrade preserves existing owner login, customized profile/project, inbox message and uploaded document.

Run with `npm test`. Tests create isolated temporary data and remove it afterward.

## Browser workflow checks — passed

- Desktop portfolio rendering, in-page navigation and project search/filtering.
- Admin login, navigation through every admin section, profile edit and Save website.
- Article write/preview/publish.
- Public reaction and comment submission.
- Opening Comments loads new submissions; approve and save a public reply.
- Public article shows the approved comment/reply and does not display the email address.
- Public contact form success flow.
- No page JavaScript errors during the tested flows.
- No horizontal document overflow at 390px width on Home, About, Work, Résumé, Articles, Contact, article detail and admin overview.
- Desktop public/admin, article and mobile screenshots visually inspected.
- Bundled Bengali font loading verified visually; Bengali title rendered correctly.

## Remaining deployment-specific checks

No public-domain deployment was performed. Verify your HTTPS origin, proxy/IP settings, persistent volume, backups and email-app reply behavior on your own host. Docker and Windows batch wrappers were supplied but not run on Windows/Docker here. This is functional QA, not an independent penetration test or a full accessibility audit.

The distribution contains no live database, real owner password, test account, test article, visitor message or uploaded private document. Included test source uses synthetic credentials only.
