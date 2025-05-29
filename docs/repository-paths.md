# Repository Path Management in Verbweaver

Verbweaver handles project repository paths differently depending on whether you're using the web or desktop version of the application.

## Web Version

In the web version of Verbweaver:

- **Default Storage**: All projects are stored on the Verbweaver server in a secure location
- **No Path Selection**: Users cannot specify custom paths since they don't have access to the server's filesystem
- **Project Management**: Users can view and manage all their projects through the Project List interface
- **Server Storage**: Projects are stored in the server's `git-repos` directory, organized by user ID and project name
- **Remote Repositories**: Users can optionally connect to remote Git repositories (GitHub, GitLab, etc.) by providing repository URLs and credentials

### Creating a Project (Web)

1. Click "New Project" in the project list
2. Enter a project name and optional description
3. The project will be created on the server and appear in your project list
4. You can access your project from any device by logging into your Verbweaver account

## Desktop Version

In the desktop version of Verbweaver:

- **Full Control**: Users have complete control over where their projects are stored
- **Custom Paths**: When creating a project, users can browse and select any location on their local filesystem
- **Local Storage**: Projects are stored directly on your computer in the location you specify
- **Existing Projects**: You can open existing Git repositories or create new ones
- **Privacy**: Your project data never leaves your computer unless you explicitly configure remote Git synchronization

### Creating a Project (Desktop)

1. Click "New Project"
2. Enter a project name and optional description
3. Click "Browse" to select where you want to store the project
4. The project will be created at your chosen location
5. Verbweaver will initialize a Git repository in that location

## Git Repository Structure

Regardless of where a project is stored, Verbweaver maintains a consistent structure:

```
project-root/
├── .git/                 # Git repository data
├── .gitignore           # Git ignore rules
├── nodes/               # Your content nodes (Markdown files)
├── templates/           # Project templates
│   └── Empty.md        # Default empty template
└── .verbweaver/        # Verbweaver-specific data (if needed)
```

## Remote Repository Support

Both web and desktop versions support remote Git repositories:

- **Clone Existing**: You can clone an existing remote repository
- **Push/Pull**: Synchronize changes with remote repositories
- **Auto-push**: Optionally enable automatic pushing of changes
- **Credentials**: Securely store credentials for private repositories

### Configuring Remote Repositories

1. When creating a project, select "Remote" as the repository type
2. Enter the repository URL (e.g., `https://github.com/username/project.git`)
3. Provide credentials if needed (for private repositories)
4. Choose whether to enable auto-push

## Best Practices

### For Web Users

- Use descriptive project names since you can't organize by folders
- Take advantage of the project description field for better organization
- Consider using remote repositories for backup and collaboration
- Use the search feature in the project list to quickly find projects

### For Desktop Users

- Organize projects in a dedicated folder (e.g., `C:\VerbweaverProjects` or `~/Documents/Verbweaver`)
- Use meaningful folder names that match your project names
- Consider backing up important projects to remote repositories
- You can move project folders after creation - Verbweaver will detect them when you open them

## Technical Details

### Web Storage

- Projects are stored in: `{SERVER_ROOT}/git-repos/{user_id}/{project_name}`
- Each user's projects are isolated from other users
- The server handles all Git operations
- Regular backups are recommended (configure in server settings)

### Desktop Storage

- Projects can be stored anywhere on your local filesystem
- Verbweaver remembers recently opened projects
- You can have multiple projects open in different windows
- Direct filesystem access allows integration with other tools

## Troubleshooting

### Web Version Issues

**Q: I can't see my projects**
- Ensure you're logged in with the correct account
- Check your internet connection
- Try refreshing the project list

**Q: Project creation fails**
- Check that your project name doesn't contain special characters
- Ensure you have sufficient storage quota (if applicable)
- Contact support if the issue persists

### Desktop Version Issues

**Q: I can't create a project in a specific location**
- Ensure you have write permissions for the selected folder
- Check that the path isn't too long (Windows limitation)
- Verify the folder isn't already a Git repository

**Q: Verbweaver can't find my project**
- Use "Open Project" and browse to the project location
- Ensure the `.git` folder exists in the project directory
- Check that you have read permissions for the project folder

## Migration Between Versions

### From Desktop to Web

1. Create a remote repository (GitHub, GitLab, etc.)
2. Push your desktop project to the remote repository
3. In the web version, create a new project with type "Remote"
4. Provide the repository URL and credentials

### From Web to Desktop

1. In the web version, configure a remote repository
2. Push your project to the remote repository
3. In the desktop version, clone the repository to your local machine
4. Open the cloned project in Verbweaver Desktop 