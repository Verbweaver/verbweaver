# Passkey (WebAuthn) Authentication Setup

This guide details how to configure the Verbweaver server to support Passkey (WebAuthn) authentication. Passkeys offer a secure and user-friendly alternative to passwords.

## Prerequisites

1.  **Verbweaver Backend Setup**: Ensure you have followed the general backend setup instructions in the [Getting Started guide](./getting-started.md).
2.  **HTTPS Environment (for Production)**: WebAuthn for creating and using passkeys (especially platform authenticators) requires a secure context (HTTPS) in production. For local development (`localhost`), HTTP is usually permitted by browsers.
3.  **Redis Server**: Passkey authentication in Verbweaver uses Redis for secure, temporary storage of WebAuthn challenges. Ensure a Redis server is running and accessible to the Verbweaver backend.

## Configuration

1.  **Environment Variables**: Open your `.env` file in the `backend/` directory and configure the following variables:

    ```env
    # ... other settings ...

    # --- Passkey (WebAuthn) Settings ---    
    # Relying Party ID (your domain name, e.g., verbweaver.com - NO scheme or port)
    WEBAUTHN_RP_ID=localhost 
    # WEBAUTHN_RP_ID=yourdomain.com # For production

    # Relying Party Name (Human-readable name for your service)
    WEBAUTHN_RP_NAME=Verbweaver

    # Expected Origin (Full origin of your frontend, e.g., https://app.yourdomain.com or http://localhost:5173 for dev)
    # Defaults to FRONTEND_URL if not set, but explicit is better for WebAuthn.
    WEBAUTHN_EXPECTED_ORIGIN=http://localhost:5173
    # WEBAUTHN_EXPECTED_ORIGIN=https://app.yourdomain.com # For production
    
    # Timeout for WebAuthn challenges in seconds
    WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS=120

    # --- Redis Configuration (Required for Passkey) ---
    # Ensure this is set and your Redis server is running
    REDIS_URL=redis://localhost:6379/0
    # Example for a Redis server with a password:
    # REDIS_URL=redis://:yourpassword@localhost:6379/0
    
    # --- Frontend URL (Used by WEBAUTHN_EXPECTED_ORIGIN if not set explicitly) ---
    FRONTEND_URL=http://localhost:5173
    # FRONTEND_URL=https://app.yourdomain.com # For production
    ```

    **Important Notes on Configuration:**
    *   `WEBAUTHN_RP_ID`: This **must** be the effective domain of your application. For production, if your site is `https://app.verbweaver.com`, the `WEBAUTHN_RP_ID` would typically be `verbweaver.com` or `app.verbweaver.com`. It **must not** include `https://` or port numbers. Browsers use this to scope credentials.
    *   `WEBAUTHN_EXPECTED_ORIGIN`: This **must** exactly match the origin from which the WebAuthn JavaScript API (`navigator.credentials.*`) calls are made on the frontend. It includes the scheme (e.g., `http` or `https://`) and port if non-standard.
    *   `REDIS_URL`: If Redis is not running or this URL is incorrect, Passkey operations will fail.

2.  **Install Dependencies**: Ensure all necessary Python packages are installed, including those for Passkey support:
    ```bash
    # Navigate to the backend directory
    cd backend

    # Activate your virtual environment (if you have one)
    # Windows PowerShell: .\.venv\Scripts\Activate.ps1
    # Linux/macOS: source .venv/bin/activate

    pip install -r requirements.txt
    ```
    This will install `py_webauthn` for WebAuthn logic and `redis` for connecting to your Redis server.

## Database Migrations (Alembic)

Passkey support adds a new table (`user_passkeys`) to the database to store user passkey credentials. You need to apply database migrations using Alembic to create this table.

Alembic is a database migration tool for SQLAlchemy. If you haven't used it before in this project, you might need to initialize it first.

**Assuming Alembic is already set up in your project (`backend/alembic` directory and `alembic.ini` file):**

1.  **Generate a New Migration Script**:
    After adding the `UserPasskey` model and updating `User` model, Alembic needs to detect these changes and generate a migration script.

    ```bash
    # Ensure you are in the backend/ directory and your virtual environment is active.
    
    # The following command tells Alembic to compare the current state of your SQLAlchemy models
    # with the current state of your database (as tracked by previous migrations) 
    # and generate a new revision script with the differences.
    alembic revision -m "add_user_passkeys_table"
    ```
    This will create a new file in your `backend/alembic/versions/` directory (e.g., `xxxx_add_user_passkeys_table.py`).

2.  **Review and Edit the Migration Script**:
    Open the newly generated migration script. Alembic does its best to auto-generate the migration, but you **must review it carefully**. 
    Ensure it correctly creates the `user_passkeys` table with all the necessary columns, types, constraints (foreign keys, unique constraints), and indexes as defined in your `UserPasskey` model in `backend/app/models/user.py`.

    It should look something like this (exact details may vary):
    ```python
    """add_user_passkeys_table

    Revision ID: <your_revision_id>
    Revises: <previous_revision_id_or_None>
    Create Date: <timestamp>
    """
    from alembic import op
    import sqlalchemy as sa

    # revision identifiers, used by Alembic.
    revision = '<your_revision_id>'
    down_revision = '<previous_revision_id_or_None>'
    branch_labels = None
    depends_on = None

    def upgrade():
        # ### commands auto generated by Alembic - please adjust! ###
        op.create_table('user_passkeys',
            sa.Column('id', sa.String(), nullable=False),
            sa.Column('user_id', sa.String(), nullable=False),
            sa.Column('credential_id', sa.LargeBinary(), nullable=False),
            sa.Column('public_key', sa.LargeBinary(), nullable=False),
            sa.Column('sign_count', sa.Integer(), nullable=False, default=0),
            sa.Column('transports', sa.JSON(), nullable=True),
            sa.Column('device_name', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_user_passkeys_credential_id'), 'user_passkeys', ['credential_id'], unique=True)
        # You might also need to adjust the User model if 'provider' choices were modified or other changes.
        # Example: op.alter_column('users', 'provider', ...)
        # ### end Alembic commands ###

    def downgrade():
        # ### commands auto generated by Alembic - please adjust! ###
        op.drop_index(op.f('ix_user_passkeys_credential_id'), table_name='user_passkeys')
        op.drop_table('user_passkeys')
        # Revert User model changes if any
        # ### end Alembic commands ###
    ```
    Pay close attention to `nullable`, `default` values, `ForeignKeyConstraint`, and `create_index` for `credential_id` (it must be unique).
    The `server_default` for `created_at` might need to be `sa.func.now()` if you used that in your model, or `sa.text('(CURRENT_TIMESTAMP)')` for SQLite.

