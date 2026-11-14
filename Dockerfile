# Dépendances PHP (PSR-3, PSR-20) et autoloader PSR-4 optimisé : sans les outils de développement
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
COPY src/ src/
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --classmap-authoritative --ignore-platform-reqs

FROM php:8.5-apache-trixie

# .htaccess de data/ (Require all denied) honoré ; l'alias /icons/ d'Apache (ses propres icônes) est retiré : le site a son dossier icons/
RUN a2enmod rewrite && \
    sed -ri 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf && \
    sed -i '/Alias \/icons\//d' /etc/apache2/mods-available/alias.conf

# data/ n'est jamais servi par le web, même si un bind-mount masque son .htaccess
RUN printf '<Directory /var/www/html/data>\n    Require all denied\n</Directory>\n' > /etc/apache2/conf-available/bramblekin-data.conf && \
    a2enconf bramblekin-data

# Site web (docroot) ; le serveur WebSocket, le code partagé (src/) et les dépendances sont HORS docroot : jamais servis par Apache
COPY web/ /var/www/html/
COPY server/ /opt/bramblekin/
COPY src/ /opt/bramblekin/src/
COPY --from=vendor /app/vendor/ /opt/bramblekin/vendor/
ENV BRAMBLE_AUTOLOAD=/opt/bramblekin/vendor/autoload.php
RUN mkdir -p /var/www/html/data/players && chown -R www-data:www-data /var/www/html/data

# Le serveur de jeu écrit les sauvegardes (players/) et le classement (ratings.json) ; le site ne lit que le classement
ENV BRAMBLE_DATA_DIR=/var/www/html/data
VOLUME /var/www/html/data
EXPOSE 80 8081
