# Live theme JSON

These are the files the Shopify theme editor owns. They are pulled *off the
live theme*, not written from the repo, because the operator edits them in the
editor while work is in progress.

Before changing any of them: read the live copy, merge the change into it, write
that back. Uploading a copy built from the repo alone silently discards whatever
he set in the editor.

`sections/*.liquid` and `assets/gb.css` are the opposite — those are ours and
safe to overwrite.
