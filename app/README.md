# CPF Master Checklist – local demo

Runs fully offline. No install step, no dependencies.

## Start
- Windows: double-click `start.bat` (opens http://localhost:3000)
- Mac/Linux: `./start.sh`, then open http://localhost:3000
- Or manually: `node server.js`  or  `python -m http.server 3000`

Needs Node.js or Python (either one). Change the port with `set PORT=8080` (Windows) or `PORT=8080 node server.js`.

## How to use it
- **Single click** a check in the matrix to open its answers.
- **Double click** a check to open the full detail panel in edit mode.
- **+ on a section heading** adds a new check to that section. It warns you about look-alike checks before saving.
- **Where it's used**: click any box to tick or untick a document.
- **Export PDF**: pick any mix of units and service levels; one document per page.

## Notes
- Data: 604 checks from the InTouch ACP rev 18 export, embedded in `index.html`.
- Answers are good/defect only; the source's Issue and Exclusive columns were always inverse.
- Sync statuses (pending/drift) are simulated. Changes reset on refresh.
