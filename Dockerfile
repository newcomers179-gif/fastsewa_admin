# FastSewa admin dashboard — static files served by nginx.
# Configure with environment variables at run time:
#   API_BASE   backend API URL, e.g. https://api.fastsewa.com/api   (required)
#   PORT       port to listen on (default 8080; Render/Railway set this)
FROM nginx:1.28-alpine

ENV PORT=8080

COPY index.html dashboard.html admin.js login.js admindashboard.css config.js /usr/share/nginx/html/
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/15-fastsewa-config.envsh /docker-entrypoint.d/15-fastsewa-config.envsh
RUN chmod +x /docker-entrypoint.d/15-fastsewa-config.envsh \
    && rm -f /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
