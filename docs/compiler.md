# Compiler

The Compiler (the **Export Document** page) turns pages from your project into one finished document, such as a manuscript, a report, or an e-book. Pick the pages, put them in order, choose a format, and export.

![The Compiler: pages to include on the left, their order in the middle, and export settings on the right](images/compiler.png)

## 1. Choose your pages

In **Select Files** on the left, tick the pages to include. Ticking a folder includes everything inside it.

- **Select All** and **Clear All** help with large projects.
- **Filters** narrows the list, for example to pages with a certain tag.

## 2. Put them in order

**File Order** in the middle lists your chosen pages in the order they'll appear in the document.

- Drag a page up or down to move it.
- Use the **Sort** buttons to reorder quickly, for example alphabetically.
- Click **X** on a page to leave it out.

## 3. Choose how it looks

On the right:

- **Document Information:** enter the **Title** and **Author**. The title is also used as the file name.
- **Export Format:** pick Markdown, HTML, PDF, Word Document, OpenDocument, or EPUB.
- **Template** (optional): pick a ready-made layout if your project has one for that format. Some templates ask you to fill in extra details, such as a subtitle or a version number.
- **Options:** choose whether to include a table of contents, page details, and attached files such as images.

## 4. Export

Click **Compile and Download**. When it finishes, the desktop app asks where to save the document. In the web version, it goes wherever your browser saves downloads.

## Saving your setup

**Save Configuration** stores all your choices in a file. **Load Configuration** brings them back later, which is handy if you export the same document regularly.

## If something is missing

Exporting uses Pandoc and, for PDF, a PDF engine. Both come with the desktop app. If the Compiler shows a **Missing Dependencies** warning, see [Export Tools](dependency-checker.md).

## Learn more

Advanced: [Compiler Template System](compiler-template-system.md) explains how to build your own templates.