3.  **Apply the Migration to the Database**:
    Once you are satisfied with the migration script, apply it to your database:
    ```bash
    # Ensure you are in the backend/ directory and your virtual environment is active.
    alembic upgrade head
    ```
    This command applies all pending migrations up to the latest one (`head`). Your `user_passkeys` table should now be created in the database.

**If Alembic is NOT yet initialized in your project:**

1.  **Install Alembic** (if not already in `requirements.txt`):
    ```bash
    pip install alembic
    ```
2.  **Initialize Alembic**:
    Navigate to your `backend/` directory and run:
    ```bash
    alembic init alembic
    ```
    This creates an `alembic` directory and an `alembic.ini` file.
3.  **Configure Alembic**:
    *   Edit `alembic.ini`: Set `sqlalchemy.url` to your database connection string (same as `DATABASE_URL` in your `.env`).
        ```ini
        sqlalchemy.url = sqlite+aiosqlite:///./verbweaver.db 
        # Or for PostgreSQL, etc.:
        # sqlalchemy.url = postgresql+psycopg2://user:password@host/dbname
        ```
    *   Edit `alembic/env.py`:
        *   Around line 20, ensure `target_metadata` points to your SQLAlchemy Base metadata. Import your models:
            ```python
            # add your model's MetaData object here
            # for 'autogenerate' support
            # from myapp import mymodel
            # target_metadata = mymodel.Base.metadata
            from app.db.base import Base  # Adjust import path as necessary
            from app.models import User, UserPasskey # Ensure all models are imported
            target_metadata = Base.metadata
            ```
        *   Further down in `env.py`, within the `run_migrations_online()` function, ensure the `connection` is used correctly, especially for async databases like SQLite with `aiosqlite`.
           You might need to adapt the `run_migrations_online` for async: Refer to Alembic and SQLAlchemy documentation for async setup. A common pattern involves using `AsyncEngine` and `conn.run_sync()`.

           A simplified async setup might look like this (consult Alembic/SQLAlchemy async docs for best practices):
           ```python
            # ... inside run_migrations_online()
            connectable = context.config.attributes.get("connection", None)

            if connectable is None:
                # only create Engine if we don't have a Connection
                # from context (typically Hexagonal CQRSLite)
                connectable = create_engine(
                    context.config.get_main_option("sqlalchemy.url"),
                    poolclass=pool.NullPool,
                    # For async, you need an async engine. This example is for sync.
                    # For async, use AsyncEngine from sqlalchemy.ext.asyncio
                )

            # For async with Alembic:
            # import asyncio
            # from sqlalchemy.ext.asyncio import create_async_engine
            # async_engine = create_async_engine(context.config.get_main_option("sqlalchemy.url"))

            # async def run_async_migrations():
            #     async with async_engine.connect() as connection:
            #         await connection.run_sync(do_run_migrations)

            # def do_run_migrations(connection):
            #     context.configure(
            #         connection=connection,
            #         target_metadata=target_metadata
            #     )
            #     with context.begin_transaction():
            #         context.run_migrations()
            
            # if os.environ.get("ALEMBIC_CONTEXT") == "SYNC": # sync context (e.g. from CLI)
            #     with connectable.connect() as connection:
            #         context.configure(
            #             connection=connection, target_metadata=target_metadata
            #         )
            #         with context.begin_transaction():
            #             context.run_migrations()
            # else: # async context (e.g. from app)
            #     asyncio.run(run_async_migrations())
           ```
           **Note**: Async Alembic setup can be complex. The `init_db.py` script you have might create tables directly. If so, ensure Alembic is configured to not interfere or that you transition to Alembic fully for schema management.
           For a project already using `init_db.py` to call `Base.metadata.create_all()`, the simplest way to use Alembic for new changes is to:
           1. Ensure `env.py` can import your `Base` and all models.
           2. Run `alembic revision -m "baseline_schema_sync" --autogenerate` to get an initial migration reflecting your existing `create_all` schema if the database is empty or matches `create_all`.
           3. Or, if the database already exists and has tables, you might need to `alembic stamp head` to tell Alembic the DB is up-to-date, then generate migrations for *new* changes like `UserPasskey`.

4.  Once Alembic is configured, proceed with **Step 1 (Generate)** and **Step 3 (Apply)** from the "Assuming Alembic is already set up" section above.

## Restart the Server

After completing the configuration and database migrations, restart the Verbweaver backend server for the changes to take effect.

Your server should now be ready to handle Passkey registration and login requests.

## Next Steps

-   Implement the Passkey registration and login UI on the frontend.
-   Thoroughly test the Passkey authentication flow.
-   Review the [Security Checklist](../security-checklist.md) for other important security considerations. 