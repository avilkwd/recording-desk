# Recording Desk

A small, responsive browser application for tracking mortgage recording documents by file number. Built from the spreadsheet example, with no paid hosting requirements and no build tools.

## What it does

- **New file:** Enter a file number and select **Purchase** or **Refinance**.
  - Purchase automatically gets **DEED, MORTGAGE**.
  - Refinance automatically gets **MORTGAGE**.
- **Add document:** Add any extra document to a specific file, with the applicable checklist items.
- **Track each document:** Document date (**Deed only**); Review recordable docs; Address cert (**Deed and Mortgage only**); Exhibit A; and Sent for recording. Non-applicable cells show a dash and do not count against progress.
- **Edit:** Each checklist button cycles **blank → ✓ checked → N/A → blank** with successive clicks. A checked or N/A requirement counts as resolved. Delete individual documents or whole files (after confirmation).
- **Find files:** Search by file number or document name; filter by transaction type or completion.
- **Review progress:** See per-file progress and summary metrics, including documents ready to send (all applicable pre-sending requirements resolved, and the sent status still blank).
- **Backup:** Export everything to `.json`, re-import from `.json`, or export a spreadsheet-friendly `.csv` file.
- **Demo:** Optionally load the three example files shown in the screenshot.

## Open it locally

Download all three application files into one folder and open `index.html` in a modern browser.

## Publish on GitHub Pages

1. On GitHub, create a new repository (suggested name: `recording-desk`).
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md` to the **root** of the `main` branch (or push them with Git).
3. In the repository choose **Settings → Pages → Build and deployment**.
4. Under **Source**, select **Deploy from a branch**. Set branch to `main`, folder to `/ (root)`, and **Save**.
5. GitHub should display your website's URL when deployment completes, typically `https://YOUR-USERNAME.github.io/recording-desk/`.

> **Important:** GitHub Pages serves a website, not a database. The checklist data in this version is saved in the local browser using `localStorage`. Two different browsers or devices will **not share the same files or changes**. Clearing browser site data can permanently erase local files. Export JSON backups regularly. If this is used for real business records, add authenticated cloud storage, shared synchronization, backups, and access controls before making it a multi-user production tool. A public Pages site is publicly reachable; do not use it for confidential borrower records as-is.

## Updating from the previous version

- The local browser storage key and JSON backup format remain compatible with v1; existing checked/unchecked statuses continue working. N/A is saved in backups and exported as `N/A` in CSV.
- **New** purchase/refinance files use the new default document lists. Existing files are not automatically pruned, so manually added documents and previous recording history are not silently deleted.
- Existing non-applicable checklist values are preserved in backups but hidden and excluded from progress and CSV output.

## Template and checklist configuration

Open `app.js` and edit the `TEMPLATES` object to change automatically added documents, or the `CHECKLIST` array to change the checkbox columns. Changes to checklist structure may need a data migration when existing saved backups are present.

## Project files

- `index.html` — layout and dialogs
- `styles.css` — responsive styling
- `app.js` — application logic and local storage
- `README.md` — documentation and setup

No JavaScript packages, accounts, or servers required for this first version.