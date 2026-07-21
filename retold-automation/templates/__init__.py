"""RETOLD print-ready PDF template component (Component 2).

Exposes the WeasyPrint renderer used by the engine (engine/produce.py) to turn
one order's book.json into interior.pdf + cover.pdf:

    from templates.render_pdf import render
    render(book_json_path, assets_dir, out_dir)

If WeasyPrint/Jinja2 are not installed on the box, importing render_pdf raises
and the engine falls back to its pure-Python proof renderer, so a --mock run
always completes with openable PDFs.
"""
