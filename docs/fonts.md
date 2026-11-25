# Fonts

You can choose the fonts used in the documents you export from the [Compiler](compiler.md). Verbweaver can use any font installed on your computer.

## Where you can choose a font

- **For a whole document:** pick a **Font** in the Compiler. If your template already names a font, it's chosen for you.
- **For a template:** add `mainfont: Font Name` to the template's settings. See [Compiler Template System](compiler-template-system.md).
- **For some words or paragraphs:** write `[your words]{font="Font Name"}`, or put paragraphs between `::: {font="Font Name"}` and `:::`. See [Editor](editor.md).

Fonts work in PDF, HTML, EPUB, Word and OpenDocument exports. Markdown exports keep your font notes as they are.

## Which fonts you have

Open **Settings → Dependencies**. The **Fonts** list shows every font you can use, each one written in its own style. Type in the search box to find one.

In the web version, the list shows the fonts on the server that makes your documents, not the fonts on your own computer.

## Installing a new font

Download the font, usually a `.ttf` or `.otf` file. Many free fonts are available from sites such as [Google Fonts](https://fonts.google.com).

- **Windows:** right-click the font file and choose **Install**. (Choose **Install for all users** if you see it.)
- **Mac:** double-click the font file, then click **Install Font**.
- **Linux:** double-click the font file and click **Install**. Or copy it into the `.local/share/fonts` folder in your home folder.

Then go back to **Settings → Dependencies** and click **Refresh** under **Fonts**. If the new font still doesn't appear, restart Verbweaver.

**Web version on your own server:** the font has to be installed on the server. For Docker, add the font files to the server's image or copy them into its `/usr/share/fonts` folder, then restart it.

## Things to know

- **PDF:** the font has to be installed on the computer that makes the PDF. If it isn't, the export stops and tells you which font is missing.
- **Variable fonts:** some fonts come as a single "variable" file. PDF export can't use these. If you see a message about a variable font, install the font's standard (static) files instead. Most font downloads include them in a `static` folder.
- **Word, OpenDocument, EPUB and HTML:** these files name the font but don't include it. Anyone who opens the document needs the font installed too. Otherwise their app shows a similar font instead.
- **Font names:** use the name exactly as it appears in the Fonts list. Names can contain letters, numbers, spaces, dots, hyphens and `+`. Fonts with other characters in their names can't be chosen.
