# Orphic Hymns (Ὀρφικοὶ ὕμνοι), polytonic Greek

`orphic-hymns.json`: the proem *Εὐχὴ πρὸς Μουσαῖον* (n=0) and hymns 1 to 87, 88 texts, 1106 lines. UTF-8, NFC.

- **Source:** Greek Wikisource, https://el.wikisource.org/wiki/Ορφικοί_ύμνοι and its 88 subpages. Fetched 2026-11-18 through the MediaWiki API (`action=parse&prop=text`). Nothing was typed by hand.
- **Edition:** Eugenius Abel (ed.), *Orphica*, 1885. Wikisource transcludes it from the proofread scan `Orphica, ed. Eugenius Abel (1885).djvu`.
- **License:** the 1885 edition is public domain. The Wikisource transcription is CC BY-SA 4.0, so credit Wikisource if you redistribute it.
- **Order and titles:** taken from the Wikisource table of contents. Abel's numbering matches the usual Quandt numbering: 1 Hekate, 15 Zeus, 34 Apollo, 55 Aphrodite, 87 Thanatos. Titles are the edition's own short genitive headings (for example "Διός"). Hymn 61 is titled "Νεμέσεως ὕμνος" on its page.
- **Incense:** `incense` holds the θυμίαμα line where the edition prints one. It is null for 0, 1, 18, 29, 31, 45, 48, 50, 55, 61 and 64, where the source prints none.
- **Checks:** the lines are the poem blocks with the margin line numbers removed. Hymn 51 had inline "(10)" and "(15)" markers, which were stripped. Every line was asserted to contain no Latin letters, digits or markup. The numbers run 0 to 87 with no gaps. Line counts range from 6 to 30, and the proem has 44.
- **Missing:** none. **Doubtful:** none found. Apparatus and variant readings are not included.
