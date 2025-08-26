# Security Checklist

## ⚠️ Before Production

1. **Change default secrets**
   ```bash
   # Generate new secret key
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. **Configure environment**
   ```env
   DEBUG=False
   SECRET_KEY=<generated-secret>
   DATABASE_URL=postgresql://...
   BACKEND_CORS_ORIGINS=https://yourdomain.com
   ```

3. **Update allowed hosts**
   - Configure nginx server_name
   - Update CORS origins
   - Set proper API URLs

4. **Enable monitoring**
   - Configure error tracking
   - Set up uptime monitoring
   - Enable performance monitoring

5. **Security scan**
   ```bash
   # Backend
   pip install pip-audit
   pip-audit
   
   # Frontend
   npm audit
   ```