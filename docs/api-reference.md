# API Reference

The Verbweaver API provides programmatic access to all features of the platform. This reference covers the REST API endpoints available at `/api/v1`.

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Most endpoints require authentication using JWT tokens.

### Obtain Token

```http
POST /auth/login
Content-Type: application/x-www-form-urlencoded

username=user@example.com&password=yourpassword
```

Response:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Using Token

Include the token in the Authorization header:

```http
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

## Endpoints

### Authentication

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/x-www-form-urlencoded
```

#### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer {token}
```

### Projects

#### List Projects
```http
GET /projects
Authorization: Bearer {token}
```

Response:
```json
[
  {
    "id": "proj_123",
    "name": "My Novel",
    "description": "A science fiction novel",
    "gitRepository": {
      "type": "local",
      "path": "./git-repos/my-novel"
    },
    "created": "2024-01-01T00:00:00Z",
    "modified": "2024-01-02T00:00:00Z"
  }
]
```

#### Create Project
```http
POST /projects
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "My New Project",
  "description": "Project description",
  "gitRepository": {
    "type": "local"
  }
}
```

#### Get Project
```http
GET /projects/{project_id}
Authorization: Bearer {token}
```

#### Update Project
```http
PUT /projects/{project_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

#### Delete Project
```http
DELETE /projects/{project_id}
Authorization: Bearer {token}
```

### Graph Operations

#### Get Graph
```http
GET /projects/{project_id}/graph
Authorization: Bearer {token}
```

Response:
```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "document",
      "title": "Chapter 1",
      "metadata": {...},
      "position": {"x": 100, "y": 100}
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "type": "reference"
    }
  ]
}
```

#### Create Node
```http
POST /projects/{project_id}/graph/nodes
Authorization: Bearer {token}
Content-Type: application/json

{
  "type": "document",
  "title": "New Node",
  "content": "# New Node\n\nContent here...",
  "metadata": {
    "tags": ["important"]
  }
}
```

#### Update Node
```http
PUT /projects/{project_id}/graph/nodes/{node_id}
Authorization: Bearer {token}
```

#### Delete Node
```http
DELETE /projects/{project_id}/graph/nodes/{node_id}
Authorization: Bearer {token}
```

#### Create Edge
```http
POST /projects/{project_id}/graph/edges
Authorization: Bearer {token}
Content-Type: application/json

{
  "source": "node_1",
  "target": "node_2",
  "type": "reference",
  "label": "relates to"
}
```

### Tasks

#### List Tasks
```http
GET /projects/{project_id}/tasks
Authorization: Bearer {token}
```

#### Create Task
```http
POST /projects/{project_id}/tasks
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Write Chapter 1",
  "description": "Complete the first draft",
  "status": "todo",
  "priority": "high",
  "dueDate": "2024-02-01T00:00:00Z"
}
```

#### Update Task
```http
PUT /projects/{project_id}/tasks/{task_id}
Authorization: Bearer {token}
```

#### Move Task
```http
PATCH /projects/{project_id}/tasks/{task_id}/move
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "in_progress"
}
```

### Editor

#### Get File
```http
GET /projects/{project_id}/files/{file_path}
Authorization: Bearer {token}
```

#### Save File
```http
PUT /projects/{project_id}/files/{file_path}
Authorization: Bearer {token}
Content-Type: application/json

{
  "content": "File content here..."
}
```

#### Delete File
```http
DELETE /projects/{project_id}/files/{file_path}
Authorization: Bearer {token}
```

### Version Control

#### Get Commits
```http
GET /projects/{project_id}/git/commits
Authorization: Bearer {token}
```

#### Create Commit
```http
POST /projects/{project_id}/git/commit
Authorization: Bearer {token}
Content-Type: application/json

{
  "message": "Updated chapter 1",
  "files": ["chapter1.md"]
}
```

#### Get Diff
```http
GET /projects/{project_id}/git/diff?from={commit1}&to={commit2}
Authorization: Bearer {token}
```

### Compiler

#### Export Project
```http
POST /projects/{project_id}/export
Authorization: Bearer {token}
Content-Type: application/json

{
  "format": "pdf",
  "nodes": ["node_1", "node_2"],
  "template": "default",
  "options": {
    "includeMetadata": false,
    "pageSize": "A4"
  }
}
```

Response:
```json
{
  "exportId": "exp_123",
  "status": "processing",
  "downloadUrl": null
}
```

#### Check Export Status
```http
GET /projects/{project_id}/export/{export_id}
Authorization: Bearer {token}
```

## WebSocket Events

Connect to receive real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws?token={token}');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data.data);
};
```

### Event Types

- `file-changed`: File was modified
- `node-created`: New node added to graph
- `node-updated`: Node properties changed
- `edge-created`: New edge added
- `task-moved`: Task status changed
- `user-joined`: User joined project
- `user-left`: User left project

## Rate Limiting

API requests are limited to:
- 60 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users

Rate limit headers:
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1609459200
```

## Error Responses

```json
{
  "detail": "Error message",
  "code": "ERROR_CODE",
  "field": "field_name" // For validation errors
}
```

Common error codes:
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `422`: Validation Error
- `429`: Too Many Requests
- `500`: Internal Server Error

## SDK Examples

### Python
```python
import requests

class VerbweaverAPI:
    def __init__(self, base_url, token=None):
        self.base_url = base_url
        self.token = token
        
    def get_projects(self):
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(f"{self.base_url}/projects", headers=headers)
        return response.json()
```

### JavaScript
```javascript
class VerbweaverAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }
  
  async getProjects() {
    const response = await fetch(`${this.baseUrl}/projects`, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    return response.json();
  }
}
```

## OpenAPI Specification

The full OpenAPI specification is available at:
```
http://localhost:8000/api/v1/openapi.json
```

Interactive documentation:
```
http://localhost:8000/api/v1/docs
``` 