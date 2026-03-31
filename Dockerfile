# ===========================
# DOCKERFILE - Jeu d'Échecs Multiplayer
# ===========================

# Image Node.js légère (LTS)
FROM node:20-alpine

# Répertoire de travail dans le conteneur
WORKDIR /app

# Copie uniquement les fichiers de dépendances en premier
# (optimisation du cache Docker)
COPY package*.json ./

# Installation des dépendances de production uniquement
RUN npm install --omit=dev

# Copie le reste du projet
COPY . .

# Port exposé (doit correspondre à celui dans server.js)
EXPOSE 3000

# Variable d'environnement pour le port (optionnel, valeur par défaut 3000)
ENV PORT=3000

# Démarrage direct avec node (pas nodemon en prod)
CMD ["node", "server.js"]
