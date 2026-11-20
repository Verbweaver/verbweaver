# Project Files and Folders

A Verbweaver project is an ordinary folder on your computer. Your pages are plain text files inside it, so you can back the folder up, sync it, or open the files in other programs.

## Where projects are kept

You choose the folder when you create a project (see [Getting Started](getting-started.md#create-your-first-project)). You can keep projects anywhere, for example in a `Verbweaver Projects` folder in your Documents.

Verbweaver remembers the projects you've opened and lists them under **Recent Projects** on the Dashboard. If you move or rename a project folder, open it again with **Open Existing Project**.

## What's inside a project

```
My Project/
├── README.md          an introduction to the project
├── nodes/             your pages, in whatever folders you create
├── uploads/           files you've uploaded or attached, such as images
├── templates/
│   ├── nodes/         starting layouts for new pages (Basic.md to begin with)
│   └── compiler/      layouts for exported documents, one folder per format
├── .verbweaver/       project settings, such as the outline order
└── .git/              the saved versions of your project
```

- **nodes/** is where you'll spend your time. Every page you create in the Editor or Graph is saved here as a `.md` file.
- **uploads/** appears the first time you upload or attach a file.
- **templates/** is your project's own copy of the templates. Change them in the Editor, or reset them from **Settings → Project → Re-seed templates into this project**.
- **.verbweaver/** and **.git/** are managed by Verbweaver. Folders starting with a dot are hidden on most computers. Leave them in place; deleting `.git` deletes your saved versions.

## Working with the files outside Verbweaver

You can edit pages in another text editor, or add Markdown files to `nodes/` yourself. To see the changes, click **Refresh files** at the top of the Editor's file list, or reopen the project. Save a version afterwards in [Version Control](version-control.md) so the changes are kept in the project's history.

## Web version

The web version is still in development. There, projects are stored on the server rather than on your computer, and you don't choose a folder.
