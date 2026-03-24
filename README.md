# 🎮 Jeu d'Échecs Multiplayer en Ligne

Jeu d'échecs en temps réel pour deux joueurs avec Node.js, Express et Socket.io.

## 📋 Spécifications

### Backend (Node.js + Socket.io)
- ✅ Serveur Express écoute sur le port 3000
- ✅ WebSocket en temps réel avec Socket.io
- ✅ Système de "rooms" pour matcher les joueurs
- ✅ Validation des coups côté serveur (sécurité)
- ✅ Gestion des déconnexions
- ✅ Historique des coups

### Frontend (HTML/CSS/JS)
- ✅ Écran de matching (recherche d'adversaire)
- ✅ Échiquier 8x8 avec pièces Unicode
- ✅ Système de sélection drag & drop
- ✅ Affichage des coups possibles
- ✅ Historique des coups en temps réel
- ✅ Timer par joueur (10 minutes)
- ✅ Gestion des déconnexions
- ✅ Design responsive (desktop, tablette, mobile)

### Logique d'échecs
- ✅ Validation complète des règles
- ✅ Tous les types de pièces (pion, cavalier, fou, tour, dame, roi)
- ✅ Coups valides avec blocage des pièces
- ✅ Captures et coups spéciaux

## 🚀 Démarrage Rapide

### Installation
```bash
cd c:\Users\Enzo\Desktop\chess
npm install
```

### Lancement du serveur
```bash
npm start
```

Ou avec rechargement automatique (développement) :
```bash
npm run dev
```

### Accès au jeu
Ouvrez votre navigateur et rendez-vous sur :
```
http://localhost:3000
```

## 📁 Structure du Projet

```
chess/
├── package.json          # Dépendances Node.js
├── server.js             # Serveur Express + Socket.io
└── public/
    ├── index.html        # Interface HTML
    ├── styles.css        # Styles CSS
    └── script.js         # Logique client + Socket.io
```

## 🕹️ Flux de Jeu

1. **Connexion** → Le client se connecte au serveur
2. **Matching** → Cliquez sur "Chercher une partie"
3. **Attente** → Recherche d'un adversaire
4. **Jeu** → Quand deux joueurs sont trouvés :
   - Les blancs jouent en premier
   - Les joueurs alternent les coups
   - Chaque coup est validé côté serveur
   - L'historique est synchronisé en temps réel
5. **Fin** → Abandon, timeout, ou victoire

## 🔧 Architecture Socket.io

### Événements Client → Serveur

| Événement | Paramètres | Description |
|-----------|-----------|-------------|
| `joinGame` | - | Rejoindre la queue d'attente |
| `move` | `{fromRow, fromCol, toRow, toCol}` | Jouer un coup |
| `resign` | - | Abandonner la partie |
| `getGameState` | - | Demander l'état du jeu |

### Événements Serveur → Client

| Événement | Données | Description |
|-----------|---------|-------------|
| `waiting` | `{message}` | En attente d'un adversaire |
| `gameStart` | `{gameId, color, board, currentPlayer}` | Partie commencée |
| `moveUpdate` | `{board, currentPlayer, moveNotation, history}` | Coup joué |
| `invalidMove` | `{message}` | Coup rejeté |
| `gameEnd` | `{status, winner, message}` | Partie terminée |
| `opponentDisconnected` | `{message}` | Adversaire déconnecté |

## 🎯 Fonctionnalités Clés

### Validation des Coups
- ✅ Côté serveur pour éviter les tricheries
- ✅ Affichage des coups possibles côté client
- ✅ Blocage des coups impossibles

### Synchronisation en Temps Réel
- ✅ Mise à jour automatique du plateau
- ✅ Historique des coups synchronisé
- ✅ Indicateur du joueur au trait

### Gestion des Erreurs
- ✅ Déconnexions gracieuses
- ✅ Notifications d'erreurs
- ✅ Récupération de l'état du jeu

### Timer
- ✅ 10 minutes par joueur
- ✅ Affichage du temps restant
- ✅ Fin de partie au timeout

## 📱 Responsive Design

- **Desktop** : Layout 3 colonnes (infos, jeu, historique)
- **Tablette** : Layout 2 colonnes adapté
- **Mobile** : Layout 1 colonne avec navigation

## 🛠️ Technologie

- **Backend** : Node.js, Express, Socket.io
- **Frontend** : HTML5, CSS3, JavaScript ES6
- **Communication** : WebSocket (Socket.io)
- **Port** : 3000

## 📝 Fichiers Clés

### `server.js`
- Crée le serveur Express
- Initialise Socket.io
- Gère les connexions et matchings
- Valide les coups
- Synchronise l'état du jeu

### `public/index.html`
- Interface HTML sémantique
- 4 écrans : matching, attente, jeu, fin de partie
- Socket.io inclus automatiquement

### `public/styles.css`
- Design moderne et épuré
- Animations fluides
- Responsive et accessible
- Thème violet/bleu

### `public/script.js`
- Logique client Socket.io
- Rendu du plateau
- Gestion des clics
- Validation des coups (affichage)
- Gestion du timer

## 🐛 Débogage

- Ouvrez la console du navigateur (F12)
- Consultez les logs dans le terminal serveur
- Vérifiez la connexion Socket.io dans DevTools → Network → WS

## 🎓 Pour Aller Plus Loin

- Ajouter la détection du échec et échec et mat
- Système de notation complète (notation algébrique)
- Base de données pour l'historique des parties
- Authentification des joueurs
- Mode contre l'IA
- Replay des parties

---

**Développé en pur HTML/CSS/JavaScript avec Socket.io** 🚀
