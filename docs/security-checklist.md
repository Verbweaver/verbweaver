# Security Checklist

This checklist should be reviewed before deploying Verbweaver to production.

## ✅ Authentication & Authorization

- [ ] Strong password policy enforced (min 8 chars, uppercase, lowercase, digit, special char)
- [ ] Account lockout after 5 failed login attempts
- [ ] JWT tokens expire after 30 minutes
- [ ] Refresh tokens rotate on use
- [ ] Password reset tokens expire after 1 hour
- [ ] Email verification required for new accounts
- [ ] OAuth providers configured with proper redirect URLs
- [ ] CORS origins properly configured

## ✅ Data Protection

- [ ] All passwords hashed with bcrypt
- [ ] Database connections use SSL/TLS
- [ ] Sensitive data encrypted at rest
- [ ] File uploads validated and sanitized
- [ ] File size limits enforced (10MB default)
- [ ] Allowed file extensions whitelisted

## ✅ API Security

- [ ] Rate limiting enabled (60 req/min authenticated, 20 unauthenticated)
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention via ORM
- [ ] XSS protection headers enabled
- [ ] CSRF protection for state-changing operations
- [ ] API keys rotated regularly

## ✅ Infrastructure

- [ ] HTTPS enforced with valid SSL certificates
- [ ] TLS 1.2+ only
- [ ] Security headers configured (HSTS, CSP, etc.)
- [ ] Secrets stored in environment variables
- [ ] Docker images regularly updated
- [ ] Firewall rules configured
- [ ] SSH access restricted

## ✅ Monitoring & Logging

- [ ] Failed login attempts logged
- [ ] Security events monitored
- [ ] Error tracking configured (e.g., Sentry)
- [ ] Log rotation configured
- [ ] Sensitive data excluded from logs
- [ ] Audit trail for critical operations

## ✅ Development Practices

- [ ] Dependencies regularly updated
- [ ] Security vulnerabilities scanned (npm audit, pip-audit)
- [ ] Code reviews required for PRs
- [ ] Secrets never committed to Git
- [ ] .env files in .gitignore
- [ ] Production configs separated from development

## ✅ Backup & Recovery

- [ ] Database backups automated
- [ ] Git repositories backed up
- [ ] Disaster recovery plan documented
- [ ] Backup restoration tested
- [ ] Point-in-time recovery available

## ✅ Compliance

- [ ] GDPR compliance (if applicable)
- [ ] Data retention policies defined
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] User data export available
- [ ] Account deletion process

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

## 📞 Security Contacts

- Security Team: security@verbweaver.com
- Bug Bounty: bugbounty@verbweaver.com
- Emergency: +1-XXX-XXX-XXXX 