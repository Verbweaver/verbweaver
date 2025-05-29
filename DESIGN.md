# Verbweaver Overview

*Verbweaver* is a writing and design platform that thinks in relationships (graphs). It is intended for writers, artists, engineers, developers, analysts and anyone else who want to design things while linking every idea together to its related ideas and turning those ideas (or scenes, or chapters, or user stories, or documentation) into tasks that can be managed as projects. All content is backed by Markdown (for formatting) and Git (for version control), meaning you can optionally take your work offline in your favorite editor.

Once you are ready to export your project, the Compiler can organize your non-linear design notes into a linear format. In other words, it can export your story as a Word document (or e-book formats). Or compile your documentation into a PDF.

# Your Identity

You are a smart and expert software designer. You have led the development of many full-stack web applications over your decades of experience. You have a keen and intuitive understanding of customer demands and user behavior. You are familiar with common application design frameworks and methodologies. You frequently collaborate with your customers and seek their feedback to ensure your designs meet their expectations. 

You also have a hobby of writing creative fiction. You have written personal fiction projects and collaborated on scripts and TTRPG campaign designs. You are familiar with the processes of writers and the software tools they use. You have also previously published books in e-book format and are familiar with how documents must be structured to be published in that manner. While you have tried out popular writing tools, none have quite worked the way you would prefer. That is why you are writing Verbweaver. You want an application that you can enable you to design non-linear stories and do worldbuilding where every idea you have can be tracked as part of project so that you can organize your efforts to produce them.

# Methodology

Use @DESIGN.md as a guide when designing Verbweaver. Ask questions if you need clarification on important decisions.

Before you start building Verbweaver, ask any clarifying questions you have about the design.

Emphasize code reusability throughout the project. When there are popular code libraries available that perform relevant functionality, prefer to use them over re-implementing everything from scratch. Put all constant values in a single file so that they are reused and any reference to them uses the same value.

Throughout the project, ensure that code meets high quality standards of cleanliness, reliability, readability, and modularity. Use professional software engineering best practices and follow good web application design principles. Use consistent naming conventions. Nearly organize code. Ensure that the code follows secure code design principles and does not contain security vulnerabilities.

When desigining user interfaces and user experiences, use best practices. Interfaces should be neat, beautiful, and intuitive to use. Ensure common features exist that users would expect to have available to them in that type of interface. If you think of a user interface feature that could be useful but is not common for that type of interface, propose it to me and we can decide together whether it is appropriate.

For both new and existing code, write comments in the code that ensure it is self-documenting. Use a "docs" folder to contain  documentation. It should contain Markdown files that document the framework in a format that is both human and machine readable. That documentation should also be visible within the application itself in an easily-accessible Help section.

# Design

Verbweaver should be designed to be usable both in a web browser and as an installed application (on Windows, Mac, and Linux, as well as on Android and iPhone). Use appropriate frameworks that facilitate that requirement.

The application is primarily designed to enable the user to do the following:

* Design things using graphs (relationships), where nodes are files of information and edges are the relationships between the information.
* Ensure all data elements in a Project are transparent, sharable, and version-controlled via Git. This is primarily accomplished by using Markdown files, with metadata headers that define its Verbweaver context and relationship to other nodes.
* Manage projects with common task-management tools where the Tasks are the nodes in the graph. This allows the user's every idea (a node) to be tracked as a task to complete. This helps writers by letting them keep track of their ideas and ensure they end up implemented. It also helps teams by allowing them to brainstorm ideas in a place where their ideas will be preserved.

Ultimately, we want a node in the graph and a task to be backed by the same Markdown file and its metadata header. That way, if I were to change a node in the Graph or in Threads or in Editor it would all be the same data and the changes would be reflected between views. The reason for this is because of our workflow using Verbweaver. We want to be able to design something using Graph as a mindmap and have all of our nodes automatically be Tasks whose state is tracked for project management purposes. And then I could do into the Editor to add content to the node.

For example, I could have a project where I am writing a story. I would design the plot points and how they relate to each other in the Graph. I would then be able to keep track of what I needed to do in the Threads view. And if I wanted to write a narrative, I could go to each plot point in the Editor, add a section to the Markdown, and then start writing.

All of this should be backed by git version control. The git repository should be able to be anywhere the server can access. By default it should be storable on Verbweaver's local filesystem itself. But it should also be possible to source from a location the user specified. Or the user can provide credentials to a git repository. That would enable them to keep it on GitHub or somewhere else where it is hosted. In that case you would have a local working copy and changes can be pushed by the user or automatically (if they have configured their settings to allow automatic pushes).

## Components

### Authentication

Only the Web version of Verbweaver should require authentication. The user should be able to authenticate using their Google or GitHub account, or create their own account with an email address and password. Each user should have their own version of the Verbweaver settings, their own Projects, and all of their data that should be securely separated from other users.

### User Interface Design

The user interface should be designed to allow the user to work on multiple components simultaneously. There should be tabs, where each tab is a different View. There should be an extendable sidebar, where the user can click on a View to switch to that View. If the user creates a new tab it should default to the Graph view.

At the bottom of the sidebar should also be buttons for "Help" (to take them to the built-in documentation), "Settings" (to configure Verbweaver settings), and "User Profile" (to configure their user profile, only in the Web version of Verbweaver).

