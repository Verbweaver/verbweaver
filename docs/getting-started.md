# Getting Started

This guide takes you from installing Verbweaver to writing in your first project.

## Install

Download the installer for your computer from the [Releases page](https://github.com/Verbweaver/verbweaver/releases).

| Computer | File to download |
|---|---|
| Windows | `Verbweaver-Setup-<version>.exe` |
| Mac with Apple silicon (M1 or later) | `Verbweaver-v<version>-arm64.dmg` |
| Mac with an Intel processor | `Verbweaver-v<version>-x64.dmg` |
| Linux | the `.AppImage`, or the `.deb` (Debian, Ubuntu) or `.rpm` (Fedora, RHEL) package |

Not sure which Mac you have? Open the Apple menu and choose **About This Mac**. "Chip: Apple M…" means Apple silicon.

- **Windows:** run the installer and follow the steps. If Windows SmartScreen warns you, click **More info**, then **Run anyway**.
- **Mac:** open the `.dmg` and drag Verbweaver into Applications. If macOS won't open it, go to **System Settings → Privacy & Security** and click **Open Anyway**.
- **Linux:** install the `.deb` or `.rpm` with your software installer, or make the `.AppImage` executable and double-click it.

### Also install Git

Verbweaver keeps the history of your work with Git, a free program that isn't included in the installer. You need it to create projects and save versions.

- **Windows:** install it from [git-scm.com](https://git-scm.com/downloads).
- **Mac:** open Terminal, type `git --version` and press Enter. If Git is missing, macOS offers to install it.
- **Linux:** install the `git` package with your software installer.

Then tell Git your name and email, which are recorded with each version you save. In a terminal (Command Prompt on Windows):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Everything else Verbweaver needs, including the tools for exporting to PDF, Word and e-book, comes with the app.

## Create your first project

A project is a folder on your computer that holds all your pages. When Verbweaver opens, you'll see the **Dashboard**.

1. Click **Create New Project**.
2. Enter a **Project Name** and, if you like, a **Description**.
3. Under **Project Location**, click **Browse** and choose an empty folder, or type the path of a new folder. Verbweaver creates the folder if it doesn't exist.
4. Click **Create Project**.

To open a project you already have, click **Open Existing Project** and choose its folder, or pick it from **Recent Projects**. To see a project's files on your computer, click **Open Project Folder**.

Your pages are ordinary text files, so you can back them up, sync them, or edit them in other programs. [Project Files and Folders](repository-paths.md) explains what's inside a project.

## Find your way around

Use the sidebar on the left to move between pages. Each page opens in a tab along the top, so you can keep several open at once. A tab remembers where you were, such as the guide you were reading in Help or the Settings page you had open, and Verbweaver reopens your tabs the next time you open the project. Click **+** to open another Graph tab. Every page has a **Help** button that opens its guide.

| Page | What it's for | Guide |
|---|---|---|
| **Editor** | Write and edit your pages. | [Editor](editor.md) |
| **Graph** | See how your pages connect, as a mind map, an outline, groups, or a chart. | [Graph View](graph-view.md) |
| **Tasks** | Track work on a board, a calendar, or a to-do list. | [Tasks](tasks.md) |
| **Version Control** | Save versions of your project and go back to earlier ones. | [Version Control](version-control.md) |
| **Compiler** | Turn your pages into one finished document, such as a PDF or Word file. | [Compiler](compiler.md) |

At the bottom of the sidebar:

- **Help** opens these guides.
- **Settings** changes how Verbweaver looks and behaves. You can also use **File → Settings**, or **Ctrl+,** (**⌘,** on Mac). See the [Settings](settings.md) guide.
- **Support** shows your version and links for reporting a problem or getting in touch.

[Keyboard Shortcuts](shortcuts.md) lists the keys for moving around quickly.

## Get updates

Verbweaver doesn't update on its own. To check for a new version, choose **Help → Check for Updates…**, or click **Check for Updates** on the **Support** page. If there is one, it downloads in the background, and you'll be asked to restart when it's ready.

## If something goes wrong

- **"Verbweaver couldn't start its background helper" when the app opens:** Verbweaver runs a small helper program in the background. Security software sometimes blocks it. Allow Verbweaver in your antivirus, then restart the app. If that doesn't help, reinstall Verbweaver. If it still fails, click **Report Issue** in the message and include the details it shows.
- **Saving a version fails:** check that Git is installed and that you've set your name and email (see [Also install Git](#also-install-git)).
- **Something else:** choose **Help → Report Issue** to tell us about it on GitHub. Include what you were doing and, if you can, a screenshot.