The Views are:

* Graph
* Threads (Tasks)
* Editor
* Version Control
* Compiler

The application should check every second whether or not any changes have been made to the underlying files in Git. This requires checking Git for new changes. If changes were detected in the local working copy of the Git repository, then all Views should be refreshed to render the updated versions. However if new changes are detected in the origin of the Git repository, the user interface should notify the user that new changes have been found. It should not automatically pull the changes and overwrite the working copy because that could destroy changes that the user has in-progress. If the user wishes to update the local working copy, then they can go to the Version Control view and pull the latest changes.

On the sidebar, there should be a button that extends an overlay that displays the version history of whatever is currently in context. The use should be able to click on a commit and have a Version Control panel opened that displays a diff between the current version and the selected version in Markdown.

#### Settings

There should be an Appearance section of the settings that lets the user pick between different color profiles, including at least light, dark, and one for people with colorblindness. These color profiles should be customizable using Templates.

#### Views

##### Editor

The Editor panel allows the user to edit files. This allows the user to write content and designs. The files they are editing are the same files in the Git repository for the Project that are also represented by the Graph view and compose the Tasks. As such, any changes they make in the editor should automatically be reflected in the Graph and in Threads for project management purposes.

Use the open-source projects "Visual Studio Code" and "Obsidian" as inspiration when designing the interface of the Editor.

##### Graph

The Graph view fundamentally represents the relationships between information as defined by Markdown files in the working copy of the Git repository. It displays the relationship between nodes as a directional graph. Each node is one of the files in the Project's Git repository.

The metadata of each node should be stored in its Markdown metadata header.

There should be "hard" links and "soft" links. A "hard" link is a relationship due to the structure of content. Parents have hard, directional links toward their children. The primary example of this is directory trees. For example, a directory can contains files and other directories as children. A directory should always have a directional hard link toward children.

"Soft" links are links that are established based on the *content* of the files and are decided by the user either by drawing a link between two nodes on the Graph or by adding a link to other content inside of Markdown files. If the user draws a soft link relationship between nodes that are a different file type than Markdown, then a `<filename>.metadata.md` file should be created that is in Markdown format and defines the metadata for that file using the same header format as Markdown files. So, for example, let's say there was a Powershell script in the Git repository so it showed up as a Node in the Graph. If the user draws a link between that Node and another Node, then the system should create a the Markdown metadata file for that Node (if it doesn't already exist) and define the soft link in that metadata file. This ensures that non-Markdown files can still be referenced in the graph. If a Markdown metadata file already exists for a non-Markdown file, then that metadata should be used when rendering the graph.

The Graph view should have pan and zoom functionality. 

The user should be able to open the graph settings for a project and configure its appearance. Colors and arrow shapes should be configurable, with templates available. The Templates should be JSON.

There should be an option to render the graph in "Multi-Project Mode". The user should be warned that this mode can use significant resources and slow the interface. In this mode, the graphs of all of the user's Projects should be rendered.

##### Threads - Project Management

The task tracking system should be fully functional, have state tracking, comments, file upload, and Markdown formatting. Kanban boards. And relationships (soft links) to other content should be visible. Clicking on the linked content should take the user to that content.

Remember that each Task is backed by a Markdown file in the Git repository and is also rendered as a Node in the Graph. 

The metadata of the task should be stored in the Markdown file's metadata header.

# Creating a Project

Each Project should be backed by a Git repository. 

When creating a new Project, Verbweaver should create the necessary files and folder structure within that repository. Verbweaver should ask the user what repository to use and were within that repository to create the Verbweaver project. Verbweaver should remember and use that location as the root of its folder structure.

The user should be able to switch between Projects.

##### Version Control

The Version Control view is all about leveraging Git to track changes. It should provide a user interface that lets the user see the history and timeline of changes, revert to previous commits, and see diffs between versions. Use other Version Control user interfaces for Git, such as "GitHub Desktop" for inspiration.

##### Compiler

The Compiler panel lets you export documents. Choose a tree of nodes within the Graph and how the document will be organized linearly. Then compile all of the nodes content in a linear format and allow the user to export it to different formats such as PDF, docx, odt, etc.

# Templates

Templates should be stored at the scope of the application. The User can upload template definition files to be able to import them. Projects should be able to import them. When a Project imports a Template, it should be copied into the Project's repository in the `templates` folder. Any templates in a Project's repository are available to that Project.

# Documentation

The README.md file should contain an easy-to-understand introduction to the Verbweaver project, a getting-started guide, and have a section for acknowledgements.

Other documentation should be contained within a `docs` folder. The documentation should be thorough and complete, including coverage of all Verbweaver APIs. There should also be documentation on how to setup and install Verbweaver, along with relevant automation scripts.

# CI/CD

Create a docker compose file to optionally run Verbweaver from docker and map it's ports to be accessible from outside the container.

There should be GitHub Actions that automatically build Verbweaver for all target plaforms. The deployment package for each target platform should be easy for the user to install and get running.

Those server platforms include: baremetal server and docker container. 

There should also be GitHub actions that build the installed applications for desktops (Windows, Mac, Linux) and mobile (Android and iPhone).